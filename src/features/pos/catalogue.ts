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
import { and, asc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { availableSplit, getPackaging, remainingChannels } from "@vente-facile/core";
import { alias } from "drizzle-orm/sqlite-core";
import { addDatabaseChangeListener } from "expo-sqlite";

import { db } from "@/db/client";
import { categories, products, stocks, units, warehouses } from "@/db/schema";
import { reservesEnAttente, type ReserveLocale } from "./reserve-locale";
import { produitsVerrouilles, type VerrouInventaire } from "./verrou-inventaire";

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

  /**
   * Référence de la session d'inventaire qui bloque cet article, ou `null`.
   *
   * Le serveur refuse la vente d'un produit sous inventaire ; le comptoir le
   * dit AVANT l'impression, et nomme la session pour que le caissier sache
   * quoi attendre.
   */
  verrou_inventaire: string | null;
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
  _quantity: stocks.quantity,
  _reserved: stocks.reservedQuantity,
  _packages: stocks.packageQuantity,
  _loose: stocks.looseQuantity,
  /**
   * LE DÉCOUVERT SE DÉCIDE AU NIVEAU DE L'ENTREPÔT, PAS DU PRODUIT.
   *
   * C'est ce que fait le serveur partout en aval - `assert_sealed_available`,
   * `ensure_loose_available`, `Stock.save` - et son pré-contrôle de vente le
   * documente explicitement : lire `product.allow_negative_stock` était un
   * bug. Sur une configuration divergente (produit permissif, entrepôt strict)
   * le comptoir acceptait une vente que le serveur refuse ensuite ; dans
   * l'autre sens il refusait une vente parfaitement licite.
   */
  _allow_negative: warehouses.allowNegativeStock,
};

/** Les décimales voyagent en chaînes ; on ne les convertit qu'ici. */
function nombre(v: string | number | null | undefined): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

type LigneBrute = Record<string, unknown>;

/** Ce que la lecture doit connaître en plus des colonnes, une fois par requête. */
export interface Contexte {
  /** Vrai quand aucune caisse n'est ouverte : il n'y a pas d'entrepôt à opposer. */
  sansEntrepot: boolean;
  verrou: VerrouInventaire;
  reserve: ReserveLocale;
}

const CONTEXTE_VIDE: Contexte = {
  sansEntrepot: true,
  verrou: new Map(),
  reserve: new Map(),
};

/**
 * Transforme une ligne SQL en article du comptoir.
 *
 * Exporté pour être ÉPROUVÉ sans appareil : ce qu'il décide n'est visible ni à
 * l'écran ni dans un journal, seulement dans un refus de vente qui arrive trop
 * tard. Les appelants réels sont les trois lectures de ce fichier.
 *
 * C'est ici, et seulement ici, que sont retranchés du disponible les
 * réservations du serveur ET les ventes que ce terminal n'a pas encore
 * poussées. Les laisser à la charge de chaque écran garantirait qu'un écran
 * l'oublie et propose à la vente un contenant déjà promis.
 */
export function versArticle(ligne: LigneBrute, ctx: Contexte = CONTEXTE_VIDE): ArticlePos {
  const {
    _quantity, _reserved, _packages, _loose, _allow_negative, ...reste
  } = ligne as {
    _quantity: string | null;
    _reserved: string | null;
    _packages: string | null;
    _loose: string | null;
    /** Colonne booléenne de l'entrepôt, `null` si la jointure n'a rien trouvé. */
    _allow_negative: boolean | null;
  } & Record<string, unknown>;

  const article = reste as unknown as ArticlePos;
  article.verrou_inventaire = ctx.verrou.get(article.id) ?? null;

  // SANS ENTREPÔT, AUCUNE BORNE. Le serveur fait exactement pareil : son
  // pré-contrôle de stock est enveloppé dans un `if warehouse:`. Poser ici une
  // borne à zéro rendrait invendable tout le catalogue d'une caisse sans dépôt,
  // configuration que l'écran d'ouverture tolère avec un avertissement.
  article.allow_negative_stock = ctx.sansEntrepot ? true : _allow_negative === true;

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
  const disponible = compteurs.quantity - Math.max(0, compteurs.reserved_quantity);

  // Ce que ce terminal a déjà vendu sans que le serveur le sache. Retranché par
  // `remainingChannels`, qui rejoue l'ordre du serveur : la part en contenants
  // sort du scellé, puis le détail puise dans le vrac et ouvre un contenant s'il
  // le faut. Une soustraction brute des deux compteurs laisserait un scellé
  // apparemment libre alors qu'il vient d'être ouvert pour servir du détail.
  const enAttente = ctx.reserve.get(article.id);
  if (!enAttente) {
    return {
      ...article,
      stock_quantity: disponible,
      stock_packages: facteur ? packages : null,
      stock_loose: loose,
      reserved_quantity: compteurs.reserved_quantity,
    };
  }

  const retenu = facteur
    ? enAttente.packages * facteur + enAttente.loose
    : enAttente.loose;
  // Sans conditionnement, il n'y a qu'un canal et `remainingChannels` sort
  // d'emblée : le vrac se retranche alors directement, sinon l'écran
  // continuerait d'annoncer un disponible que le total contredit déjà.
  const restant = facteur
    ? remainingChannels(
        { sealed: packages, loose },
        { packages: enAttente.packages, loose: enAttente.loose },
        facteur
      )
    : { sealed: null, loose: loose - retenu };

  return {
    ...article,
    stock_quantity: disponible - retenu,
    stock_packages: restant.sealed,
    stock_loose: restant.loose,
    reserved_quantity: compteurs.reserved_quantity,
  };
}

/**
 * Verrou d'inventaire et ventes en file, MÉMORISÉS entre deux lectures.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL ÉTAIT REFAIT À CHAQUE FRAPPE, SUR LA GRILLE DU COMPTOIR.             │
 * │                                                                          │
 * │ Le contexte ne dépend pas du terme cherché, mais il était reconstruit à  │
 * │ chaque lecture du catalogue - donc à chaque recherche différée, à chaque │
 * │ scan, à chaque reprise de panier. Sous un inventaire de périmètre TOTAL, │
 * │ cela relit TOUTES les lignes de stock de l'entrepôt (des milliers sur un │
 * │ vrai catalogue) et redéserialise le corps de chaque vente en file, pour  │
 * │ un résultat rigoureusement identique. Sur le seul écran qui doit rester  │
 * │ instantané, un client devant le comptoir.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA MÉMOIRE EST INVALIDÉE PAR LA BASE, JAMAIS PAR UNE DURÉE.             │
 * │                                                                          │
 * │ Un cache à échéance laisserait une fenêtre - fût-elle d'une seconde - où │
 * │ le comptoir reproposerait un article que la vente précédente vient de    │
 * │ sortir, ou en vendrait un que l'inventaire vient de bloquer. C'est       │
 * │ exactement ce que la réserve locale et le verrou existent pour empêcher, │
 * │ et une seconde suffit à deux appuis.                                     │
 * │                                                                          │
 * │ On écoute donc les tables dont il est tiré, par le même mécanisme que    │
 * │ `useLecture` (`enableChangeListener`), et le compteur `generation` fait  │
 * │ que le résultat d'une lecture commencée AVANT un changement n'est jamais │
 * │ rangé après lui : il est rendu à son appelant, qui l'a demandé plus tôt, │
 * │ et la lecture suivante repart de la base.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const TABLES_DU_CONTEXTE = new Set([
  // La réserve locale, tirée du journal d'opérations. `unblockAll` y écrit
  // aussi : une vente débloquée doit cesser d'être retenue deux fois.
  "outbox_operations",
  // Le verrou d'inventaire : ses sessions, et la feuille de comptage d'où sont
  // lus les périmètres partiels.
  "inventory_sessions",
  "inventory_counts",
  // Le périmètre TOTAL se lit dans `stocks` : une réception pendant un
  // inventaire y crée une ligne, que le serveur verrouille aussitôt.
  "stocks",
]);

let contexteMemorise: { cle: string; ctx: Contexte } | null = null;
let generation = 0;
let ecoute: { remove: () => void } | null = null;

/** Abonnement posé au PREMIER besoin : l'import du module n'ouvre rien. */
function surveillerLaBase(): void {
  if (ecoute) return;
  ecoute = addDatabaseChangeListener((ev) => {
    if (!TABLES_DU_CONTEXTE.has(ev.tableName)) return;
    generation += 1;
    contexteMemorise = null;
  });
}

async function contexteDe(warehouseId?: string | null): Promise<Contexte> {
  surveillerLaBase();

  // L'entrepôt fait partie de la clé : le verrou comme la réserve portent sur
  // un dépôt, et servir le contexte d'un autre retiendrait du stock que celui
  // d'en face n'a pas vendu.
  const cle = warehouseId ?? "";
  if (contexteMemorise && contexteMemorise.cle === cle) return contexteMemorise.ctx;

  const attendu = generation;
  const [verrou, reserve] = await Promise.all([
    produitsVerrouilles(warehouseId),
    reservesEnAttente(warehouseId),
  ]);
  const ctx: Contexte = { sansEntrepot: !warehouseId, verrou, reserve };

  // Un changement survenu PENDANT la lecture la rend périmée : on la rend à
  // l'appelant, qui l'a demandée avant, mais on ne la range pas.
  if (attendu === generation) contexteMemorise = { cle, ctx };
  return ctx;
}

/**
 * Oublie le contexte mémorisé. Réservé aux TESTS.
 *
 * L'invalidation normale vient de la base, et elle doit rester la seule : un
 * appelant qui prendrait l'habitude d'oublier « au cas où » remettrait la
 * fraîcheur à la charge de chaque écran, ce que cette mémoire existe justement
 * pour éviter. La mémoire est de MODULE, donc partagée par les tests d'un même
 * fichier : sans ce point d'entrée, le second test lirait le contexte du
 * premier.
 */
export function oublierLeContexte(): void {
  generation += 1;
  contexteMemorise = null;
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
    )
    // L'entrepôt de la session, pour son seul réglage de découvert. Jointure
    // sur une constante et non sur une colonne : le stock est déjà filtré sur
    // ce dépôt, la ligne d'entrepôt est la même pour tout le résultat.
    .leftJoin(
      warehouses,
      warehouseId ? eq(warehouses.id, warehouseId) : sql`1 = 0`
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

  const [lignes, ctx] = await Promise.all([
    base(warehouseId).where(and(...conditions)).orderBy(asc(products.name)).limit(limite),
    contexteDe(warehouseId),
  ]);

  return lignes.map((l) => versArticle(l, ctx));
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
  const [lignes, ctx] = await Promise.all([
    base(warehouseId).where(and(vendable(), eq(products.barcode, code.trim()))).limit(1),
    contexteDe(warehouseId),
  ]);
  return lignes[0] ? versArticle(lignes[0], ctx) : null;
}

/**
 * Les articles portant ces identifiants, indexés par identifiant.
 *
 * Sert la reprise d'un panier mis en attente : le prix et le stock sont RELUS,
 * jamais restitués depuis une copie rangée avec le panier. Un article devenu
 * invendable ou supprimé est simplement absent de la carte, ce que l'appelant
 * traduit en ligne écartée.
 */
export async function articlesParIds(
  ids: string[],
  warehouseId?: string | null
): Promise<Map<string, ArticlePos>> {
  const uniques = [...new Set(ids)].filter(Boolean);
  if (uniques.length === 0) return new Map();

  const [lignes, ctx] = await Promise.all([
    base(warehouseId).where(and(vendable(), inArray(products.id, uniques))),
    contexteDe(warehouseId),
  ]);

  return new Map(lignes.map((l) => versArticle(l, ctx)).map((a) => [a.id, a]));
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
