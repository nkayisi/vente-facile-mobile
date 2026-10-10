/**
 * Réquisitions de produits : ce qu'il faut acheter.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ T12 DU RETOUR DE TEST. Et ce n'est PAS une commande d'achat :           │
 * │ `PurchaseOrder.supplier` est obligatoire côté serveur, alors qu'une      │
 * │ réquisition dit « il nous manque ceci » sans qu'on sache encore chez     │
 * │ qui l'acheter - c'est même souvent la question qu'on se pose en la       │
 * │ lisant.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA PROPOSITION SE CALCULE EN LOCAL, et c'est tout l'enjeu. Un rayon vide
 * se constate AU FOND DU DÉPÔT, là où il n'y a pas de réseau : faire dépendre
 * la liste d'un appel serveur rendrait la fonction inutilisable précisément là
 * où on en a besoin.
 *
 * ⚠ ET ELLE NE RÉÉCRIT AUCUN CRITÈRE. Le serveur retient
 * `track_inventory ET reorder_point > 0 ET quantity <= reorder_point` ; c'est
 * mot pour mot ce que `etatDuRayon` calcule déjà pour « bas » et « rupture ».
 * On réemploie donc `niveauxDeStock`, et un second critère écrit ici serait la
 * divergence que `data/etats-stock.ts` existe pour empêcher.
 */
import { and, desc, eq, like, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { products, requisitionItems, requisitions, units, warehouses } from "@/db/schema";
import { niveauxDeStock } from "./stock-niveaux";
import {
  proposerDepuisRayons,
  type LigneProposee,
} from "@/features/stock/proposition-requisition";
import { enAttenteParType, type EtatEnvoi } from "@/sync/outbox";

/** Le statut, et son libellé - ceux du serveur, jamais inventés. */
export const STATUT_REQUISITION: Record<string, string> = {
  draft: "Brouillon",
  submitted: "Soumise",
  approved: "Approuvée",
  rejected: "Rejetée",
  cancelled: "Annulée",
};

export interface LigneRequisition {
  id: string;
  produitId: string;
  produit: string;
  sku: string | null;
  unite: string | null;
  demande: number;
  /** Le stock AU MOMENT de la demande. Figé : il dit pourquoi on a demandé. */
  stockAlors: number;
  seuilAlors: number;
  note: string | null;
}

export interface Requisition {
  id: string;
  reference: string;
  statut: string;
  statutLabel: string;
  entrepotId: string | null;
  entrepot: string | null;
  notes: string | null;
  demandeLe: Date | null;
  decideLe: Date | null;
  notesDecision: string | null;
  nbLignes: number;
  /** Posé quand la pièce vit encore dans le journal, pas dans la table. */
  envoi?: EtatEnvoi;
}

/**
 * Les articles sous leur seuil, prêts à être réquisitionnés.
 *
 * ⚠ LA LECTURE EST LOCALE, ET C'EST TOUT L'ENJEU. Un rayon vide se constate AU
 * FOND DU DÉPÔT, là où il n'y a pas de réseau : faire dépendre la liste de
 * `GET /requisitions/proposer/` rendrait la fonction inutilisable précisément
 * là où on en a besoin. Le serveur garde son endpoint pour le back-office, et
 * les deux partent du MÊME critère (`proposerDepuisRayons`).
 */
export async function lignesProposees(
  entrepot: string,
  opts: { rupturesSeules?: boolean; recherche?: string } = {}
): Promise<LigneProposee[]> {
  // Les deux états, et il faut les deux : `bas` et `rupture` s'excluent côté
  // terminal, alors que le serveur compte la rupture DANS le bas
  // (`quantity <= reorder_point`, zéro inclus). N'en lire qu'un ferait manquer
  // les rayons vides, c'est-à-dire ceux qui manquent le plus.
  const [bas, vides] = await Promise.all([
    niveauxDeStock({ entrepot, recherche: opts.recherche, etat: "bas", limite: 300 }),
    niveauxDeStock({ entrepot, recherche: opts.recherche, etat: "rupture", limite: 300 }),
  ]);

  return proposerDepuisRayons(
    [...bas.elements, ...vides.elements].map((l) => ({
      produitId: l.produitId,
      produit: l.produit,
      sku: l.sku,
      unite: l.conditionnement?.retailWord ?? null,
      total: l.total,
      quantiteAffichee: l.quantiteAffichee,
      seuilReassort: l.seuilReassort,
      suitLeStock: l.suitLeStock,
    })),
    opts
  );
}

const UNITE = sql<string | null>`(select ${units.name} from ${units} where ${units.id} = ${products.unitId})`;

/**
 * Les réquisitions, fusionnées avec celles qui attendent leur envoi.
 *
 * ⚠ LA FUSION N'EST PAS UN CONFORT. Les tables tirées ne sont écrites que par
 * le tirage : une réquisition saisie au fond d'un dépôt vit dans le JOURNAL, et
 * sans cette fusion sa propre liste la déclarerait introuvable trois secondes
 * après sa création. C'est le corollaire systématique que ce dépôt a déjà payé
 * sur les retours, les devis et les ventes.
 */
export async function listeRequisitions(
  f: { entrepot?: string | null; statut?: string | null; recherche?: string } = {}
): Promise<Requisition[]> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const conditions = [
    or(eq(requisitions.isDeleted, false), sql`${requisitions.isDeleted} is null`),
    f.entrepot ? eq(requisitions.warehouseId, f.entrepot) : undefined,
    f.statut ? eq(requisitions.status, f.statut) : undefined,
    terme
      ? or(
          like(sql`lower(${requisitions.reference})`, `%${terme}%`),
          like(sql`lower(${requisitions.notes})`, `%${terme}%`)
        )
      : undefined,
  ].filter(Boolean);

  const lignes = await db
    .select({
      id: requisitions.id,
      reference: requisitions.reference,
      statut: requisitions.status,
      entrepotId: requisitions.warehouseId,
      entrepot: warehouses.name,
      notes: requisitions.notes,
      demandeLe: requisitions.requestedAt,
      decideLe: requisitions.decidedAt,
      notesDecision: requisitions.decisionNotes,
      nbLignes: sql<number>`(select count(*) from ${requisitionItems} where ${requisitionItems.requisitionId} = ${requisitions.id})`,
    })
    .from(requisitions)
    .leftJoin(warehouses, eq(warehouses.id, requisitions.warehouseId))
    .where(and(...conditions))
    .orderBy(desc(requisitions.requestedAt))
    .limit(200);

  const tirees: Requisition[] = lignes.map((l) => ({
    id: l.id,
    reference: l.reference ?? "",
    statut: l.statut ?? "draft",
    statutLabel: STATUT_REQUISITION[l.statut ?? "draft"] ?? (l.statut ?? ""),
    entrepotId: l.entrepotId,
    entrepot: l.entrepot,
    notes: l.notes,
    demandeLe: l.demandeLe,
    decideLe: l.decideLe,
    notesDecision: l.notesDecision,
    nbLignes: Number(l.nbLignes ?? 0),
  }));

  // Celles du journal, par leur RÉFÉRENCE : le serveur la reprend, donc une
  // pièce poussée puis redescendue ne se compterait pas deux fois.
  const vues = new Set(tirees.map((r) => r.reference));
  // ⚠ `avecBloquees` : une opération bloquée est CONSERVÉE et repartira dès
  // qu'un droit sera accordé. La masquer ferait recréer la même réquisition,
  // et le déblocage en enverrait deux.
  const enFile = await enAttenteParType<Record<string, unknown>>(
    "requisition.create",
    { avecBloquees: true }
  );
  const enAttente: Requisition[] = [];
  for (const op of enFile) {
    const corps = op.payload;
    const reference = String(corps.reference ?? "");
    if (reference && vues.has(reference)) continue;
    if (f.entrepot && corps.warehouse !== f.entrepot) continue;
    if (f.statut && f.statut !== "draft") continue;
    const items = Array.isArray(corps.items) ? corps.items : [];
    enAttente.push({
      id: (corps.id as string) ?? op.id,
      reference: reference || "—",
      statut: "draft",
      statutLabel: STATUT_REQUISITION.draft,
      entrepotId: (corps.warehouse as string) ?? null,
      entrepot: null,
      notes: (corps.notes as string) ?? null,
      demandeLe: op.occurredAt ?? null,
      envoi: op.envoi,
      decideLe: null,
      notesDecision: null,
      nbLignes: items.length,
    });
  }

  return [...enAttente, ...tirees];
}

/** Le détail d'une réquisition, avec ses lignes. */
export async function detailRequisition(
  id: string
): Promise<{ requisition: Requisition; lignes: LigneRequisition[] } | null> {
  const [entete] = await listeRequisitions().then((rs) =>
    rs.filter((r) => r.id === id)
  );
  if (!entete) return null;

  if (entete.envoi) {
    // Une pièce encore en file n'a pas de lignes EN TABLE : on rend ce dont on
    // est sûr, et l'écran le dit plutôt que d'afficher une section vide - qui
    // se lirait comme une réquisition sans article.
    return { requisition: entete, lignes: [] };
  }

  const lignes = await db
    .select({
      id: requisitionItems.id,
      produitId: requisitionItems.productId,
      produit: products.name,
      sku: products.sku,
      unite: UNITE,
      demande: requisitionItems.quantityRequested,
      stockAlors: requisitionItems.stockAtRequest,
      seuilAlors: requisitionItems.reorderPointAtRequest,
      note: requisitionItems.notes,
    })
    .from(requisitionItems)
    .leftJoin(products, eq(products.id, requisitionItems.productId))
    .where(eq(requisitionItems.requisitionId, id))
    .orderBy(products.name);

  return {
    requisition: entete,
    lignes: lignes.map((l) => ({
      id: l.id,
      produitId: l.produitId ?? "",
      produit: l.produit ?? "Article",
      sku: l.sku,
      unite: l.unite,
      demande: Number(l.demande ?? 0),
      stockAlors: Number(l.stockAlors ?? 0),
      seuilAlors: Number(l.seuilAlors ?? 0),
      note: l.note,
    })),
  };
}

/** Les tables que les écrans de réquisition surveillent. */
export const TABLES_REQUISITIONS = [
  "requisitions",
  "requisition_items",
  "stocks",
  "products",
  "outbox_operations",
];

export type { LigneProposee };
