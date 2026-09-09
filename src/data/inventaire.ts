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
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  formatPackagedDifference,
  formatPackagedSplit,
  getPackaging,
  pluralizeUnit,
} from "@vente-facile/core";

import { db } from "@/db/client";
import {
  categories,
  inventoryCounts,
  inventorySessions,
  products,
  stocks,
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

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ L'AGRÉGAT EST BORNÉ AUX SESSIONS LISTÉES, ET IL DESCEND EN SQL.       │
  // │                                                                        │
  // │ Il balayait TOUTES les lignes de comptage de la base - sans filtre,    │
  // │ sans agrégation, en les rapatriant une par une pour les compter en     │
  // │ mémoire. Une organisation qui a inventorié tout son catalogue une      │
  // │ dizaine de fois en porte des dizaines de milliers, relues à chaque     │
  // │ frappe dans la recherche, sur l'écran d'un terminal.                   │
  // │                                                                        │
  // │ Les sessions affichées sont au plus `limite` : c'est à elles seules    │
  // │ que l'avancement se rapporte.                                          │
  // └────────────────────────────────────────────────────────────────────────┘
  const ids = lignes.map((l) => l.id);
  const total = new Map<string, number>();
  const comptees = new Map<string, number>();
  if (ids.length > 0) {
    const agregats = await db
      .select({
        id: inventoryCounts.sessionId,
        lignes: sql<number>`count(*)`,
        comptees: sql<number>`sum(case when ${inventoryCounts.isCounted} then 1 else 0 end)`,
      })
      .from(inventoryCounts)
      .where(inArray(inventoryCounts.sessionId, ids))
      .groupBy(inventoryCounts.sessionId);
    for (const a of agregats) {
      total.set(a.id, Number(a.lignes));
      comptees.set(a.id, Number(a.comptees ?? 0));
    }
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

/**
 * Les quatre relevés du cadran, comptés sur TOUTE la table.
 *
 * ⚠ Le back-office les calcule sur `sessions.filter(...)`, c'est-à-dire sur
 * les vingt lignes de la page affichée : ses chiffres sont faux dès la page 2,
 * et un cadran qui ne compte que ce qu'on voit ne sert à rien - c'est
 * précisément ce qu'on vient y chercher quand la liste est longue. On copie
 * l'intention, pas le défaut.
 */
export async function relevesInventaire(): Promise<{
  enCours: number;
  enRevision: number;
  brouillons: number;
  valides: number;
}> {
  const lignes = await db
    .select({ statut: inventorySessions.status, n: sql<number>`count(*)` })
    .from(inventorySessions)
    .where(eq(inventorySessions.isDeleted, false))
    .groupBy(inventorySessions.status);

  const par = (code: string) =>
    Number(lignes.find((l) => l.statut === code)?.n ?? 0);

  return {
    enCours: par("in_progress"),
    enRevision: par("review"),
    brouillons: par("draft"),
    valides: par("validated"),
  };
}

// ------------------------------------------------- périmètre d'une session

/**
 * Le stock DISPONIBLE d'un entrepôt, en condition SQL.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SERVEUR OPPOSE `quantity > reserved_quantity`, PAS `quantity > 0`.    │
 * │                                                                          │
 * │ `InventorySessionCreateSerializer.validate` le fait trois fois : sur     │
 * │ l'entrepôt, sur les catégories et sur les produits. S'en écarter ici     │
 * │ ferait proposer un choix que le serveur refusera, et le magasinier       │
 * │ découvrirait le refus après coup, en quarantaine.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const disponibleDans = (entrepot: string) =>
  and(
    eq(stocks.warehouseId, entrepot),
    sql`cast(${stocks.quantity} as real) > cast(coalesce(${stocks.reservedQuantity}, 0) as real)`
  );

/** Un entrepôt porte-t-il de quoi inventorier ? Le serveur refuse sinon. */
export async function entrepotADuStock(entrepot: string): Promise<boolean> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(stocks)
    .where(disponibleDans(entrepot));
  return n > 0;
}

/**
 * Une entrée du périmètre, prête pour `ListeChoixMultiple`.
 *
 * `detail` porte ce qui lève l'ambiguïté : le nombre d'articles pour une
 * catégorie, le code pour un produit. Les deux lectures rendent la MÊME forme,
 * pour que le panneau de choix n'ait pas à savoir laquelle il affiche.
 */
export interface OptionPerimetre {
  id: string;
  nom: string;
  detail?: string;
}

/**
 * Les catégories qui ont du stock disponible dans cet entrepôt.
 *
 * Miroir de `getCategories(..., { warehouse, with_stock: true })` du
 * back-office. Une catégorie sans stock ici est refusée par le serveur avec
 * « Certaines catégories sélectionnées n'ont aucun produit en stock » : ne pas
 * la proposer vaut mieux que de la faire refuser.
 */
export async function categoriesInventoriables(
  entrepot: string
): Promise<OptionPerimetre[]> {
  const lignes = await db
    .select({
      id: categories.id,
      nom: categories.name,
      articles: sql<number>`count(distinct ${products.id})`,
    })
    .from(stocks)
    .innerJoin(products, eq(products.id, stocks.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(disponibleDans(entrepot), eq(products.isDeleted, false)))
    .groupBy(categories.id, categories.name)
    .orderBy(asc(categories.name));

  return lignes.map((l) => {
    const n = Number(l.articles);
    return {
      id: l.id,
      nom: l.nom,
      detail: `${n} ${n === 1 ? "article" : "articles"} en stock`,
    };
  });
}

/**
 * Les articles qui ont du stock disponible dans cet entrepôt.
 *
 * Le back-office cherche côté serveur avec un débat de 350 ms ; ici la
 * recherche est LOCALE, donc instantanée, et il n'y a rien à débattre. La
 * borne existe pour la même raison que partout : une liste de mille lignes ne
 * se parcourt pas au pouce.
 */
export async function articlesInventoriables(
  entrepot: string,
  recherche = "",
  limite = 40
): Promise<OptionPerimetre[]> {
  const terme = recherche.trim().toLowerCase();
  const motif = `%${terme}%`;

  const lignes = await db
    .select({
      id: products.id,
      nom: products.name,
      sku: products.sku,
      quantite: stocks.quantity,
    })
    .from(stocks)
    .innerJoin(products, eq(products.id, stocks.productId))
    .where(
      and(
        disponibleDans(entrepot),
        eq(products.isDeleted, false),
        terme
          ? or(
              like(sql`lower(coalesce(${products.name}, ''))`, motif),
              like(sql`lower(coalesce(${products.sku}, ''))`, motif),
              like(sql`lower(coalesce(${products.barcode}, ''))`, motif)
            )
          : undefined
      )
    )
    .orderBy(asc(products.name))
    .limit(limite);

  // Le SKU plutôt qu'un compteur : sur un article, c'est ce qui lève
  // l'ambiguïté entre deux libellés voisins.
  return lignes.map((l) => ({
    id: l.id,
    nom: l.nom,
    ...(l.sku ? { detail: l.sku } : {}),
  }));
}
