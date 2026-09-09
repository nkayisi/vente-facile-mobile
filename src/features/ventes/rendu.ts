/**
 * Ce qui a DÉJÀ été rendu sur une vente, table et journal réunis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA MÊME MARCHANDISE POUVAIT ÊTRE RENDUE DEUX FOIS.                      │
 * │                                                                          │
 * │ Le formulaire de retour proposait la quantité VENDUE, sans regarder ce   │
 * │ qui avait déjà été rendu ; le serveur faisait la même comparaison, et    │
 * │ acceptait. Un client rendant deux flacons pouvait donc voir le retour    │
 * │ enregistré, approuvé, puis recommencé à l'identique : le stock revenait  │
 * │ deux fois en rayon et la caisse remboursait deux fois une marchandise    │
 * │ vendue une seule fois. Rien ne le signalait, et l'écart n'apparaissait   │
 * │ qu'à l'inventaire suivant - où il passait pour un vol.                   │
 * │                                                                          │
 * │ La règle vit désormais SUR LE SERVEUR (`SaleReturnCreateSerializer`) ;   │
 * │ ce module en est le miroir, pour que le comptoir refuse AVANT de mettre  │
 * │ en file plutôt qu'après, en quarantaine, le client parti.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Un retour REJETÉ ne consomme rien** : il n'a rien remis en stock ni
 * remboursé, la marchandise est encore là, et le client peut la rendre pour de
 * bon. Un BROUILLON, si : il est approuvable, et deux brouillons sur les mêmes
 * unités seraient tous deux approuvables.
 *
 * **Les retours ENCORE DANS LE JOURNAL comptent**, et c'est la même doctrine
 * que la réserve locale du comptoir : ses propres opérations en file, le
 * terminal les connaît mieux que quiconque. Sans cela, deux retours identiques
 * partent hors ligne, le serveur en applique un et refuse l'autre - après que
 * le commerçant a rendu l'argent.
 */
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { saleReturnItems, saleReturns } from "@/db/schema";
import { enAttenteParType, type EtatEnvoi } from "@/sync";

export interface RetourDeLaVente {
  id: string;
  reference: string;
  statut: string;
  montant: number;
  date: Date | null;
  envoi: EtatEnvoi;
}

export interface RenduDeLaVente {
  /** Par identifiant de LIGNE DE VENTE : ce qui est déjà rendu. */
  parLigne: Map<string, number>;
  /** Tous les retours de cette vente, rejets compris, pour l'historique. */
  retours: RetourDeLaVente[];
  /** Vrai dès qu'un retour de cette vente attend encore son envoi. */
  enAttente: boolean;
}

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function renduVide(): RenduDeLaVente {
  return { parLigne: new Map(), retours: [], enAttente: false };
}

export async function renduDeLaVente(venteId: string): Promise<RenduDeLaVente> {
  if (!venteId) return renduVide();

  const tires = await db
    .select({
      id: saleReturns.id,
      reference: saleReturns.reference,
      statut: saleReturns.status,
      montant: saleReturns.totalAmount,
      date: saleReturns.returnDate,
      supprime: saleReturns.isDeleted,
    })
    .from(saleReturns)
    .where(
      and(eq(saleReturns.originalSaleId, venteId), eq(saleReturns.isDeleted, false))
    );

  const parLigne = new Map<string, number>();
  const ajouter = (ligne: string, quantite: number) => {
    if (!ligne) return;
    parLigne.set(ligne, (parLigne.get(ligne) ?? 0) + quantite);
  };

  // Les lignes des retours qui CONSOMMENT : tout sauf les rejets.
  const consommateurs = tires.filter((r) => r.statut !== "rejected").map((r) => r.id);
  if (consommateurs.length > 0) {
    const lignes = await db
      .select({
        retour: saleReturnItems.saleReturnId,
        ligneVente: saleReturnItems.originalItemId,
        quantite: saleReturnItems.quantity,
      })
      .from(saleReturnItems)
      .where(inArray(saleReturnItems.saleReturnId, consommateurs));
    for (const l of lignes) ajouter(l.ligneVente, nb(l.quantite));
  }

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LES BLOQUÉS EN SONT.                                                 │
  // │                                                                      │
  // │ `blocked` n'est pas `quarantined` : l'acte est CONSERVÉ et repartira │
  // │ dès que l'abonnement sera réglé. Pendant tout le blocage - des jours,│
  // │ le temps qu'un marchand paie - la réserve ne retiendrait rien, et le │
  // │ comptoir laisserait rendre une seconde fois la même marchandise.     │
  // └──────────────────────────────────────────────────────────────────────┘
  type LigneJournal = { original_item?: string; quantity?: string; total?: string };
  const attentes = await enAttenteParType<{
    id: string;
    original_sale: string;
    items?: LigneJournal[];
  }>("sale_return.create", { avecBloquees: true });

  const dejaTires = new Set(tires.map((r) => r.id));
  const enFile = attentes.filter(
    (o) => o.payload.original_sale === venteId && !dejaTires.has(o.payload.id)
  );
  for (const o of enFile) {
    for (const l of o.payload.items ?? []) {
      ajouter(l.original_item ?? "", nb(l.quantity));
    }
  }

  const retours: RetourDeLaVente[] = [
    ...enFile.map((o) => ({
      id: o.payload.id,
      // Le serveur attribue la référence : ne pas en inventer une provisoire,
      // qui circulerait sur un papier et ne vaudrait rien.
      reference: "Référence à venir",
      statut: "draft",
      montant: (o.payload.items ?? []).reduce((t, l) => t + nb(l.total), 0),
      date: o.occurredAt,
      envoi: o.envoi,
    })),
    ...tires.map((r) => ({
      id: r.id,
      reference: r.reference,
      statut: r.statut,
      montant: nb(r.montant),
      date: r.date ?? null,
      envoi: "envoye" as EtatEnvoi,
    })),
  ];

  return { parLigne, retours, enAttente: enFile.length > 0 };
}

/** Ce qu'il reste à rendre sur une ligne. Jamais négatif. */
export function resteARendre(
  rendu: RenduDeLaVente,
  ligneVente: string,
  quantiteVendue: number
): number {
  return Math.max(0, quantiteVendue - (rendu.parLigne.get(ligneVente) ?? 0));
}
