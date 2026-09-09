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
  type Packaging,
} from "@vente-facile/core";

import { ETAT_STOCK, etatDuRayon, type EtatStock } from "@/data/etats-stock";
import { db } from "@/db/client";
import { brands, categories, products, stocks, units, warehouses } from "@/db/schema";

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// Réexportés pour ne casser aucun appelant : leur domicile est le module pur.
export { ETAT_STOCK, type EtatStock };

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
  /**
   * Les deux compteurs du rayon, LUS et jamais redivisés.
   *
   * Un ajustement en a besoin pour ventiler son écart par canal : redécouper
   * `total` au facteur du jour donnerait « 4 casiers + 3 bouteilles » pour un
   * rayon qui en porte 3 et 27, et l'écart affiché porterait alors sur un
   * attendu qui n'a jamais existé. C'est le partage que le serveur relève, lui
   * aussi, à la création (`expected_loose_quantity`).
   */
  contenants: number;
  vrac: number;
  /**
   * Le conditionnement du produit, ou `null` s'il se vend à l'unité seule.
   * Rendu pour que la SAISIE puisse proposer ses deux canaux sans relire le
   * catalogue.
   */
  conditionnement: Packaging | null;

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

/**
 * L'état d'un rayon, traduit en conditions SQL.
 *
 * `rupture` : rien. `bas` : au-dessus de zéro et sous un seuil RÉEL - un seuil
 * à zéro ne déclenche rien, un produit sans point de réapprovisionnement n'est
 * jamais « bas ». `ok` : tout le reste de ce qui reste.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `track_inventory` FAIT PARTIE DU SEUIL, ET IL MANQUAIT.                 │
 * │                                                                          │
 * │ `low_only` ET `healthy` du serveur le portent tous deux dans leur        │
 * │ `sous_le_seuil` (`apps/inventory/filters.py`). Sans lui, un produit non  │
 * │ suivi ayant gardé un `reorder_point` était « bas » ici et « en stock »   │
 * │ là-bas : l'écran montrait une ligne que le document omet, ET omettait    │
 * │ une ligne que le document montre. Le défaut de périmètre que tous les    │
 * │ exports de ce dépôt ont dû corriger, pris par les deux bouts à la fois.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le critère est celui d'`etatDuRayon`, qui range chaque ligne RENDUE : les
 * deux doivent dire la même chose, sinon la pastille d'une rangée contredit la
 * puce qui l'a fait apparaître.
 */
function conditionsEtat(etat: EtatStock | undefined) {
  if (!etat || etat === "tous") return [];

  const quantite = sql`cast(${stocks.quantity} as real)`;
  const seuil = sql`coalesce(${products.reorderPoint}, 0)`;
  const suivi = sql`coalesce(${products.trackInventory}, 0) = 1`;
  const sousLeSeuil = sql`${seuil} > 0 and ${quantite} <= ${seuil} and ${suivi}`;

  // La rupture ne regarde QUE la quantité : `out` du serveur ne teste pas
  // `track_inventory`, et un rayon vide est vide qu'on le suive ou non.
  if (etat === "rupture") return [sql`${quantite} <= 0`];
  if (etat === "bas") return [sql`${quantite} > 0 and ${sousLeSeuil}`];
  return [sql`${quantite} > 0 and not (${sousLeSeuil})`];
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
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA RECHERCHE ÉTAIT ACCEPTÉE PUIS JETÉE, EN SILENCE.                 │
    // │                                                                      │
    // │ `terme` et `motif` étaient calculés et n'entraient dans AUCUNE       │
    // │ condition : taper un nom de produit ne changeait rien à la liste, ni │
    // │ sur l'écran « Niveaux de stock », ni dans le sélecteur d'article     │
    // │ d'un ajustement. Aucune erreur, aucun journal - la liste répondait,  │
    // │ simplement elle répondait la même chose.                             │
    // │                                                                      │
    // │ Pire, l'export de cet écran passe bien `search` AU SERVEUR : le      │
    // │ document sortait donc filtré pendant que la liste qui le déclenche   │
    // │ ne l'était pas. C'est le défaut de périmètre que ce dépôt a déjà     │
    // │ corrigé sur les niveaux de stock du back-office, pris à l'envers.    │
    // │                                                                      │
    // │ Les trois colonnes sont celles de `StockFilter.filter_search` :      │
    // │ nom, code et code-barres. S'en écarter ferait diverger l'écran du    │
    // │ document.                                                            │
    // └──────────────────────────────────────────────────────────────────────┘
    terme
      ? or(
          like(sql`lower(coalesce(${products.name}, ''))`, motif),
          like(sql`lower(coalesce(${products.sku}, ''))`, motif),
          like(sql`lower(coalesce(${products.barcode}, ''))`, motif)
        )
      : undefined,
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ L'ÉTAT DESCEND EN SQL, ET IL Y DESCEND POUR UNE RAISON.             │
    // │                                                                      │
    // │ Il était appliqué en JavaScript APRÈS une lecture bornée à 300       │
    // │ lignes, alors que la docstring de ce fichier annonce le contraire    │
    // │ quatre lignes plus haut. Une liste filtrée était donc silencieusement│
    // │ tronquée - « Stock bas » pouvait n'en montrer que ce qui tenait dans │
    // │ les 300 premiers rayons par ordre alphabétique - et `total` comptait │
    // │ la fenêtre au lieu du périmètre.                                     │
    // │                                                                      │
    // │ Les trois états sont EXCLUSIFS et partitionnent le stock. Le serveur │
    // │ dit la même chose depuis `out`, `low_only` et `healthy` : voir       │
    // │ `statutServeur`, qui garantit que le document couvre cet écran.      │
    // └──────────────────────────────────────────────────────────────────────┘
    ...conditionsEtat(f.etat),
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
      trackInventory: products.trackInventory,
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

    const etat = etatDuRayon({
      total,
      seuil,
      suitLeStock: Boolean(l.trackInventory),
    });

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
      contenants: paquets,
      vrac,
      conditionnement: cond,
      seuilReassort: seuil,
      etat,
      coutUnitaire: cout,
      valeur: total * cout,
    };
  });

  return { elements: rendues, total: rendues.length };
}

export interface DetailNiveau extends LigneNiveau {
  codeBarres: string | null;
  marque: string | null;
  /** Nom de l'unité de détail : bouteille, pièce… */
  uniteDetail: string | null;
  /** Nom du contenant : casier, carton… Null si le produit n'en a pas. */
  uniteContenant: string | null;
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
      trackInventory: products.trackInventory,
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
    conditionnement: cond,
    facteur: cond?.factor ?? null,
    seuilReassort: seuil,
    etat: etatDuRayon({
      total,
      seuil,
      suitLeStock: Boolean(l.trackInventory),
    }),
    coutUnitaire: cout,
    valeur: total * cout,
    emplacement: null,
    dernierMouvement: s.lastMovementAt ?? null,
    dernierComptage: s.lastCountedAt ?? null,
  };
}
