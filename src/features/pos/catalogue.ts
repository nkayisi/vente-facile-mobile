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
import { and, asc, eq, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import {
  availableSplit, getPackaging, remainingChannels, roundQuantity,
} from "@vente-facile/core";
import { alias } from "drizzle-orm/sqlite-core";
import { addDatabaseChangeListener } from "expo-sqlite";

import { db } from "@/db/client";
import {
  brands,
  categories,
  products,
  productVariants,
  stockLocations,
  stocks,
  units,
  warehouses,
} from "@/db/schema";
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

  /**
   * Ce que la carte du comptoir affiche, et rien d'autre ne les lit : aucune
   * règle de vente n'en dépend. Le seuil reste une CHAÎNE, comme en base.
   */
  reorder_point?: string | null;
  brand_name?: string | null;
  unit_symbol?: string | null;
  packaging_unit_symbol?: string | null;
  /** Les emplacements de l'article dans cet entrepôt, séparés par des virgules. */
  emplacement?: string | null;

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
   * quoi attendre. ⚠ Le verrou n'empêche plus l'AJOUT : il ferme
   * l'ENCAISSEMENT (`lignesEnRupture` du noyau), la proforma restant ouverte.
   */
  verrou_inventaire: string | null;

  /**
   * Le disponible des AUTRES entrepôts, pour un membre qui les lit tous.
   *
   * `null` : non demandé (le membre ne lit que ses entrepôts, ou l'écran n'en
   * a pas besoin). Une liste vide : demandé, et rien ailleurs. Information de
   * conseil seulement - on ne vend jamais que le stock de la CAISSE.
   */
  ailleurs: DisponibiliteAilleurs[] | null;
}

/** Ce qu'un autre entrepôt porte encore de cet article. */
export interface DisponibiliteAilleurs {
  entrepotId: string;
  entrepot: string;
  /** Disponible, réservations déduites, en unité de détail. */
  disponible: number;
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
  reorder_point: products.reorderPoint,
  brand_name: brands.name,
  emplacement: sql<string | null>`group_concat(distinct ${stockLocations.name})`,
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE STOCK D'UN ARTICLE EST LA SOMME DE SES LIGNES DANS L'ENTREPÔT.   │
   * │                                                                      │
   * │ Une ligne de `stocks` par variante et par emplacement : joindre la   │
   * │ table telle quelle rendait UNE CARTE PAR LIGNE, si bien qu'un article │
   * │ à deux variantes paraissait deux fois au comptoir, chaque carte avec │
   * │ un morceau du stock. On somme, par article, comme le back-office     │
   * │ (`total_stock` de la liste des produits, `?warehouse=`).             │
   * │                                                                      │
   * │ ⚠ SEULEMENT LES RAYONS SANS VARIANTE. C'est la règle du pré-contrôle │
   * │ de `SaleCreateSerializer` : une ligne de vente sans variante (tous   │
   * │ les paniers d'aujourd'hui) se compare aux seules lignes de stock     │
   * │ `variant_id IS NULL` de l'entrepôt, tous emplacements confondus.     │
   * │ Sommer les variantes accepterait ici ce que le serveur refuse, après │
   * │ l'impression du ticket.                                              │
   * │                                                                      │
   * │ `sum()` rend NULL quand aucune ligne ne joint : c'est ce qui garde   │
   * │ « aucun stock ici » distinct d'un zéro enregistré.                   │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  _quantity: sql<number | null>`sum(cast(${stocks.quantity} as real))`,
  _reserved: sql<number | null>`sum(cast(${stocks.reservedQuantity} as real))`,
  _packages: sql<number | null>`sum(cast(${stocks.packageQuantity} as real))`,
  _loose: sql<number | null>`sum(cast(${stocks.looseQuantity} as real))`,
};

/**
 * Les décimales voyagent en chaînes ; on ne les convertit qu'ici.
 *
 * ⚠ QUANTISÉ : une somme SQL en flottant rend `0.30000000000000004` pour deux
 * lignes de 0,1 et 0,2, et ce nombre s'afficherait sur la carte.
 */
function nombre(v: string | number | null | undefined): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? roundQuantity(n) : 0;
}

type LigneBrute = Record<string, unknown>;

/** Ce que la lecture doit connaître en plus des colonnes, une fois par requête. */
export interface Contexte {
  verrou: VerrouInventaire;
  reserve: ReserveLocale;
  /** Le disponible des autres entrepôts, quand il a été demandé. */
  ailleurs?: Map<string, DisponibiliteAilleurs[]> | null;
}

const CONTEXTE_VIDE: Contexte = {
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
    _quantity, _reserved, _packages, _loose, ...reste
  } = ligne as {
    _quantity: string | number | null;
    _reserved: string | number | null;
    _packages: string | number | null;
    _loose: string | number | null;
  } & Record<string, unknown>;

  const article = reste as unknown as ArticlePos;
  article.verrou_inventaire = ctx.verrou.get(article.id) ?? null;
  article.ailleurs = ctx.ailleurs ? (ctx.ailleurs.get(article.id) ?? []) : null;

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LE STOCK NÉGATIF N'EXISTE PLUS, NI « SANS ENTREPÔT = PAS DE BORNE ».│
  // │                                                                      │
  // │ L'article portait `allow_negative_stock`, vrai dès que la caisse     │
  // │ n'avait pas d'entrepôt : le comptoir encaissait alors sans aucune    │
  // │ borne. Aucune sortie ne passe plus sous zéro (décision 5), et un     │
  // │ stock inconnu ferme l'encaissement en le DISANT (`motifStockInconnu`│
  // │ du noyau) au lieu d'ouvrir la porte.                                 │
  // └──────────────────────────────────────────────────────────────────────┘

  // Aucune ligne de stock : on ne sait RIEN, et `null` ne se lit jamais comme
  // zéro. Le noyau le dira « aucun stock ici » à l'encaissement.
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
  const ctx: Contexte = { verrou, reserve };

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

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUT LE CATALOGUE VENDABLE, ET LE STOCK DE LA CAISSE.                   │
 * │                                                                          │
 * │ Le comptoir bornait son catalogue au périmètre du membre : un article    │
 * │ stocké au seul dépôt d'en face était introuvable, donc impossible à      │
 * │ chiffrer sur une proforma ou un devis. Il montre désormais tout ce qui   │
 * │ est vendable (décision 4), et le stock affiché reste celui de la CAISSE. │
 * │ Un article sans stock ici s'ajoute ; c'est l'encaissement qui ferme.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Filtre {
  /** Entrepôt de la session de caisse ; sans lui, le stock reste inconnu. */
  warehouseId?: string | null;
  terme?: string;
  categoryId?: string | null;
  limite?: number;
  /**
   * Joindre le disponible des AUTRES entrepôts. Réservé à qui les lit tous
   * (`litTousLesEntrepots`) : c'est la décision 4, et le tirage ne descend
   * de toute façon pas le stock d'un dépôt hors du périmètre de lecture.
   */
  avecAilleurs?: boolean;
}

function base(warehouseId?: string | null) {
  return db
    .select({
      ...CHAMPS,
      unit_name: uniteDetail.name,
      unit_symbol: uniteDetail.symbol,
      packaging_unit_name: uniteContenant.name,
      packaging_unit_symbol: uniteContenant.symbol,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .leftJoin(
      stocks,
      warehouseId
        ? and(
            eq(stocks.productId, products.id),
            eq(stocks.warehouseId, warehouseId),
            isNull(stocks.variantId)
          )
        : // Sans entrepôt on ne joint RIEN plutôt que le premier venu : afficher
          // le stock d'un autre dépôt serait pire qu'afficher « inconnu ».
          sql`1 = 0`
    )
    // Après `stocks`, dont il dépend. Une ligne de stock a au plus un
    // emplacement : cette jointure ne multiplie donc pas les sommes ci-dessus.
    .leftJoin(stockLocations, eq(stockLocations.id, stocks.locationId));
}

/**
 * Le disponible des autres entrepôts, article par article.
 *
 * Une seule requête pour tout le résultat, groupée par (article, entrepôt) :
 * une par article ferait autant d'allers-retours que de cartes à la grille.
 * Seuls les entrepôts qui portent ENCORE quelque chose sont rendus - la liste
 * dit où envoyer le client, pas où il n'y a rien.
 */
async function disponibiliteAilleurs(
  ids: string[],
  sauf: string | null | undefined
): Promise<Map<string, DisponibiliteAilleurs[]>> {
  const carte = new Map<string, DisponibiliteAilleurs[]>();
  if (ids.length === 0) return carte;
  const lignes = await db
    .select({
      produit: stocks.productId,
      entrepotId: stocks.warehouseId,
      entrepot: warehouses.name,
      quantite: sql<number>`sum(cast(${stocks.quantity} as real))`,
      reserve: sql<number>`sum(cast(${stocks.reservedQuantity} as real))`,
    })
    .from(stocks)
    .innerJoin(warehouses, eq(warehouses.id, stocks.warehouseId))
    .where(
      and(
        inArray(stocks.productId, ids),
        // Le même disponible que celui de la caisse : sans variante.
        isNull(stocks.variantId),
        sauf ? ne(stocks.warehouseId, sauf) : undefined,
        // Un entrepôt désactivé ne vend plus : y envoyer le client serait
        // une fausse piste.
        eq(warehouses.isActive, true)
      )
    )
    .groupBy(stocks.productId, stocks.warehouseId)
    .orderBy(asc(sql`lower(${warehouses.name})`));

  for (const l of lignes) {
    const disponible = roundQuantity(nombre(l.quantite) - Math.max(0, nombre(l.reserve)));
    if (disponible <= 0) continue;
    const liste = carte.get(l.produit) ?? [];
    liste.push({ entrepotId: l.entrepotId, entrepot: l.entrepot, disponible });
    carte.set(l.produit, liste);
  }
  return carte;
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
  avecAilleurs = false,
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
    base(warehouseId)
      .where(and(...conditions))
      // Une carte par ARTICLE : voir `CHAMPS`.
      .groupBy(products.id)
      .orderBy(asc(products.name))
      .limit(limite),
    contexteDe(warehouseId),
  ]);

  const ailleurs = avecAilleurs
    ? await disponibiliteAilleurs(lignes.map((l) => l.id), warehouseId)
    : null;
  return lignes.map((l) => versArticle(l, { ...ctx, ailleurs }));
}

/**
 * Recherche par code-barres : l'égalité stricte, jamais un `like`.
 *
 * Un scan qui ramènerait plusieurs articles ferait perdre plus de temps qu'il
 * n'en fait gagner. `null` quand rien ne correspond, pour que l'écran le dise.
 */
export async function articleParCodeBarres(
  code: string,
  warehouseId: string | null | undefined
): Promise<ArticlePos | null> {
  // Le même catalogue que la grille : tout ce qui est vendable. Un scan qui
  // trouverait moins que la recherche ferait chercher à la main ce que le
  // lecteur vient de refuser.
  //
  // ⚠ LE CODE-BARRES D'ABORD, PUIS CELUI D'UNE VARIANTE, PUIS LE SKU, comme `search-barcode/` du
  // serveur : un QR imprimé par le marchand porte souvent le SKU, et les deux
  // surfaces doivent trouver le MÊME article pour le même code.
  const lu = code.trim();
  if (!lu) return null;
  const [parCode, ctx] = await Promise.all([
    base(warehouseId)
      .where(and(vendable(), eq(products.barcode, lu)))
      .groupBy(products.id)
      .limit(1),
    contexteDe(warehouseId),
  ]);
  if (parCode[0]) return versArticle(parCode[0], ctx);
  // Puis le code-barres d'une VARIANTE, comme le serveur (`search-barcode/`) :
  // sans cette étape, une variante scannée au comptoir était introuvable ici
  // et trouvée au back-office. L'article rendu est celui de la variante.
  const variante = await db
    .select({ produit: productVariants.productId })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.barcode, lu),
        eq(productVariants.isActive, true),
        eq(productVariants.isDeleted, false)
      )
    )
    .limit(1);
  if (variante[0]) {
    const parVariante = await base(warehouseId)
      .where(and(vendable(), eq(products.id, variante[0].produit)))
      .groupBy(products.id)
      .limit(1);
    if (parVariante[0]) return versArticle(parVariante[0], ctx);
  }
  const parSku = await base(warehouseId)
    .where(and(vendable(), eq(products.sku, lu)))
    .groupBy(products.id)
    .limit(1);
  return parSku[0] ? versArticle(parSku[0], ctx) : null;
}

/**
 * Les articles portant ces identifiants, indexés par identifiant.
 *
 * ⚠ ELLE N'EST PAS BORNÉE PAR LE PÉRIMÈTRE DU CATALOGUE, délibérément.
 *
 * C'est une relecture PAR IDENTIFIANT, et les identifiants viennent d'un panier
 * rangé à cette même caisse : il n'y a rien à filtrer qu'on n'ait déjà laissé
 * entrer. Y poser le périmètre ferait DISPARAÎTRE des lignes d'un panier qu'un
 * caissier croit retrouver intact, là où `verifierAjout` refusera de lui-même
 * ce qui n'est plus vendable - avec son motif, au lieu du silence.
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
    base(warehouseId).where(and(vendable(), inArray(products.id, uniques))).groupBy(products.id),
    contexteDe(warehouseId),
  ]);

  return new Map(lignes.map((l) => versArticle(l, ctx)).map((a) => [a.id, a]));
}

/**
 * Ce que la table CONTIENT, pour expliquer une grille vide.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE GRILLE VIDE A PLUSIEURS CAUSES, ET LE RÉSULTAT FILTRÉ N'EN DIT      │
 * │ AUCUNE.                                                                  │
 * │                                                                          │
 * │ `vendable()` exige `is_active` ET `is_sellable` : un catalogue descendu   │
 * │ sans ces drapeaux rend zéro article, exactement comme une table vide.    │
 * │ Les distinguer demande de compter ce que la table porte AVANT le filtre. │
 * │                                                                          │
 * │ Un seul aller-retour, par agrégat conditionnel : deux requêtes pourraient│
 * │ tomber de part et d'autre d'un tirage et rendre `vendables > recus`, un  │
 * │ état impossible dont aucune cause ne se déduirait.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Appelée SEULEMENT quand la grille est vide : sur une grille pleine il n'y a
 * rien à expliquer, et ce comptage balaie toute la table.
 *
 * Le comptoir montrant tout le catalogue vendable, aucun périmètre n'entre
 * plus dans ce comptage : il n'y a plus d'article « hors de portée » à
 * distinguer d'un article hors vente.
 */
export async function diagnostiquerCatalogue(): Promise<{
  recus: number;
  vendables: number;
}> {
  // ⚠ UN SEUL ALLER-RETOUR, par agrégat conditionnel. Deux requêtes pourraient
  //   tomber de part et d'autre d'un tirage et rendre `vendables > recus`, un
  //   état impossible dont aucune cause ne se déduirait.
  const [ligne] = await db
    .select({
      recus: sql<number>`count(*)`,
      vendables: sql<number>`sum(case when ${products.isActive} = 1 and ${products.isSellable} = 1 then 1 else 0 end)`,
    })
    .from(products)
    .where(or(eq(products.isDeleted, false), isNull(products.isDeleted)));

  // `sum()` de SQLite rend NULL sur zéro ligne, jamais 0 : le lire comme un
  // nombre donnerait `NaN`, et l'écran afficherait « NaN articles reçus ».
  return {
    recus: Number(ligne?.recus ?? 0),
    vendables: Number(ligne?.vendables ?? 0),
  };
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
