/**
 * Les actes d'écriture sur le stock : déconditionner, transférer, ajuster.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE TRANSITION REFUSÉE NE SE RÉESSAIE JAMAIS.                           │
 * │                                                                          │
 * │ Expédier un transfert déjà expédié le réexpédierait, et le stock         │
 * │ sortirait deux fois. Le serveur rend donc un verdict `rejected` sur ces  │
 * │ refus, pas `retry` : l'opération part en quarantaine, dans « Opérations  │
 * │ à corriger », et le magasinier voit pourquoi.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Comme partout : **on n'écrit RIEN dans les tables tirées.** Ni le nouveau
 * statut du transfert, ni la quantité en rayon. Une expédition écrite
 * localement puis refusée laisserait un stock amputé que rien ne rétablirait.
 */
import * as Crypto from "expo-crypto";

import { enAttenteParType, enqueue } from "@/sync";

import {
  attentesPar,
  lotEnAttente,
  type Attentes,
  type LotEnAttente,
} from "@/features/sync/attente";

// Le corps de l'acte et son contrat de transport vivent dans le module PUR :
// ce fichier importe `@/sync`, qui ouvre la base SQLite au chargement, et rien
// de ce qu'il porte ne serait alors éprouvable sans appareil.
import {
  corpsJsonDuMouvement,
  type SaisieMouvement,
} from "@/features/stock/payload-mouvement";

export type { SaisieMouvement };

/** Une ligne de transfert, telle que le magasinier la saisit. */
export interface LigneSaisie {
  produit: string;
  /** Total en unité de détail. C'est ce que le serializer attend. */
  quantite: number;
  /** Contenants scellés, quand la saisie s'est faite en gros. */
  contenants?: number;
  /** Unités isolées. */
  vrac?: number;
}

/**
 * Le corps d'UNE ligne de transfert.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `quantity_requested` NE PART PAS QUAND UN CONTENANT EST SAISI.          │
 * │                                                                          │
 * │ Le serveur le RECOMPOSE lui-même (`data['quantity_requested'] =          │
 * │ to_base(...)`) dès qu'un des deux compteurs est renseigné. Le lui        │
 * │ souffler quand même faisait cohabiter deux vérités sur la même ligne :   │
 * │ inoffensif tant que le serveur écrase, faux le jour où sa condition ne   │
 * │ mord pas - elle teste la VÉRACITÉ (`if packages or loose`), donc un      │
 * │ « 0 contenant + 0 unité » retombait sur le total du client sans que rien │
 * │ ne le signale. Même discipline que `corpsJsonDuMouvement` : les clés     │
 * │ absentes sont OMISES, jamais posées à `null`.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `l.quantite` reste porté par la saisie pour la lecture LOCALE de la ligne en
 * attente : le journal ne rend que des identifiants, et une pièce qui attend
 * son envoi doit se relire.
 */
function corpsLigne(l: LigneSaisie) {
  const conditionne = l.contenants != null || l.vrac != null;
  return {
    product: l.produit,
    ...(conditionne ? {} : { quantity_requested: String(l.quantite) }),
    ...(l.contenants != null ? { package_quantity: String(l.contenants) } : {}),
    ...(l.vrac != null ? { loose_quantity: String(l.vrac) } : {}),
  };
}

export async function creerTransfert(saisie: {
  source: string;
  destination: string;
  lignes: LigneSaisie[];
  notes?: string;
}): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "stock_transfer.create", {
    id,
    source_warehouse: saisie.source,
    destination_warehouse: saisie.destination,
    notes: saisie.notes ?? "",
    items: saisie.lignes.map(corpsLigne),
  });
  return id;
}

export type TransitionTransfert = "approve" | "ship" | "receive" | "cancel";

/**
 * Fait avancer un transfert d'un cran.
 *
 * `lignesRecues` ne sert qu'à la réception, et porte ce que le magasinier a
 * RÉELLEMENT compté : une réception partielle est le cas courant, et retenir
 * la quantité expédiée ferait entrer en stock des articles restés sur le quai.
 */
export async function transitionTransfert(
  transfertId: string,
  transition: TransitionTransfert,
  lignesRecues?: { ligne: string; contenants?: number; vrac?: number; total?: number }[]
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, `stock_transfer.${transition}` as never, {
    id,
    transfer: transfertId,
    ...(transition === "receive" && lignesRecues
      ? {
          items: lignesRecues.map((l) => ({
            id: l.ligne,
            ...(l.contenants != null ? { package_quantity: String(l.contenants) } : {}),
            ...(l.vrac != null ? { loose_quantity: String(l.vrac) } : {}),
            ...(l.total != null ? { quantity_received: String(l.total) } : {}),
          })),
        }
      : {}),
  });
  return id;
}

export async function creerAjustement(saisie: {
  entrepot: string;
  type: string;
  motif: string;
  lignes: {
    produit: string;
    attendu: number;
    compte: number;
    contenantsComptes?: number;
    vracCompte?: number;
  }[];
}): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "stock_adjustment.create", {
    id,
    warehouse: saisie.entrepot,
    adjustment_type: saisie.type,
    reason: saisie.motif,
    items: saisie.lignes.map((l) => ({
      product: l.produit,
      quantity_expected: String(l.attendu),
      quantity_counted: String(l.compte),
      ...(l.contenantsComptes != null
        ? { counted_package_quantity: String(l.contenantsComptes) }
        : {}),
      ...(l.vracCompte != null
        ? { counted_loose_quantity: String(l.vracCompte) }
        : {}),
    })),
  });
  return id;
}

export async function transitionAjustement(
  ajustementId: string,
  transition: "approve" | "reject"
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, `stock_adjustment.${transition}` as never, {
    id,
    adjustment: ajustementId,
  });
  return id;
}

/**
 * Ouvre des conditionnements scellés.
 *
 * Geste de comptoir : le vendeur qui anticipe, ou le produit dont le
 * déconditionnement automatique est désactivé. Il doit marcher hors ligne.
 */
export async function deconditionner(
  stockId: string,
  contenants: number
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "stock.unpack", { id, stock: stockId, packages: contenants });
  return id;
}

/**
 * Ce que le journal retient pour ces objets, tant que le serveur n'a pas parlé.
 *
 * ⚠ `avecBloquees` est demandé, et ce n'est pas une lecture optimiste : elle
 * ne fait que FERMER des boutons de transition et écrire une phrase. Sans lui,
 * une approbation bloquée sort de la carte, le bouton se rouvre, et le
 * magasinier met en file une SECONDE approbation qui finira en quarantaine -
 * un refus qu'il n'a jamais provoqué.
 */
export async function enAttenteSurStock(): Promise<{
  transferts: Attentes;
  ajustements: Attentes;
  deconditionnements: Attentes;
}> {
  const avecBloquees = { avecBloquees: true } as const;
  const [creations, transitions, ajCreations, ajTransitions, unpacks] =
    await Promise.all([
      enAttenteParType<{ id: string }>("stock_transfer.create", avecBloquees),
      Promise.all(
        (["approve", "ship", "receive", "cancel"] as const).map((t) =>
          enAttenteParType<{ transfer: string }>(`stock_transfer.${t}`, avecBloquees)
        )
      ),
      enAttenteParType<{ id: string }>("stock_adjustment.create", avecBloquees),
      Promise.all(
        (["approve", "reject"] as const).map((t) =>
          enAttenteParType<{ adjustment: string }>(`stock_adjustment.${t}`, avecBloquees)
        )
      ),
      enAttenteParType<{ stock: string }>("stock.unpack", avecBloquees),
    ]);

  return {
    transferts: attentesPar([
      ...creations.map((o) => ({ id: o.payload.id, envoi: o.envoi })),
      ...transitions.flat().map((o) => ({ id: o.payload.transfer, envoi: o.envoi })),
    ]),
    ajustements: attentesPar([
      ...ajCreations.map((o) => ({ id: o.payload.id, envoi: o.envoi })),
      ...ajTransitions.flat().map((o) => ({ id: o.payload.adjustment, envoi: o.envoi })),
    ]),
    deconditionnements: attentesPar(
      unpacks.map((o) => ({ id: o.payload.stock, envoi: o.envoi }))
    ),
  };
}

/**
 * Entrée ou sortie de stock saisie à la main.
 *
 * Le corps vit dans le module PUR : les décimales en chaînes, les clés absentes
 * omises et jamais `null`, c'est un contrat de transport et il s'éprouve sans
 * appareil.
 */
export async function creerMouvement(saisie: SaisieMouvement): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "stock_movement.create", {
    id,
    ...corpsJsonDuMouvement(saisie),
  });
  return id;
}

/**
 * Les saisies de mouvement qui attendent leur envoi : combien, et dans quel état.
 *
 * Un LOT et non une carte par pièce : le journal des mouvements n'a aucun
 * bouton à fermer, il annonce seulement que son cadran et son document ne
 * comptent pas encore ces lignes - un total partiel présenté comme arrêté
 * serait un chiffre faux. L'ÉTAT, lui, décide de la phrase et du bouton :
 * proposer de synchroniser un lot bloqué enverrait chercher un réseau déjà là.
 */
export async function mouvementsEnAttente(): Promise<LotEnAttente> {
  return lotEnAttente(
    await enAttenteParType<{ id: string }>("stock_movement.create", {
      avecBloquees: true,
    })
  );
}
