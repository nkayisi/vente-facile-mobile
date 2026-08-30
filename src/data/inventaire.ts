/**
 * Sessions d'inventaire et feuille de comptage.
 * Miroir de `app/dashboard/inventory/` et `inventory/[id]/`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST LE MEILLEUR USAGE MOBILE DU PRODUIT : on compte DEBOUT dans le     │
 * │ rayon, souvent au fond d'un dépôt sans réseau. La feuille descend donc   │
 * │ avec sa session, et le comptage s'écrit dans le journal.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **L'attendu est celui de l'INSTANTANÉ**, figé au démarrage de la session,
 * avec sa part vrac. Le relire dans `stocks` donnerait le stock d'aujourd'hui,
 * qui a bougé depuis - et l'écart mesurerait alors les ventes de la journée
 * plutôt que le manquant.
 */
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  formatPackagedDifference,
  formatPackagedSplit,
  getPackaging,
  pluralizeUnit,
} from "@vente-facile/core";

import { db } from "@/db/client";
import {
  inventoryCounts,
  inventorySessions,
  products,
  units,
  warehouses,
} from "@/db/schema";

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

type Ton = "neutral" | "warning" | "primary" | "success" | "destructive";

/** Statuts d'une session, repris du back-office. */
export const STATUT_INVENTAIRE: Record<string, { label: string; ton: Ton }> = {
  draft: { label: "Brouillon", ton: "neutral" },
  in_progress: { label: "En cours", ton: "primary" },
  review: { label: "En révision", ton: "warning" },
  validated: { label: "Validé", ton: "success" },
  cancelled: { label: "Annulé", ton: "destructive" },
};

export const PERIMETRE_INVENTAIRE: Record<string, string> = {
  full: "Inventaire complet",
  category: "Par catégorie",
  product: "Par produit",
};

export interface SessionResume {
  id: string;
  reference: string;
  nom: string;
  entrepot: string | null;
  statut: string;
  perimetre: string;
  perimetreLabel: string;
  /** Lignes comptées sur total : c'est l'avancement du magasinier. */
  comptees: number;
  lignes: number;
  date: Date | null;
}

export async function listeSessions(
  f: { recherche?: string; statut?: string | null; limite?: number } = {}
): Promise<{ elements: SessionResume[]; total: number }> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;

  const conditions = [
    f.statut ? eq(inventorySessions.status, f.statut) : undefined,
    terme
      ? or(
          like(sql`lower(${inventorySessions.reference})`, motif),
          like(sql`lower(${inventorySessions.name})`, motif)
        )
      : undefined,
  ].filter(Boolean);

  const lignes = await db
    .select({
      id: inventorySessions.id,
      reference: inventorySessions.reference,
      nom: inventorySessions.name,
      statut: inventorySessions.status,
      perimetre: inventorySessions.scopeType,
      date: inventorySessions.createdAt,
      entrepot: warehouses.name,
    })
    .from(inventorySessions)
    .leftJoin(warehouses, eq(warehouses.id, inventorySessions.warehouseId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inventorySessions.createdAt))
    .limit(f.limite ?? 100);

  const total = new Map<string, number>();
  const comptees = new Map<string, number>();
  for (const c of await db
    .select({ id: inventoryCounts.sessionId, compte: inventoryCounts.isCounted })
    .from(inventoryCounts)) {
    total.set(c.id, (total.get(c.id) ?? 0) + 1);
    if (c.compte) comptees.set(c.id, (comptees.get(c.id) ?? 0) + 1);
  }

  const elements = lignes.map((s) => ({
    id: s.id,
    reference: s.reference,
    nom: s.nom,
    entrepot: s.entrepot ?? null,
    statut: s.statut,
    perimetre: s.perimetre,
    perimetreLabel: PERIMETRE_INVENTAIRE[s.perimetre] ?? s.perimetre,
    comptees: comptees.get(s.id) ?? 0,
    lignes: total.get(s.id) ?? 0,
    date: s.date ?? null,
  }));

  return { elements, total: elements.length };
}

export interface LigneComptage {
  id: string;
  produitId: string;
  produit: string;
  sku: string | null;
  /** Attendu, tel que figé à l'INSTANTANÉ du démarrage. */
  attenduAffiche: string;
  attendu: number;
  attenduVrac: number;
  compteAffiche: string;
  compte: number;
  compteContenants: number;
  compteVrac: number;
  /** « -2 casiers, +5 bouteilles ». Ventilé, jamais résumé. */
  ecartAffiche: string;
  ecart: number;
  estCompte: boolean;
  facteur: number | null;
  uniteDetail: string | null;
  uniteContenant: string | null;
}

export interface DetailSession {
  id: string;
  reference: string;
  nom: string;
  statut: string;
  perimetre: string;
  perimetreLabel: string;
  entrepot: string | null;
  entrepotId: string;
  notes: string;
  stockVerrouille: boolean;
  cree: Date | null;
  demarre: Date | null;
  soumis: Date | null;
  valide: Date | null;
  lignes: LigneComptage[];
  comptees: number;
  valeurEcart: number;
}

export async function detailSession(id: string): Promise<DetailSession | null> {
  const [s] = await db
    .select({ session: inventorySessions, entrepot: warehouses.name })
    .from(inventorySessions)
    .leftJoin(warehouses, eq(warehouses.id, inventorySessions.warehouseId))
    .where(eq(inventorySessions.id, id))
    .limit(1);
  if (!s) return null;

  const uniteDetail = alias(units, "unite_detail");
  const uniteContenant = alias(units, "unite_contenant");
  const lignes = await db
    .select({
      ligne: inventoryCounts,
      produit: products.name,
      sku: products.sku,
      sellingMode: products.sellingMode,
      unite: uniteDetail.name,
      uniteContenant: uniteContenant.name,
    })
    .from(inventoryCounts)
    .leftJoin(products, eq(products.id, inventoryCounts.productId))
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .where(eq(inventoryCounts.sessionId, id))
    .orderBy(asc(products.name));

  const rendues: LigneComptage[] = lignes.map((l) => {
    const c = l.ligne;
    const attendu = nb(c.quantityExpected);
    const attenduVrac = nb(c.expectedLooseQuantity);
    const compte = nb(c.quantityCounted);
    const compteVrac = nb(c.countedLooseQuantity);
    const compteContenants = nb(c.countedPackageQuantity);
    const ecart = nb(c.quantityDifference);
    const facteur = c.packagingFactor != null ? Number(c.packagingFactor) : null;
    const cond =
      facteur && facteur >= 2
        ? getPackaging({
            selling_mode: l.sellingMode,
            units_per_package: facteur,
            unit_name: l.unite,
            packaging_unit_name: l.uniteContenant,
          })
        : null;
    const attenduContenants = facteur ? (attendu - attenduVrac) / facteur : 0;
    const mot = (n: number) => pluralizeUnit(l.unite ?? "unité", n);

    return {
      id: c.id,
      produitId: c.productId,
      produit: l.produit ?? "Produit supprimé",
      sku: l.sku ?? null,
      attenduAffiche: cond
        ? formatPackagedSplit(cond, attenduContenants, attenduVrac)
        : `${attendu} ${mot(attendu)}`,
      attendu,
      attenduVrac,
      compteAffiche: cond
        ? formatPackagedSplit(cond, compteContenants, compteVrac)
        : `${compte} ${mot(compte)}`,
      compte,
      compteContenants,
      compteVrac,
      ecartAffiche: cond
        ? formatPackagedDifference(
            cond,
            compteContenants - attenduContenants,
            compteVrac - attenduVrac
          )
        : `${ecart > 0 ? "+" : ""}${ecart} ${mot(Math.abs(ecart))}`,
      ecart,
      estCompte: Boolean(c.isCounted),
      facteur: cond ? facteur : null,
      uniteDetail: cond?.retailWord ?? l.unite ?? null,
      uniteContenant: cond?.packageWord ?? null,
    };
  });

  const se = s.session;
  return {
    id: se.id,
    reference: se.reference,
    nom: se.name,
    statut: se.status,
    perimetre: se.scopeType,
    perimetreLabel: PERIMETRE_INVENTAIRE[se.scopeType] ?? se.scopeType,
    entrepot: s.entrepot ?? null,
    entrepotId: se.warehouseId,
    notes: se.notes ?? "",
    stockVerrouille: Boolean(se.isStockLocked),
    cree: se.createdAt ?? null,
    demarre: se.startedAt ?? null,
    soumis: se.completedAt ?? null,
    valide: se.validatedAt ?? null,
    lignes: rendues,
    comptees: rendues.filter((l) => l.estCompte).length,
    valeurEcart: nb(se.totalDifferenceValue),
  };
}
