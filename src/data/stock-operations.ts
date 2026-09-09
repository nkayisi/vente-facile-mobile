/**
 * Transferts et ajustements de stock : listes et détails.
 * Miroir de `app/dashboard/stock/{transfers,adjustments}` et de leurs `[id]`.
 *
 * **L'écart d'un ajustement est VENTILÉ PAR CANAL**, jamais rendu en un seul
 * nombre : « -2 casiers, +5 bouteilles ». Un manquant de scellés et un surplus
 * d'unités isolées se compensent dans le total et y disparaissent ; ventilés,
 * chacun désigne sa cause. La virgule remplace le « + » pour qu'on ne lise pas
 * un signe comme une addition. C'est la règle du back-office, mot pour mot.
 *
 * **Un transfert se lit dans les termes de sa SAISIE** : le facteur figé sur
 * la ligne, jamais celui du produit aujourd'hui. Un produit repassé de 24 à 12
 * unités par casier ferait sinon diverger l'historique à chaque changement.
 */
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import {
  formatPackagedDifference,
  formatPackagedSplit,
  getPackaging,
  pluralizeUnit,
} from "@vente-facile/core";

import { db } from "@/db/client";
import {
  products,
  stockAdjustmentItems,
  stockAdjustments,
  stockTransferItems,
  stockTransfers,
  units,
  warehouses,
} from "@/db/schema";

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

type Ton = "neutral" | "warning" | "primary" | "success" | "destructive";

/** Statuts d'un transfert, repris du back-office mot pour mot. */
export const STATUT_TRANSFERT: Record<string, { label: string; ton: Ton }> = {
  draft: { label: "Brouillon", ton: "neutral" },
  pending: { label: "En attente", ton: "warning" },
  in_transit: { label: "En transit", ton: "primary" },
  completed: { label: "Terminé", ton: "success" },
  cancelled: { label: "Annulé", ton: "destructive" },
};

/** Statuts d'un ajustement. */
export const STATUT_AJUSTEMENT: Record<string, { label: string; ton: Ton }> = {
  draft: { label: "Brouillon", ton: "neutral" },
  pending: { label: "En attente", ton: "warning" },
  approved: { label: "Approuvé", ton: "success" },
  rejected: { label: "Rejeté", ton: "destructive" },
};

/** Motifs d'ajustement, choix du modèle serveur. */
export const TYPE_AJUSTEMENT: Record<string, string> = {
  count: "Inventaire",
  damage: "Dommage",
  theft: "Vol",
  expired: "Périmé",
  correction: "Correction",
  other: "Autre",
};

// ------------------------------------------------------------------ transferts

export interface TransfertResume {
  id: string;
  reference: string;
  source: string | null;
  destination: string | null;
  statut: string;
  nbLignes: number;
  date: Date | null;
}

export async function listeTransferts(
  f: { recherche?: string; statut?: string | null; limite?: number } = {}
): Promise<{ elements: TransfertResume[]; total: number }> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;
  const source = warehouses;
  const destination = { ...warehouses };

  const conditions = [
    f.statut ? eq(stockTransfers.status, f.statut) : undefined,
    terme ? like(sql`lower(${stockTransfers.reference})`, motif) : undefined,
  ].filter(Boolean);
  const filtre = conditions.length > 0 ? and(...conditions) : undefined;

  const lignes = await db
    .select({
      id: stockTransfers.id,
      reference: stockTransfers.reference,
      statut: stockTransfers.status,
      sourceId: stockTransfers.sourceWarehouseId,
      destinationId: stockTransfers.destinationWarehouseId,
      date: stockTransfers.requestedAt,
    })
    .from(stockTransfers)
    .where(filtre)
    .orderBy(desc(stockTransfers.requestedAt))
    .limit(f.limite ?? 100);

  // Un transfert relie DEUX entrepôts : deux jointures sur la même table se
  // font mal en Drizzle sans alias, et une requête par ligne serait un N+1.
  // On charge les entrepôts une fois, ils sont peu nombreux par construction.
  const noms = new Map(
    (await db.select({ id: warehouses.id, name: warehouses.name }).from(warehouses))
      .map((w) => [w.id, w.name] as const)
  );
  const compte = new Map<string, number>();
  for (const r of await db
    .select({ id: stockTransferItems.transferId })
    .from(stockTransferItems)) {
    compte.set(r.id, (compte.get(r.id) ?? 0) + 1);
  }

  const elements = lignes.map((t) => ({
    id: t.id,
    reference: t.reference,
    source: noms.get(t.sourceId) ?? null,
    destination: noms.get(t.destinationId) ?? null,
    statut: t.statut,
    nbLignes: compte.get(t.id) ?? 0,
    date: t.date ?? null,
  }));

  return { elements, total: elements.length };
}

export interface LigneTransfert {
  id: string;
  produit: string;
  sku: string | null;
  /** Ce qui a été DEMANDÉ, dans les termes de la saisie. */
  demandeAffiche: string;
  demande: number;
  expedie: number | null;
  recu: number | null;
  facteur: number | null;
  /**
   * Le partage ENREGISTRÉ de la ligne, canal par canal.
   *
   * ⚠ Il est LU, jamais redivisé : `expedie / facteur` redécouperait au
   * facteur du jour un envoi préparé sous un autre. `null` des deux côtés
   * quand aucun partage n'a été enregistré - il n'y a alors rien à proposer
   * par canal, et l'inventer serait pire que ne rien offrir.
   */
  contenantsExpedies: number | null;
  vracExpedie: number | null;
}

export interface DetailTransfert {
  id: string;
  reference: string;
  statut: string;
  source: string | null;
  destination: string | null;
  notes: string;
  demandeLe: Date | null;
  expedieLe: Date | null;
  recuLe: Date | null;
  lignes: LigneTransfert[];
}

export async function detailTransfert(id: string): Promise<DetailTransfert | null> {
  const [t] = await db
    .select()
    .from(stockTransfers)
    .where(eq(stockTransfers.id, id))
    .limit(1);
  if (!t) return null;

  const noms = new Map(
    (await db.select({ id: warehouses.id, name: warehouses.name }).from(warehouses))
      .map((w) => [w.id, w.name] as const)
  );

  const lignes = await db
    .select({
      id: stockTransferItems.id,
      quantityRequested: stockTransferItems.quantityRequested,
      quantityShipped: stockTransferItems.quantityShipped,
      quantityReceived: stockTransferItems.quantityReceived,
      packageQuantity: stockTransferItems.packageQuantity,
      looseQuantity: stockTransferItems.looseQuantity,
      packagingFactor: stockTransferItems.packagingFactor,
      produit: products.name,
      sku: products.sku,
      sellingMode: products.sellingMode,
      unite: units.name,
    })
    .from(stockTransferItems)
    .leftJoin(products, eq(products.id, stockTransferItems.productId))
    .leftJoin(units, eq(units.id, products.unitId))
    .where(eq(stockTransferItems.transferId, id))
    .orderBy(asc(stockTransferItems.createdAt));

  return {
    id: t.id,
    reference: t.reference,
    statut: t.status,
    source: noms.get(t.sourceWarehouseId) ?? null,
    destination: noms.get(t.destinationWarehouseId) ?? null,
    notes: t.notes ?? "",
    demandeLe: t.requestedAt ?? null,
    expedieLe: t.shippedAt ?? null,
    recuLe: t.receivedAt ?? null,
    lignes: lignes.map((l) => {
      const demande = nb(l.quantityRequested);
      const facteur = l.packagingFactor != null ? Number(l.packagingFactor) : null;
      const cond =
        facteur && facteur >= 2
          ? getPackaging({
              selling_mode: l.sellingMode,
              units_per_package: facteur,
              unit_name: l.unite,
            })
          : null;
      const paquets = nb(l.packageQuantity);
      const vrac = nb(l.looseQuantity);
      return {
        id: l.id,
        produit: l.produit ?? "Produit supprimé",
        sku: l.sku ?? null,
        demandeAffiche:
          cond && (paquets > 0 || vrac > 0)
            ? formatPackagedSplit(cond, paquets, vrac)
            : `${demande} ${pluralizeUnit(l.unite ?? "unité", demande)}`,
        demande,
        // `null` ne se lit JAMAIS comme zéro : « pas encore expédié » et
        // « expédié : rien » ne se disent pas de la même façon.
        expedie: l.quantityShipped != null ? nb(l.quantityShipped) : null,
        recu: l.quantityReceived != null ? nb(l.quantityReceived) : null,
        facteur: cond ? facteur : null,
        contenantsExpedies: l.packageQuantity != null ? paquets : null,
        vracExpedie: l.looseQuantity != null ? vrac : null,
      };
    }),
  };
}

// ----------------------------------------------------------------- ajustements

export interface AjustementResume {
  id: string;
  reference: string;
  entrepot: string | null;
  type: string;
  typeLabel: string;
  statut: string;
  nbLignes: number;
  date: Date | null;
}

export async function listeAjustements(
  f: { recherche?: string; statut?: string | null; limite?: number } = {}
): Promise<{ elements: AjustementResume[]; total: number }> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;

  const conditions = [
    f.statut ? eq(stockAdjustments.status, f.statut) : undefined,
    terme
      ? or(
          like(sql`lower(${stockAdjustments.reference})`, motif),
          like(sql`lower(${stockAdjustments.reason})`, motif)
        )
      : undefined,
  ].filter(Boolean);

  const lignes = await db
    .select({
      id: stockAdjustments.id,
      reference: stockAdjustments.reference,
      type: stockAdjustments.adjustmentType,
      statut: stockAdjustments.status,
      date: stockAdjustments.createdAt,
      entrepot: warehouses.name,
    })
    .from(stockAdjustments)
    .leftJoin(warehouses, eq(warehouses.id, stockAdjustments.warehouseId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(stockAdjustments.createdAt))
    .limit(f.limite ?? 100);

  const compte = new Map<string, number>();
  for (const r of await db
    .select({ id: stockAdjustmentItems.adjustmentId })
    .from(stockAdjustmentItems)) {
    compte.set(r.id, (compte.get(r.id) ?? 0) + 1);
  }

  const elements = lignes.map((a) => ({
    id: a.id,
    reference: a.reference,
    entrepot: a.entrepot ?? null,
    type: a.type,
    typeLabel: TYPE_AJUSTEMENT[a.type] ?? a.type,
    statut: a.statut,
    nbLignes: compte.get(a.id) ?? 0,
    date: a.date ?? null,
  }));

  return { elements, total: elements.length };
}

export interface LigneAjustement {
  id: string;
  produit: string;
  sku: string | null;
  attenduAffiche: string;
  compteAffiche: string;
  /** « -2 casiers, +5 bouteilles ». Ventilé, jamais résumé en un nombre. */
  ecartAffiche: string;
  ecart: number;
  coutUnitaire: number;
}

export interface DetailAjustement {
  id: string;
  reference: string;
  statut: string;
  type: string;
  typeLabel: string;
  motif: string;
  entrepot: string | null;
  cree: Date | null;
  approuveLe: Date | null;
  lignes: LigneAjustement[];
  /** Valeur de l'écart, positive ou négative. */
  valeurEcart: number;
}

export async function detailAjustement(id: string): Promise<DetailAjustement | null> {
  const [a] = await db
    .select({ ajustement: stockAdjustments, entrepot: warehouses.name })
    .from(stockAdjustments)
    .leftJoin(warehouses, eq(warehouses.id, stockAdjustments.warehouseId))
    .where(eq(stockAdjustments.id, id))
    .limit(1);
  if (!a) return null;

  const lignes = await db
    .select({
      id: stockAdjustmentItems.id,
      counted: stockAdjustmentItems.quantityCounted,
      expected: stockAdjustmentItems.quantityExpected,
      difference: stockAdjustmentItems.quantityDifference,
      countedLoose: stockAdjustmentItems.countedLooseQuantity,
      expectedLoose: stockAdjustmentItems.expectedLooseQuantity,
      countedPackages: stockAdjustmentItems.countedPackageQuantity,
      packagingFactor: stockAdjustmentItems.packagingFactor,
      unitCost: stockAdjustmentItems.unitCost,
      produit: products.name,
      sku: products.sku,
      sellingMode: products.sellingMode,
      unite: units.name,
    })
    .from(stockAdjustmentItems)
    .leftJoin(products, eq(products.id, stockAdjustmentItems.productId))
    .leftJoin(units, eq(units.id, products.unitId))
    .where(eq(stockAdjustmentItems.adjustmentId, id))
    .orderBy(asc(stockAdjustmentItems.createdAt));

  const rendues = lignes.map((l) => {
    const attendu = nb(l.expected);
    const compte = nb(l.counted);
    const ecart = nb(l.difference);
    const facteur = l.packagingFactor != null ? Number(l.packagingFactor) : null;
    const cond =
      facteur && facteur >= 2
        ? getPackaging({
            selling_mode: l.sellingMode,
            units_per_package: facteur,
            unit_name: l.unite,
          })
        : null;

    const vracCompte = l.countedLoose != null ? nb(l.countedLoose) : null;
    const paquetsComptes =
      l.countedPackages != null
        ? nb(l.countedPackages)
        : facteur && vracCompte != null
          ? (compte - vracCompte) / facteur
          : null;
    // L'attendu porte SA PROPRE part vrac, relevée côté serveur à la création.
    // Sans elle, l'écran redécouperait le stock théorique au facteur et
    // comparerait à un attendu qui n'a jamais existé.
    const vracAttendu = l.expectedLoose != null ? nb(l.expectedLoose) : null;
    const paquetsAttendus =
      facteur && vracAttendu != null ? (attendu - vracAttendu) / facteur : null;

    const mot = (n: number) => pluralizeUnit(l.unite ?? "unité", n);

    return {
      id: l.id,
      produit: l.produit ?? "Produit supprimé",
      sku: l.sku ?? null,
      attenduAffiche:
        cond && paquetsAttendus != null && vracAttendu != null
          ? formatPackagedSplit(cond, paquetsAttendus, vracAttendu)
          : `${attendu} ${mot(attendu)}`,
      compteAffiche:
        cond && paquetsComptes != null && vracCompte != null
          ? formatPackagedSplit(cond, paquetsComptes, vracCompte)
          : `${compte} ${mot(compte)}`,
      ecartAffiche:
        cond && paquetsComptes != null && vracCompte != null &&
        paquetsAttendus != null && vracAttendu != null
          ? formatPackagedDifference(
              cond,
              paquetsComptes - paquetsAttendus,
              vracCompte - vracAttendu
            )
          : `${ecart > 0 ? "+" : ""}${ecart} ${mot(Math.abs(ecart))}`,
      ecart,
      coutUnitaire: nb(l.unitCost),
    };
  });

  const s = a.ajustement;
  return {
    id: s.id,
    reference: s.reference,
    statut: s.status,
    type: s.adjustmentType,
    typeLabel: TYPE_AJUSTEMENT[s.adjustmentType] ?? s.adjustmentType,
    motif: s.reason ?? "",
    entrepot: a.entrepot ?? null,
    cree: s.createdAt ?? null,
    approuveLe: s.approvedAt ?? null,
    lignes: rendues,
    valeurEcart: rendues.reduce((t, l) => t + l.ecart * l.coutUnitaire, 0),
  };
}
