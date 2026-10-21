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
import { requisitionsDejaTirees } from "./deja-tirees";
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
  f: {
    entrepot?: string | null;
    statut?: string | null;
    recherche?: string;
    /**
     * La FENÊTRE, pas une page.
     *
     * ┌────────────────────────────────────────────────────────────────────────┐
     * │ UNE FENÊTRE QUI S'AGRANDIT, JAMAIS UNE PAGINATION PAR RANG.           │
     * │                                                                        │
     * │ Cet écran se relit à chaque changement de table (`useLecture`) : un     │
     * │ rang de départ figerait une position dans un classement qui bouge, et   │
     * │ une réquisition insérée par le tirage ferait répéter ou sauter une      │
     * │ ligne. C'est le raisonnement déjà écrit pour l'historique des ventes.   │
     * └────────────────────────────────────────────────────────────────────────┘
     */
    limite?: number;
  } = {}
): Promise<{ elements: Requisition[]; total: number }> {
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
    .limit(f.limite ?? 50);

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

  // ⚠ `avecBloquees` : une opération bloquée est CONSERVÉE et repartira dès
  // qu'un droit sera accordé. La masquer ferait recréer la même réquisition,
  // et le déblocage en enverrait deux.
  const enFile = await enAttenteParType<Record<string, unknown>>(
    "requisition.create",
    { avecBloquees: true }
  );

  // ┌──────────────────────────────────────────────────────────────────────────┐
  // │ LE DÉDOUBLONNAGE SE FAIT CONTRE LA TABLE, JAMAIS CONTRE LA FENÊTRE.     │
  // │                                                                          │
  // │ Il se faisait sur `tirees`, qui est la fenêtre : une réquisition poussée │
  // │ dont la ligne tirée tombe au-delà était rendue DEUX FOIS - même `id`,    │
  // │ donc deux clés identiques dans la liste virtualisée - et comptée deux    │
  // │ fois dans `total`, qui porte le périmètre. Le pied annonçait « 50 sur    │
  // │ 51 » et tirait une fenêtre de plus pour rien, sur la liste dont le       │
  // │ métier est précisément de compter ce qui manque.                         │
  // │                                                                          │
  // │ Le serveur reprend l'identifiant ET la référence du terminal, et la      │
  // │ poussée remet l'opération en `pending` quand la réponse se perd APRÈS    │
  // │ application : un tirage ramène alors la pièce pendant qu'elle est encore │
  // │ dans le journal. Voir `data/deja-tirees.ts`.                             │
  // └──────────────────────────────────────────────────────────────────────────┘
  const vues = await requisitionsDejaTirees(
    enFile.map((op) => String(op.payload.reference ?? ""))
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

  // ⚠ LE TOTAL PORTE LE PÉRIMÈTRE, JAMAIS LA FENÊTRE. La liste s'arrêtait à
  //   deux cents lignes SANS RIEN DIRE : au-delà, les réquisitions n'étaient
  //   atteignables par aucun geste, et le magasinier concluait qu'elles avaient
  //   disparu. C'est le défaut déjà payé sur « Mouvements (30) ».
  const [compte] = await db
    .select({ n: sql<number>`count(*)` })
    .from(requisitions)
    .where(and(...conditions));

  return {
    elements: [...enAttente, ...tirees],
    total: Number(compte?.n ?? 0) + enAttente.length,
  };
}

/**
 * Le détail d'une réquisition, avec ses lignes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ UNE LECTURE CIBLÉE, PAS UN FILTRE SUR LA LISTE.                             │
 * │                                                                              │
 * │ Cette fonction chargeait `listeRequisitions()` SANS AUCUN FILTRE - donc deux │
 * │ cents lignes, un `count(*)` corrélé par ligne et la fusion de tout le        │
 * │ journal - puis filtrait en JavaScript par identifiant. Au-delà de la         │
 * │ fenêtre, `entete` sortait `undefined` et l'écran déclarait la pièce          │
 * │ INTROUVABLE pendant que le magasinier tenait son bordereau imprimé.          │
 * │                                                                              │
 * │ Les trois chemins qui y menaient : un `action_url` de notification, un lien  │
 * │ profond, et toute organisation qui dépasse la fenêtre. C'est le défaut       │
 * │ « introuvable par sa propre liste » que la docstring de ce fichier cite      │
 * │ elle-même, et le motif du correctif est celui de `detailDepense`.            │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
export async function detailRequisition(
  id: string
): Promise<{ requisition: Requisition; lignes: LigneRequisition[] } | null> {
  const [ligne] = await db
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
    // ⚠ LE MÊME FILTRE QUE LA LISTE, et il manquait. La lecture ciblée qui a
    //   remplacé l'ancien filtrage de liste a perdu la suppression douce : une
    //   réquisition dont le tirage a ramené la pierre tombale restait pleinement
    //   ouvrable par un `action_url` de notification ou un lien profond, avec
    //   ses boutons de transition. Filtrée, la pièce tombe sur `ficheEnFile`,
    //   qui rend `null` - l'ordre est déjà le bon.
    .where(
      and(
        eq(requisitions.id, id),
        or(eq(requisitions.isDeleted, false), sql`${requisitions.isDeleted} is null`)
      )
    )
    .limit(1);

  // Rien en table : la pièce vit peut-être encore dans le journal.
  if (!ligne) return ficheEnFile(id);

  const entete: Requisition = {
    id: ligne.id,
    reference: ligne.reference ?? "",
    statut: ligne.statut ?? "draft",
    statutLabel: STATUT_REQUISITION[ligne.statut ?? "draft"] ?? (ligne.statut ?? ""),
    entrepotId: ligne.entrepotId,
    entrepot: ligne.entrepot,
    notes: ligne.notes,
    demandeLe: ligne.demandeLe,
    decideLe: ligne.decideLe,
    notesDecision: ligne.notesDecision,
    nbLignes: Number(ligne.nbLignes ?? 0),
  };

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

/**
 * La fiche d'une réquisition qui vit encore dans le JOURNAL.
 *
 * ⚠ ELLE NE REND AUCUNE LIGNE, ET L'ÉCRAN LE DIT. Les lignes vivent dans le
 * corps de l'opération, pas dans une table lisible : afficher une section vide
 * se lirait comme une réquisition sans article. C'est la règle déjà posée sur
 * la fiche d'une vente en attente.
 */
async function ficheEnFile(
  id: string
): Promise<{ requisition: Requisition; lignes: LigneRequisition[] } | null> {
  // ⚠ `avecBloquees` : une opération bloquée est CONSERVÉE et repartira dès
  //   qu'un droit sera accordé. La masquer ferait déclarer introuvable une
  //   pièce que le magasinier vient de créer.
  const enFile = await enAttenteParType<Record<string, unknown>>(
    "requisition.create",
    { avecBloquees: true }
  );
  const op = enFile.find((o) => (o.payload.id as string) === id || o.id === id);
  if (!op) return null;

  const corps = op.payload;
  const items = Array.isArray(corps.items) ? corps.items : [];
  return {
    requisition: {
      id: (corps.id as string) ?? op.id,
      // Le numéro d'appareil, DÉFINITIF dès l'impression : c'est lui qui
      // permet de réimprimer le bordereau sans attendre le réseau.
      reference: String(corps.reference ?? "") || "—",
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
    },
    lignes: [],
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
