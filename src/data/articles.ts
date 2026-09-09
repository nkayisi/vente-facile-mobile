/**
 * Lectures du catalogue. Miroir de `frontend/actions/products.actions.ts`.
 *
 * La lisibilité gros/détail passe par `@vente-facile/core` et jamais par un
 * calcul local : `getPackaging` décide s'il y a un conditionnement,
 * `formatPackagedSplit` rend un partage DÉJÀ connu sans jamais le redécouper.
 * Redécouper au facteur du jour donnerait « 10 casiers » pour cinq casiers plus
 * cent vingt bouteilles, et le facteur a pu changer depuis.
 */
import { and, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  availableSplit,
  formatPackagedSplit,
  getPackaging,
  pluralizeUnit,
  type Packaging,
} from "@vente-facile/core";

import { db } from "@/db/client";
import { brands, categories, products, stocks, units, warehouses } from "@/db/schema";

export interface ArticleListe {
  id: string;
  nom: string;
  sku: string | null;
  categorie: string | null;
  marque: string | null;
  actif: boolean;
  suitLeStock: boolean;
  /** « 3 casiers + 7 bouteilles », ou « 147 bouteilles », ou null si non suivi. */
  stockAffiche: string | null;
  prix: string | null;
}

export interface FiltresArticles {
  recherche?: string;
  limite?: number;
  offset?: number;
}

export async function listeArticles(
  f: FiltresArticles = {}
): Promise<{ elements: ArticleListe[]; total: number }> {
  const terme = (f.recherche ?? "").trim();
  const motif = `%${terme.toLowerCase()}%`;
  const filtre = terme
    ? or(
        like(sql`lower(${products.name})`, motif),
        like(sql`lower(${products.sku})`, motif),
        like(sql`lower(${products.barcode})`, motif)
      )
    : undefined;

  const [{ n: total } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(and(eq(products.isDeleted, false), filtre));

  const lignes = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      isActive: products.isActive,
      trackInventory: products.trackInventory,
      sellingPrice: products.sellingPrice,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      categorie: categories.name,
      marque: brands.name,
      unite: units.name,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(units, eq(units.id, products.unitId))
    .where(and(eq(products.isDeleted, false), filtre))
    .orderBy(products.name)
    .limit(f.limite ?? 50)
    .offset(f.offset ?? 0);

  // Les compteurs de stock, en une requête plutôt qu'une par article.
  const ids = lignes.map((l) => l.id);
  const compteurs = new Map<string, { paquets: number; vrac: number; total: number }>();
  if (ids.length > 0) {
    const s = await db
      .select({
        productId: stocks.productId,
        quantity: stocks.quantity,
        packageQuantity: stocks.packageQuantity,
        looseQuantity: stocks.looseQuantity,
      })
      .from(stocks);
    for (const r of s) {
      if (!ids.includes(r.productId)) continue;
      const c = compteurs.get(r.productId) ?? { paquets: 0, vrac: 0, total: 0 };
      c.paquets += Number(r.packageQuantity ?? 0);
      c.vrac += Number(r.looseQuantity ?? 0);
      c.total += Number(r.quantity ?? 0);
      compteurs.set(r.productId, c);
    }
  }

  const elements: ArticleListe[] = lignes.map((l) => {
    const conditionnement = getPackaging({
      selling_mode: l.sellingMode,
      units_per_package: l.unitsPerPackage,
      unit_name: l.unite,
    });
    const c = compteurs.get(l.id);

    let stockAffiche: string | null = null;
    if (!l.trackInventory) {
      // Le back-office écrit « - » pour un produit non suivi, et « Non suivi »
      // sur sa fiche. On ne dit JAMAIS « 0 » : ce serait affirmer une rupture.
      stockAffiche = null;
    } else if (!c) {
      stockAffiche = null;
    } else if (conditionnement) {
      stockAffiche = formatPackagedSplit(conditionnement, c.paquets, c.vrac);
    } else {
      stockAffiche = `${c.total} ${pluralizeUnit(l.unite ?? "unité", c.total)}`;
    }

    return {
      id: l.id,
      nom: l.name,
      sku: l.sku ?? null,
      categorie: l.categorie ?? null,
      marque: l.marque ?? null,
      actif: Boolean(l.isActive),
      suitLeStock: Boolean(l.trackInventory),
      stockAffiche,
      prix: l.sellingPrice ?? null,
    };
  });

  return { elements, total };
}

/** Compteurs des liens rapides de rubrique : Catégories, Marques, Unités. */
export async function compteursRubriques(): Promise<{
  categories: number;
  marques: number;
  unites: number;
}> {
  const un = async (t: typeof categories | typeof brands | typeof units) => {
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(t);
    return n;
  };
  return {
    categories: await un(categories),
    marques: await un(brands),
    unites: await un(units),
  };
}

// ------------------------------------------------------------------- lot 8

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Marge sur le PRIX DE VENTE, convention du projet (session 2026-08-15).
 *
 * La calculer sur le prix d'achat donnerait un chiffre plus flatteur et faux.
 * `null` quand un des deux prix manque : une marge de 0 % affirmerait qu'on
 * vend à prix coûtant, ce qui n'est pas la même chose que « on ne sait pas ».
 */
function marge(achat: number, vente: number): number | null {
  if (vente <= 0 || achat <= 0) return null;
  return ((vente - achat) / vente) * 100;
}

/**
 * Un couple achat / vente, pour un canal.
 *
 * Le produit porte QUATRE prix, deux par canal (`apps/products/pricing.py`) :
 *   détail : `cost_price` et `selling_price`, TOUJOURS à l'unité de détail
 *   gros   : `package_cost_price` et `wholesale_price`, au contenant entier
 *
 * Les mélanger est le piège : `cost_price` est la seule grandeur avec laquelle
 * le coût moyen pondéré et les lots FIFO savent travailler.
 */
export interface PrixCanal {
  canal: "retail" | "wholesale";
  label: string;
  achat: number | null;
  vente: number | null;
  /** Marge sur le PRIX DE VENTE. Null quand un des deux prix manque. */
  margePourcent: number | null;
}

export interface DetailArticle {
  id: string;
  nom: string;
  sku: string | null;
  codeBarres: string | null;
  description: string;
  categorie: string | null;
  marque: string | null;
  actif: boolean;

  /** Les QUATRE prix par canal, dans l'ordre du back-office. */
  prix: PrixCanal[];
  prixAchat: number;
  /** Marge sur le PRIX DE VENTE, convention du projet. */
  margePourcent: number | null;

  suitLeStock: boolean;
  stockNegatifAutorise: boolean;
  seuilReassort: number;
  uniteDetail: string | null;
  uniteContenant: string | null;
  unitesParContenant: number | null;
  modeVente: string | null;

  taxable: boolean;
  tauxTaxe: number;

  /** Stock par entrepôt, lisible en contenants. */
  stocks: { entrepot: string; affiche: string; total: number }[];
}

/**
 * Fiche d'un article. Miroir de `app/dashboard/products/[id]`.
 *
 * **La marge se calcule sur le PRIX DE VENTE**, pas sur le prix d'achat :
 * c'est la convention du projet, posée à la session 2026-08-15, et l'inverser
 * donnerait un chiffre plus flatteur et faux.
 *
 * `null` ne se lit jamais comme zéro : un prix de canal non défini s'affiche
 * « Non défini », pas « 0 ».
 */
export async function detailArticle(id: string): Promise<DetailArticle | null> {
  const { alias } = await import("drizzle-orm/sqlite-core");
  const uniteDetail = alias(units, "unite_detail");
  const uniteContenant = alias(units, "unite_contenant");

  const [l] = await db
    .select({
      produit: products,
      categorie: categories.name,
      marque: brands.name,
      unite: uniteDetail.name,
      uniteContenant: uniteContenant.name,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .where(eq(products.id, id))
    .limit(1);
  if (!l) return null;

  const p = l.produit;
  const lignesStock = await db
    .select({
      quantity: stocks.quantity,
      packageQuantity: stocks.packageQuantity,
      looseQuantity: stocks.looseQuantity,
      entrepot: warehouses.name,
    })
    .from(stocks)
    .leftJoin(warehouses, eq(warehouses.id, stocks.warehouseId))
    .where(eq(stocks.productId, id));

  const vente = nb(p.sellingPrice);
  const achat = nb(p.costPrice);

  const cond =
    p.unitsPerPackage && p.unitsPerPackage > 1
      ? getPackaging({
          selling_mode: p.sellingMode,
          units_per_package: p.unitsPerPackage,
          unit_name: l.unite,
          packaging_unit_name: l.uniteContenant,
        })
      : null;

  return {
    id: p.id,
    nom: p.name,
    sku: p.sku?.trim() || null,
    codeBarres: p.barcode?.trim() || null,
    description: p.shortDescription ?? "",
    categorie: l.categorie ?? null,
    marque: l.marque ?? null,
    actif: Boolean(p.isActive),

    // Les DEUX canaux, chacun avec son couple achat / vente.
    prix: [
      {
        canal: "retail",
        label: `Détail${l.unite ? ` (${l.unite})` : ""}`,
        achat: achat || null,
        vente: vente || null,
        margePourcent: marge(achat, vente),
      },
      {
        canal: "wholesale",
        label: `Gros${l.uniteContenant ? ` (${l.uniteContenant})` : ""}`,
        achat: nb(p.packageCostPrice) || null,
        vente: nb(p.wholesalePrice) || null,
        margePourcent: marge(nb(p.packageCostPrice), nb(p.wholesalePrice)),
      },
    ],
    prixAchat: achat,
    margePourcent: marge(achat, vente),

    suitLeStock: Boolean(p.trackInventory),
    stockNegatifAutorise: Boolean(p.allowNegativeStock),
    seuilReassort: Number(p.reorderPoint ?? 0),
    uniteDetail: l.unite ?? null,
    uniteContenant: l.uniteContenant ?? null,
    unitesParContenant: p.unitsPerPackage ?? null,
    modeVente: p.sellingMode ?? null,

    taxable: Boolean(p.isTaxable),
    tauxTaxe: nb(p.taxRate),

    stocks: lignesStock.map((s) => {
      const total = nb(s.quantity);
      return {
        entrepot: s.entrepot ?? "Entrepôt",
        affiche: cond
          ? formatPackagedSplit(cond, nb(s.packageQuantity), nb(s.looseQuantity))
          : `${total} ${pluralizeUnit(l.unite ?? "unité", total)}`,
        total,
      };
    }),
  };
}

export interface EntreeReferentiel {
  id: string;
  nom: string;
  detail: string | null;
  actif: boolean;
  /** Nombre de produits qui s'y rattachent. */
  produits: number;
}

/** Catégories, marques ou unités, avec leur nombre de produits. */
export async function referentiel(
  genre: "categories" | "marques" | "unites"
): Promise<EntreeReferentiel[]> {
  const tousProduits = await db
    .select({
      categoryId: products.categoryId,
      brandId: products.brandId,
      unitId: products.unitId,
    })
    .from(products);

  const compter = (choisir: (p: (typeof tousProduits)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const p of tousProduits) {
      const cle = choisir(p);
      if (cle) m.set(cle, (m.get(cle) ?? 0) + 1);
    }
    return m;
  };

  if (genre === "categories") {
    const n = compter((p) => p.categoryId);
    const lignes = await db.select().from(categories).orderBy(categories.name);
    return lignes.map((c) => ({
      id: c.id,
      nom: c.name,
      detail: c.parentId ? "Sous-catégorie" : null,
      actif: Boolean(c.isActive),
      produits: n.get(c.id) ?? 0,
    }));
  }
  if (genre === "marques") {
    const n = compter((p) => p.brandId);
    const lignes = await db.select().from(brands).orderBy(brands.name);
    return lignes.map((b) => ({
      id: b.id,
      nom: b.name,
      detail: null,
      actif: Boolean(b.isActive),
      produits: n.get(b.id) ?? 0,
    }));
  }
  const n = compter((p) => p.unitId);
  const lignes = await db.select().from(units).orderBy(units.name);
  return lignes.map((u) => ({
    id: u.id,
    nom: u.name,
    detail: u.symbol?.trim() || null,
    // Une UNITÉ n'a pas de drapeau d'activité au manifeste : elle est toujours
    // utilisable. Inventer un `false` ferait griser des unités valides.
    actif: true,
    produits: n.get(u.id) ?? 0,
  }));
}

/**
 * Noms de produits par identifiant.
 *
 * Le journal d'opérations ne porte QUE des identifiants, parce que c'est ce que
 * le serveur attend. Une fiche en attente d'envoi doit pourtant se lire : elle
 * relit donc les noms dans le catalogue local, en UNE requête plutôt qu'une par
 * ligne.
 */
export async function nomsDeProduits(
  ids: string[]
): Promise<Map<string, string>> {
  const uniques = [...new Set(ids.filter(Boolean))];
  if (uniques.length === 0) return new Map();
  const lignes = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(inArray(products.id, uniques));
  return new Map(lignes.map((l) => [l.id, l.name]));
}

/** Un article, tel que la SAISIE D'UN MOUVEMENT en a besoin. */
export interface ArticlePourMouvement {
  id: string;
  nom: string;
  sku: string | null;
  conditionnement: Packaging | null;
  aUneDatePeremption: boolean;
  /** Les quatre prix de la FICHE, en chaînes : ils ne servent qu'à préremplir. */
  coutDetail: string | null;
  coutContenant: string | null;
  prixDetail: string | null;
  prixGros: string | null;
}

/**
 * Le catalogue ENTIER, pour la saisie d'un mouvement de stock.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE N'EST PAS `chercherArticles`, ET LA DIFFÉRENCE EST DU MÉTIER.        │
 * │                                                                          │
 * │ Celui-là sert le COMPTOIR : il borne à `is_sellable`, joint le stock de  │
 * │ l'entrepôt de la session, applique le verrou d'inventaire et retranche   │
 * │ la réserve des ventes en file. Un consommable ou une matière première    │
 * │ n'y figure donc PAS - et c'est précisément ce qu'un magasinier           │
 * │ approvisionne. La recherche du back-office ne demande, elle, que         │
 * │ `is_active` : aucune condition de vendabilité.                           │
 * │                                                                          │
 * │ ⚠ Ce n'est pas non plus ce que fait `full_catalog=true` côté serveur, et │
 * │ la confusion est facile : ce drapeau lève le PÉRIMÈTRE ENTREPÔT, pas la  │
 * │ vendabilité. Il n'a d'équivalent à chercher nulle part ici, la table     │
 * │ `products` descendant entière au tirage.                                 │
 * │                                                                          │
 * │ Aucune jointure sur `stocks` : une entrée est légitime sur un article    │
 * │ qui n'a encore aucune ligne dans ce dépôt - c'est même le cas du         │
 * │ « stock initial ».                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function chercherArticlesPourMouvement(
  terme: string,
  limite = 30
): Promise<ArticlePourMouvement[]> {
  // DEUX ALIAS D'UNITÉ, et il en faut deux : une seule jointure ferait porter
  // au contenant le nom de l'unité de détail, et tout article conditionné
  // s'afficherait « 2 bouteilles + 3 bouteilles ». Défaut déjà payé, et
  // documenté dans `features/pos/catalogue.ts`.
  const uniteDetail = alias(units, "unite_detail_mvt");
  const uniteContenant = alias(units, "unite_contenant_mvt");

  const motif = terme.trim();
  const conditions = [
    eq(products.isActive, true),
    or(eq(products.isDeleted, false), isNull(products.isDeleted))!,
  ];
  if (motif) {
    const m = `%${motif.toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`lower(coalesce(${products.name}, ''))`, m),
        like(sql`lower(coalesce(${products.sku}, ''))`, m),
        like(sql`lower(coalesce(${products.barcode}, ''))`, m)
      )!
    );
  }

  const lignes = await db
    .select({
      id: products.id,
      nom: products.name,
      sku: products.sku,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      uniteDetail: uniteDetail.name,
      uniteContenant: uniteContenant.name,
      coutDetail: products.costPrice,
      coutContenant: products.packageCostPrice,
      prixDetail: products.sellingPrice,
      prixGros: products.wholesalePrice,
      perissable: products.hasExpiryDate,
    })
    .from(products)
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .where(and(...conditions))
    .orderBy(products.name)
    .limit(limite);

  return lignes.map((l) => ({
    id: l.id,
    nom: l.nom,
    sku: l.sku || null,
    // `getPackaging` et JAMAIS un `unitsPerPackage > 1` maison : lui seul
    // impose le facteur >= 2 et rend `null` sur un article vendu au détail
    // seul. Le back-office écrit la condition à la main et perd cette garde.
    conditionnement: getPackaging({
      selling_mode: l.sellingMode,
      units_per_package: l.unitsPerPackage,
      unit_name: l.uniteDetail,
      packaging_unit_name: l.uniteContenant,
    }),
    aUneDatePeremption: Boolean(l.perissable),
    coutDetail: l.coutDetail || null,
    coutContenant: l.coutContenant || null,
    prixDetail: l.prixDetail || null,
    prixGros: l.prixGros || null,
  }));
}

/** Un article, tel que la saisie d'un TRANSFERT en a besoin. */
export interface ArticlePourTransfert {
  id: string;
  nom: string;
  sku: string | null;
  conditionnement: Packaging | null;
  /**
   * Ce que porte l'entrepôt SOURCE, réservations imputées comme au comptoir.
   * `null` quand aucune ligne de stock n'existe pour ce dépôt : ce n'est PAS
   * zéro, et l'écran doit le dire autrement.
   */
  disponible: { contenants: number; vrac: number; total: number } | null;
  /** Le partage BRUT du rayon, réservations comprises. Pour le rappel « en rayon ». */
  rayon: { contenants: number; vrac: number; total: number } | null;
}

/**
 * Le catalogue, pour la saisie d'un TRANSFERT depuis un entrepôt donné.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE N'EST PAS `chercherArticles` DU COMPTOIR, ET LA DIFFÉRENCE EST DU     │
 * │ MÉTIER.                                                                  │
 * │                                                                          │
 * │ Celui-là borne à `is_sellable`, applique le VERROU D'INVENTAIRE et       │
 * │ retranche la réserve des ventes en file. Aucune de ces trois règles n'a  │
 * │ sa place ici : un consommable ou une matière première se transfère entre │
 * │ dépôts sans jamais se vendre, un inventaire en cours dans un magasin ne  │
 * │ dit rien de ce qu'on peut expédier depuis la réserve, et une vente en    │
 * │ file n'est pas une expédition. Le serveur ne pose d'ailleurs aucune de   │
 * │ ces conditions sur un transfert.                                         │
 * │                                                                          │
 * │ C'est le même écart que celui trouvé au lot des mouvements, sur l'autre  │
 * │ formulaire d'entrepôt : `chercherArticlesPourMouvement` a été écrit pour │
 * │ la même raison. Il ne convient pas ici pour autant : un transfert a      │
 * │ besoin du DISPONIBLE de la source, qu'un mouvement d'entrée ignore.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La jointure sur `stocks` est un LEFT JOIN, borné au dépôt : un article sans
 * ligne dans ce dépôt reste trouvable, et son disponible vaut `null` - qui ne
 * se lit jamais comme zéro.
 */
export async function chercherArticlesPourTransfert(
  entrepotSource: string,
  terme: string,
  limite = 30
): Promise<ArticlePourTransfert[]> {
  // DEUX ALIAS D'UNITÉ, et il en faut deux : une seule jointure ferait porter
  // au contenant le nom de l'unité de détail, et tout article conditionné
  // s'afficherait « 2 bouteilles + 3 bouteilles ».
  const uniteDetail = alias(units, "unite_detail_trf");
  const uniteContenant = alias(units, "unite_contenant_trf");

  const motif = terme.trim();
  const conditions = [
    eq(products.isActive, true),
    or(eq(products.isDeleted, false), isNull(products.isDeleted))!,
  ];
  if (motif) {
    const m = `%${motif.toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`lower(coalesce(${products.name}, ''))`, m),
        like(sql`lower(coalesce(${products.sku}, ''))`, m),
        like(sql`lower(coalesce(${products.barcode}, ''))`, m)
      )!
    );
  }

  const lignes = await db
    .select({
      id: products.id,
      nom: products.name,
      sku: products.sku,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      uniteDetail: uniteDetail.name,
      uniteContenant: uniteContenant.name,
      quantite: stocks.quantity,
      reserve: stocks.reservedQuantity,
      contenants: stocks.packageQuantity,
      vrac: stocks.looseQuantity,
    })
    .from(products)
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .leftJoin(
      stocks,
      and(eq(stocks.productId, products.id), eq(stocks.warehouseId, entrepotSource))
    )
    .where(and(...conditions))
    .orderBy(products.name)
    .limit(limite);

  return lignes.map((l) => {
    // `getPackaging` et JAMAIS un `unitsPerPackage > 1` maison : lui seul
    // impose le facteur >= 2 et rend `null` sur un article vendu au détail
    // seul.
    const conditionnement = getPackaging({
      selling_mode: l.sellingMode,
      units_per_package: l.unitsPerPackage,
      unit_name: l.uniteDetail,
      packaging_unit_name: l.uniteContenant,
    });

    // Pas de ligne de stock dans ce dépôt : on ne fabrique pas un zéro.
    if (l.quantite == null) {
      return { id: l.id, nom: l.nom, sku: l.sku || null, conditionnement, disponible: null, rayon: null };
    }

    const total = Number(l.quantite ?? 0);
    const reserve = Number(l.reserve ?? 0);
    const contenants = Number(l.contenants ?? 0);
    const vrac = Number(l.vrac ?? 0);

    // La MÊME imputation des réservations que le contrôle de vente : ce qui
    // s'affiche comme disponible est exactement ce que le serveur opposera à
    // l'expédition (`available_split`).
    const dispo = availableSplit(
      {
        quantity: total,
        reserved_quantity: reserve,
        package_quantity: contenants,
        loose_quantity: vrac,
      },
      conditionnement?.factor ?? null
    );

    return {
      id: l.id,
      nom: l.nom,
      sku: l.sku || null,
      conditionnement,
      disponible: {
        contenants: dispo.packages,
        vrac: dispo.loose,
        total: Math.max(0, total - reserve),
      },
      rayon: { contenants, vrac, total },
    };
  });
}
