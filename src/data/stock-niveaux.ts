/**
 * Niveaux de stock, et le détail d'une ligne.
 * Miroir de `app/dashboard/stock/stock-levels/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN RAYON QUI PORTE 3 CASIERS ET 7 BOUTEILLES NE SE PRÉSENTE JAMAIS       │
 * │ COMME « 43 ». Et sa réciproque, tout aussi contraignante : là où le      │
 * │ partage réel n'est pas enregistré, ON NE L'INVENTE PAS.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les deux compteurs sont LUS sur la ligne (`package_quantity`,
 * `loose_quantity`), jamais redivisés au facteur du jour. Redécouper le total
 * donnerait « 4 casiers + 3 bouteilles » pour un rayon qui en porte 3 et 27 :
 * une contrevérité d'autant plus trompeuse qu'elle a l'air exacte.
 *
 * **Le DISPONIBLE impute les réservations exactement comme le contrôle de
 * vente** (`availableSplit` de `@vente-facile/core`) : ce qui s'affiche comme
 * disponible est exactement ce que le comptoir acceptera.
 *
 * **Le filtre `bas` reprend le critère de l'action `low-stock` du serveur.**
 * S'en écarter ferait diverger l'écran de la liste qui le déclenche.
 */
import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  availableSplit,
  formatPackagedSplit,
  getPackaging,
  pluralizeUnit,
} from "@vente-facile/core";

import { db } from "@/db/client";
import { brands, categories, products, stocks, units, warehouses } from "@/db/schema";

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Les trois états du back-office, mot pour mot. */
export type EtatStock = "tous" | "bas" | "rupture" | "ok";

export const ETAT_STOCK: Record<
  Exclude<EtatStock, "tous">,
  { label: string; ton: "destructive" | "warning" | "success" }
> = {
  rupture: { label: "Rupture", ton: "destructive" },
  bas: { label: "Stock bas", ton: "warning" },
  ok: { label: "En stock", ton: "success" },
};

export interface LigneNiveau {
  id: string;
  produitId: string;
  produit: string;
  sku: string | null;
  categorie: string | null;
  entrepot: string | null;
  entrepotId: string | null;

  /** « 3 casiers + 7 bouteilles », partage LU. */
  quantiteAffichee: string;
  /** Disponible, réservations imputées comme au comptoir. */
  disponibleAffiche: string;
  /** Total en unités de détail. Null n'est PAS zéro. */
  total: number;
  reserve: number;
  /** Null quand le produit se vend à l'unité seule : rien à ventiler. */
  facteur: number | null;

  seuilReassort: number;
  etat: Exclude<EtatStock, "tous">;
  coutUnitaire: number;
  valeur: number;
}

export interface FiltresNiveaux {
  recherche?: string;
  entrepot?: string | null;
  categorie?: string | null;
  etat?: EtatStock;
  limite?: number;
}

/** Le portrait minimal d'un produit, pour `getPackaging`. */
function conditionnementDe(l: {
  sellingMode: string | null;
  unitsPerPackage: number | null;
  unite: string | null;
  uniteContenant: string | null;
}) {
  return getPackaging({
    selling_mode: l.sellingMode,
    units_per_package: l.unitsPerPackage,
    unit_name: l.unite,
    packaging_unit_name: l.uniteContenant,
  });
}

export async function niveauxDeStock(
  f: FiltresNiveaux = {}
): Promise<{ elements: LigneNiveau[]; total: number }> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;
  const uniteDetail = alias(units, "unite_detail");
  const uniteContenant = alias(units, "unite_contenant");

  const conditions = [
    f.entrepot ? eq(stocks.warehouseId, f.entrepot) : undefined,
    f.categorie ? eq(products.categoryId, f.categorie) : undefined,
    terme
      ? or(
          like(sql`lower(${products.name})`, motif),
          like(sql`lower(coalesce(${products.sku}, ''))`, motif),
          like(sql`lower(coalesce(${products.barcode}, ''))`, motif)
        )
      : undefined,
  ].filter(Boolean);

  const lignes = await db
    .select({
      id: stocks.id,
      productId: stocks.productId,
      warehouseId: stocks.warehouseId,
      quantity: stocks.quantity,
      reserved: stocks.reservedQuantity,
      packageQuantity: stocks.packageQuantity,
      looseQuantity: stocks.looseQuantity,
      avgCost: stocks.avgCost,
      reorderPoint: products.reorderPoint,
      produit: products.name,
      sku: products.sku,
      costPrice: products.costPrice,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      unite: uniteDetail.name,
      uniteContenant: uniteContenant.name,
      categorie: categories.name,
      entrepot: warehouses.name,
    })
    .from(stocks)
    .leftJoin(products, eq(products.id, stocks.productId))
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(warehouses, eq(warehouses.id, stocks.warehouseId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(products.name))
    .limit(f.limite ?? 200);

  const rendues = lignes.map((l) => {
    const total = nb(l.quantity);
    const reserve = nb(l.reserved);
    const seuil = nb(l.reorderPoint);
    // Le facteur vient du produit : ici, contrairement à un mouvement, la
    // ligne décrit l'état ACTUEL du rayon, pas une saisie passée.
    const cond = conditionnementDe({
      sellingMode: l.sellingMode,
      unitsPerPackage: l.unitsPerPackage,
      unite: l.unite,
      uniteContenant: l.uniteContenant,
    });
    const paquets = nb(l.packageQuantity);
    const vrac = nb(l.looseQuantity);

    const dispo = availableSplit(
      {
        quantity: total,
        reserved_quantity: reserve,
        package_quantity: paquets,
        loose_quantity: vrac,
      },
      cond?.factor ?? null
    );

    const etat: Exclude<EtatStock, "tous"> =
      total <= 0 ? "rupture" : seuil > 0 && total <= seuil ? "bas" : "ok";

    // `avg_cost`, et à défaut `cost_price` : la règle UNIQUE du serveur
    // (`Stock.effective_cost`). Deux formules donnaient deux valeurs au même
    // stock selon l'écran.
    const cout = nb(l.avgCost) > 0 ? nb(l.avgCost) : nb(l.costPrice);

    return {
      id: l.id,
      produitId: l.productId,
      produit: l.produit ?? "Produit supprimé",
      sku: l.sku ?? null,
      categorie: l.categorie ?? null,
      entrepot: l.entrepot ?? null,
      entrepotId: l.warehouseId ?? null,
      quantiteAffichee: cond
        ? formatPackagedSplit(cond, paquets, vrac)
        : `${total} ${pluralizeUnit(l.unite ?? "unité", total)}`,
      disponibleAffiche: cond
        ? formatPackagedSplit(cond, dispo.packages, dispo.loose)
        : `${Math.max(0, total - reserve)} ${pluralizeUnit(l.unite ?? "unité", total - reserve)}`,
      total,
      reserve,
      facteur: cond?.factor ?? null,
      seuilReassort: seuil,
      etat,
      coutUnitaire: cout,
      valeur: total * cout,
    };
  });

  const filtrees =
    !f.etat || f.etat === "tous" ? rendues : rendues.filter((l) => l.etat === f.etat);

  return { elements: filtrees, total: filtrees.length };
}

export interface DetailNiveau extends LigneNiveau {
  codeBarres: string | null;
  marque: string | null;
  /** Nom de l'unité de détail : bouteille, pièce… */
  uniteDetail: string | null;
  /** Nom du contenant : casier, carton… Null si le produit n'en a pas. */
  uniteContenant: string | null;
  /** Contenants scellés et unités isolées, tels qu'enregistrés. */
  contenants: number;
  vrac: number;
  emplacement: string | null;
  dernierMouvement: Date | null;
  dernierComptage: Date | null;
}

export async function detailNiveau(id: string): Promise<DetailNiveau | null> {
  const uniteDetail = alias(units, "unite_detail");
  const uniteContenant = alias(units, "unite_contenant");
  const [l] = await db
    .select({
      stock: stocks,
      reorderPoint: products.reorderPoint,
      produit: products.name,
      sku: products.sku,
      barcode: products.barcode,
      costPrice: products.costPrice,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      unite: uniteDetail.name,
      uniteContenant: uniteContenant.name,
      marque: brands.name,
      categorie: categories.name,
      entrepot: warehouses.name,
    })
    .from(stocks)
    .leftJoin(products, eq(products.id, stocks.productId))
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(warehouses, eq(warehouses.id, stocks.warehouseId))
    .where(eq(stocks.id, id))
    .limit(1);
  if (!l) return null;

  const s = l.stock;
  const total = nb(s.quantity);
  const reserve = nb(s.reservedQuantity);
  const seuil = nb(l.reorderPoint);
  const paquets = nb(s.packageQuantity);
  const vrac = nb(s.looseQuantity);
  const cond = conditionnementDe({
    sellingMode: l.sellingMode,
    unitsPerPackage: l.unitsPerPackage,
    unite: l.unite,
    uniteContenant: l.uniteContenant,
  });
  const dispo = availableSplit(
    {
      quantity: total,
      reserved_quantity: reserve,
      package_quantity: paquets,
      loose_quantity: vrac,
    },
    cond?.factor ?? null
  );
  const cout = nb(s.avgCost) > 0 ? nb(s.avgCost) : nb(l.costPrice);

  return {
    id: s.id,
    produitId: s.productId,
    produit: l.produit ?? "Produit supprimé",
    sku: l.sku ?? null,
    codeBarres: l.barcode?.trim() || null,
    marque: l.marque ?? null,
    categorie: l.categorie ?? null,
    entrepot: l.entrepot ?? null,
    entrepotId: s.warehouseId ?? null,
    uniteDetail: cond?.retailWord ?? l.unite ?? null,
    uniteContenant: cond?.packageWord ?? null,
    quantiteAffichee: cond
      ? formatPackagedSplit(cond, paquets, vrac)
      : `${total} ${pluralizeUnit(l.unite ?? "unité", total)}`,
    disponibleAffiche: cond
      ? formatPackagedSplit(cond, dispo.packages, dispo.loose)
      : `${Math.max(0, total - reserve)} ${pluralizeUnit(l.unite ?? "unité", total - reserve)}`,
    total,
    reserve,
    contenants: paquets,
    vrac,
    facteur: cond?.factor ?? null,
    seuilReassort: seuil,
    etat: total <= 0 ? "rupture" : seuil > 0 && total <= seuil ? "bas" : "ok",
    coutUnitaire: cout,
    valeur: total * cout,
    emplacement: null,
    dernierMouvement: s.lastMovementAt ?? null,
    dernierComptage: s.lastCountedAt ?? null,
  };
}
