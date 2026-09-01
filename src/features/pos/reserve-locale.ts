/**
 * Ce que le terminal a DÉJÀ vendu sans que le serveur le sache encore.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN TERMINAL HORS LIGNE VENDAIT DIX FOIS LE DERNIER ARTICLE.             │
 * │                                                                          │
 * │ Les tables tirées ne sont écrites que par le TIRAGE : une vente en file  │
 * │ n'a pas décrémenté `stocks`. Le comptoir opposait donc le stock du       │
 * │ dernier tirage à chaque nouveau client, et le même dernier casier se     │
 * │ vendait autant de fois qu'il se présentait d'acheteurs. Toutes ces       │
 * │ ventes partent, le serveur en applique une et refuse les autres - après  │
 * │ impression, clients partis.                                              │
 * │                                                                          │
 * │ Ce module est le seul cas du chantier où la donnée locale est            │
 * │ AUTORITAIRE : ses propres opérations en file, le terminal les connaît    │
 * │ mieux que quiconque. On REFUSE, on n'avertit pas.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES DEUX COMPTEURS SONT RENDUS, JAMAIS LEUR SOMME.                      │
 * │                                                                          │
 * │ Le corps d'une vente porte la SAISIE du caissier (contenants et unités), │
 * │ pas un total : c'est le serveur qui convertit. Additionner ici avec le   │
 * │ facteur d'aujourd'hui reviendrait à réécrire son arithmétique. On rend   │
 * │ donc les compteurs tels quels, et l'appelant - qui tient le produit,     │
 * │ donc son conditionnement - les retranche par `remainingChannels`, la     │
 * │ fonction du noyau qui rejoue l'ordre du serveur (scellé d'abord, puis    │
 * │ ouverture d'un contenant pour servir le détail qui manque).              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES OPÉRATIONS BLOQUÉES COMPTENT, ET C'EST LE CAS QUI DURE LE PLUS.     │
 * │                                                                          │
 * │ `blocked` n'est pas `quarantined` : l'opération est CONSERVÉE et repart  │
 * │ telle quelle dès que l'abonnement est réglé ou le droit accordé. La      │
 * │ marchandise, elle, est déjà partie avec le client. Ne pas la retenir     │
 * │ rouvrait ce défaut pendant TOUTE la durée du blocage - des jours, le     │
 * │ temps qu'un marchand paie son abonnement - et sur toutes les ventes de   │
 * │ cette période à la fois, pas seulement la dernière. D'où `avecBloquees`. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Une opération APPLIQUÉE est sortie de la liste, et le tirage suivant apporte
 * le vrai stock. La fenêtre où les deux se cumulent - opération appliquée,
 * tirage pas encore passé - rend le comptoir momentanément plus STRICT, jamais
 * plus permissif. Une opération en QUARANTAINE en sort aussi : le serveur l'a
 * refusée, elle ne sortira jamais de stock, et la retenir bloquerait un article
 * que personne n'a acheté.
 */
import { inArray } from "drizzle-orm";

import type { SalePayload } from "@vente-facile/core/pos";

import { db } from "@/db/client";
import { printJobs } from "@/db/schema";
import { enAttenteParType } from "@/sync";

/** Ce qu'une ou plusieurs ventes en file consomment, pour un produit. */
export interface ReserveLigne {
  /** Contenants scellés déjà vendus. */
  packages: number;
  /** Unités de détail déjà vendues, contenants exclus. */
  loose: number;
}

export type ReserveLocale = Map<string, ReserveLigne>;

const nombre = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Une vente en file concerne-t-elle cet entrepôt ?
 *
 * `buildSalePayload` omet `warehouse` quand la caisse n'en a pas. Deux ventes
 * sans entrepôt se comparent alors entre elles, et jamais à une vente située :
 * imputer une vente d'entrepôt inconnu à l'entrepôt courant retirerait du stock
 * à un dépôt qui ne l'a pas vendu.
 */
function memeEntrepot(payload: SalePayload, warehouseId: string | null | undefined): boolean {
  return (payload.warehouse ?? null) === (warehouseId ?? null);
}

/**
 * Ce que les ventes en attente d'envoi retiennent, produit par produit.
 *
 * Les paniers MIS EN ATTENTE n'y sont pas, et c'est voulu : un panier rangé est
 * une intention, pas une vente. Il n'a rien décrémenté, sa reprise repasse par
 * `verifierAjout`, et le compter ici bloquerait un stock que personne n'a acheté.
 */
export async function reservesEnAttente(
  warehouseId: string | null | undefined
): Promise<ReserveLocale> {
  const operations = await enAttenteParType<SalePayload>("sale.create", {
    avecBloquees: true,
  });
  const reserve: ReserveLocale = new Map();

  for (const { payload } of operations) {
    if (!payload || !Array.isArray(payload.items)) continue;
    if (!memeEntrepot(payload, warehouseId)) continue;

    for (const item of payload.items) {
      if (!item?.product) continue;
      const courant = reserve.get(item.product) ?? { packages: 0, loose: 0 };
      courant.packages += nombre(item.package_quantity);
      // `quantity` est déjà en unité de détail (produit sans conditionnement,
      // ou conditionnement retiré depuis) : il rejoint le vrac. Le lire comme
      // des contenants multiplierait la retenue par le facteur.
      courant.loose += nombre(item.loose_quantity) + nombre(item.quantity);
      reserve.set(item.product, courant);
    }
  }

  return reserve;
}

/**
 * La dette que les ventes à CRÉDIT en file ajouteront au compte d'un client,
 * ventilée par devise.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MONTANT VIENT DU TICKET RANGÉ, IL N'EST PAS RECALCULÉ.               │
 * │                                                                          │
 * │ Le corps d'une vente ne porte aucun total : les refaire ici serait une   │
 * │ troisième arithmétique de vente, celle qui finit par annoncer un chiffre │
 * │ que ni l'écran ni le serveur ne reconnaissent. Le comptoir range déjà le │
 * │ document avant de vider le panier (`print_jobs`), avec le restant dû     │
 * │ EXACT que le client a sur son papier. Même règle qu'au hub Ventes.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Rendu PAR DEVISE, jamais sommé : `current_balance` est tenu en devise
 * principale et une facture peut être libellée ailleurs. C'est l'appelant, qui
 * tient la table des devises, qui convertit.
 */
export async function detteEnAttente(
  customerId: string | null | undefined
): Promise<Map<string, number>> {
  const parDevise = new Map<string, number>();
  if (!customerId) return parDevise;

  const operations = await enAttenteParType<SalePayload & { reference?: string }>(
    "sale.create",
    // Même lecture conservatrice que la réserve : une vente à crédit bloquée
    // sera portée au compte du client, et son plafond doit en tenir compte dès
    // maintenant. L'ignorer laisserait repartir le même client autant de fois
    // que dure le blocage.
    { avecBloquees: true }
  );
  const references = operations
    .filter((o) => o.payload?.customer === customerId && o.payload?.sale_type === "credit")
    .map((o) => o.payload.reference)
    .filter(Boolean) as string[];

  if (references.length === 0) return parDevise;

  const lignes = await db
    .select({ numero: printJobs.documentNumber, data: printJobs.data })
    .from(printJobs)
    .where(inArray(printJobs.documentNumber, references));

  for (const ligne of lignes) {
    try {
      const ticket = JSON.parse(ligne.data) as { amountDue?: number; currency?: string };
      const du = Number(ticket.amountDue);
      if (!Number.isFinite(du) || du <= 0 || !ticket.currency) continue;
      parDevise.set(ticket.currency, (parDevise.get(ticket.currency) ?? 0) + du);
    } catch {
      // Un document illisible ne doit pas empêcher de vendre. Il rend le
      // contrôle de crédit moins strict, ce que le serveur rattrapera.
    }
  }

  return parDevise;
}
