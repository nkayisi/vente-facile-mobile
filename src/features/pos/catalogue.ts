/**
 * Lecture du catalogue vendable, depuis la base locale.
 *
 * Aucune requête réseau : le comptoir doit fonctionner un mois sans ligne. Ce
 * que le POS affiche vient de ce que le tirage a déposé, et rien d'autre.
 *
 * Les prix et quantités sont rangés en CHAÎNES (`"12.000"`), discipline reprise
 * de bout en bout : un panier CDF à sept chiffres perd des unités en flottant.
 * La conversion en nombre n'a lieu qu'au moment de calculer, jamais au stockage
 * ni à la comparaison SQL, où `"0.000" > "12.000"` lexicographiquement.
 */
import { and, asc, eq, isNull, like, or, sql } from "drizzle-orm";
import { availableSplit, getPackaging } from "@vente-facile/core";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/db/client";
import { categories, products, stocks, units } from "@/db/schema";

/**
 * Un article tel que le comptoir le voit.
 *
 * Les champs en `snake_case` ne sont pas une inconséquence : ce sont ceux que
 * `@vente-facile/core/pos` attend, et les nommer autrement obligerait à
 * recopier chaque ligne du panier avant de la totaliser.
 */
export interface ArticlePos {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  image: string | null;
  categoryId: string | null;
  categoryName: string | null;

  /** Prix de détail, en devise principale. */
  selling_price: string;
  wholesale_price: string | null;
  is_taxable: boolean;
  tax_rate: string | null;

  selling_mode: string | null;
  units_per_package: number | null;
  unit_name: string | null;
  packaging_unit_name: string | null;
  allow_auto_unpacking: boolean;

  track_inventory: boolean;
  allow_negative_stock: boolean;

  /**
   * DISPONIBLE de l'entrepôt courant, réservations déduites, ventilé.
   *
   * Ce sont les trois champs que `@vente-facile/core/pos` interroge pour
   * accepter ou refuser un ajout. Ils portent volontairement les mêmes noms que
   * ceux servis par l'API au back-office : les deux surfaces opposent au
   * caissier exactement le même nombre.
   *
   * `null` signifie « aucune ligne de stock pour cet entrepôt », donc rien de
   * connu. Le paquet le traduit par « pas de borne à opposer », jamais par zéro.
   */
  stock_quantity: number | null;
  stock_packages: number | null;
  stock_loose: number | null;
  /** Réservé, pour l'affichage seul : ce n'est pas une borne de vente. */
  reserved_quantity: number;
}

const CHAMPS = {
  id: products.id,
  name: products.name,
  sku: products.sku,
  barcode: products.barcode,
  image: products.image,
  categoryId: products.categoryId,
  categoryName: categories.name,
  selling_price: products.sellingPrice,
  wholesale_price: products.wholesalePrice,
  is_taxable: products.isTaxable,
  tax_rate: products.taxRate,
  selling_mode: products.sellingMode,
  units_per_package: products.unitsPerPackage,
  allow_auto_unpacking: products.allowAutoUnpacking,
  track_inventory: products.trackInventory,
  allow_negative_stock: products.allowNegativeStock,
  _quantity: stocks.quantity,
  _reserved: stocks.reservedQuantity,
  _packages: stocks.packageQuantity,
  _loose: stocks.looseQuantity,
};

/** Les décimales voyagent en chaînes ; on ne les convertit qu'ici. */
function nombre(v: string | number | null | undefined): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

type LigneBrute = Record<string, unknown>;

/**
 * Transforme une ligne SQL en article du comptoir.
 *
 * C'est ici, et seulement ici, que les réservations sont déduites et ventilées.
 * Les laisser à la charge de chaque écran garantirait qu'un écran l'oublie et
 * propose à la vente un contenant déjà promis à un devis.
 */
function versArticle(ligne: LigneBrute): ArticlePos {
  const {
    _quantity, _reserved, _packages, _loose, ...reste
  } = ligne as Record<string, string | null>;

  const article = reste as unknown as ArticlePos;

  // Aucune ligne de stock : on ne sait RIEN, et un zéro bloquerait la vente
  // d'un produit peut-être abondant. Le serveur reste juge.
  if (_quantity === null || _quantity === undefined) {
    return { ...article, stock_quantity: null, stock_packages: null, stock_loose: null, reserved_quantity: 0 };
  }

  const facteur = getPackaging(article)?.factor ?? null;
  const compteurs = {
    quantity: nombre(_quantity),
    reserved_quantity: nombre(_reserved),
    package_quantity: nombre(_packages),
    loose_quantity: nombre(_loose),
  };
  const { packages, loose } = availableSplit(compteurs, facteur);

  return {
    ...article,
    stock_quantity: compteurs.quantity - Math.max(0, compteurs.reserved_quantity),
    stock_packages: facteur ? packages : null,
    stock_loose: loose,
    reserved_quantity: compteurs.reserved_quantity,
  };
}

/**
 * Le nom d'unité vient de deux jointures sur la MÊME table.
 *
 * D'où deux alias : sans eux, la seconde jointure écrase la première en silence
 * et tout produit vendu au conditionnement afficherait son unité de détail
 * comme nom de contenant, « 2 bouteilles + 3 bouteilles ».
 */
const uniteDetail = alias(units, "unite_detail");
const uniteContenant = alias(units, "unite_contenant");

interface Filtre {
  /** Entrepôt de la session de caisse ; sans lui, le stock reste inconnu. */
  warehouseId?: string | null;
  terme?: string;
  categoryId?: string | null;
  limite?: number;
}

function base(warehouseId?: string | null) {
  return db
    .select({
      ...CHAMPS,
      unit_name: uniteDetail.name,
      packaging_unit_name: uniteContenant.name,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .leftJoin(
      stocks,
      warehouseId
        ? and(eq(stocks.productId, products.id), eq(stocks.warehouseId, warehouseId))
        : // Sans entrepôt on ne joint RIEN plutôt que le premier venu : afficher
          // le stock d'un autre dépôt serait pire qu'afficher « inconnu ».
          sql`1 = 0`
    );
}

/** Condition commune : un article vendable, non supprimé. */
function vendable() {
  return and(
    eq(products.isActive, true),
    eq(products.isSellable, true),
    or(eq(products.isDeleted, false), isNull(products.isDeleted))
  );
}

export async function chercherArticles({
  warehouseId,
  terme,
  categoryId,
  limite = 80,
}: Filtre): Promise<ArticlePos[]> {
  const motif = terme?.trim();
  const conditions = [vendable()];

  if (motif) {
    // `like` de SQLite est insensible à la casse sur l'ASCII ; les accents, non.
    // Le catalogue est majoritairement en français : chercher « cafe » ne doit
    // pas rater « café ». La normalisation vit dans `sansAccent`, appliquée des
    // deux côtés de la comparaison.
    const m = `%${sansAccent(motif)}%`;
    conditions.push(
      or(
        like(normalise(products.name), m),
        like(normalise(products.sku), m),
        like(normalise(products.barcode), m)
      )!
    );
  }
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));

  const lignes = await base(warehouseId)
    .where(and(...conditions))
    .orderBy(asc(products.name))
    .limit(limite);

  return lignes.map(versArticle);
}

/**
 * Recherche par code-barres : l'égalité stricte, jamais un `like`.
 *
 * Un scan qui ramènerait plusieurs articles ferait perdre plus de temps qu'il
 * n'en fait gagner. `null` quand rien ne correspond, pour que l'écran le dise.
 */
export async function articleParCodeBarres(
  code: string,
  warehouseId?: string | null
): Promise<ArticlePos | null> {
  const [ligne] = await base(warehouseId)
    .where(and(vendable(), eq(products.barcode, code.trim())))
    .limit(1);
  return ligne ? versArticle(ligne) : null;
}

export async function categoriesVendables(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.name));
}

/**
 * Table de repli des lettres accentuées, appliquée DES DEUX CÔTÉS.
 *
 * Le catalogue est en français : chercher « cafe » doit trouver « Café ». Or
 * SQLite n'a ni `unaccent` ni `translate`, et son `lower()` intégré ne touche
 * qu'à l'ASCII : « CAFÉ » y devient « cafÉ », pas « café ». Les majuscules
 * accentuées figurent donc dans la table, sinon un article saisi tout en
 * capitales, ce qui est la règle sur les étiquettes, resterait introuvable.
 *
 * Ce n'est pas une translittération Unicode complète, et ça n'a pas à l'être.
 * Ce qui compte est que la colonne et le terme saisi subissent EXACTEMENT la
 * même transformation : une table commune plutôt qu'un `normalize()` côté JS
 * face à des `replace` côté SQL, qui divergeraient au premier caractère oublié.
 */
const ACCENTS: [string, string][] = [
  ["à", "a"], ["á", "a"], ["â", "a"], ["ä", "a"], ["ã", "a"], ["å", "a"],
  ["è", "e"], ["é", "e"], ["ê", "e"], ["ë", "e"],
  ["ì", "i"], ["í", "i"], ["î", "i"], ["ï", "i"],
  ["ò", "o"], ["ó", "o"], ["ô", "o"], ["ö", "o"], ["õ", "o"],
  ["ù", "u"], ["ú", "u"], ["û", "u"], ["ü", "u"],
  ["ç", "c"], ["ñ", "n"], ["ý", "y"], ["ÿ", "y"],
  ["À", "a"], ["Á", "a"], ["Â", "a"], ["Ä", "a"], ["Ã", "a"], ["Å", "a"],
  ["È", "e"], ["É", "e"], ["Ê", "e"], ["Ë", "e"],
  ["Ì", "i"], ["Í", "i"], ["Î", "i"], ["Ï", "i"],
  ["Ò", "o"], ["Ó", "o"], ["Ô", "o"], ["Ö", "o"], ["Õ", "o"],
  ["Ù", "u"], ["Ú", "u"], ["Û", "u"], ["Ü", "u"],
  ["Ç", "c"], ["Ñ", "n"], ["Ý", "y"],
];

/** Minuscules et sans accent, côté SQLite. */
function normalise(colonne: unknown) {
  let expr = sql`lower(coalesce(${colonne}, ''))`;
  for (const [de, vers] of ACCENTS) {
    expr = sql`replace(${expr}, ${de}, ${vers})`;
  }
  return expr;
}

/** Minuscules et sans accent, côté JavaScript. Miroir strict de `normalise`. */
export function sansAccent(valeur: string): string {
  let sortie = valeur.toLowerCase();
  for (const [de, vers] of ACCENTS) {
    sortie = sortie.split(de).join(vers);
  }
  return sortie;
}
