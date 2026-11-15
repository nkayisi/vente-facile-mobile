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
import { and, asc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  availableSplit,
  formatPackagedSplit,
  formatUnitQuantity,
  getPackaging,
  type Packaging,
} from "@vente-facile/core";

import {
  ETAT_STOCK,
  etatDuRayon,
  type EtatStock,
  type FiltreEtatStock,
} from "@/data/etats-stock";
import { db } from "@/db/client";
import { brands, categories, products, stocks, units, warehouses } from "@/db/schema";

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Un prix de la fiche, ou `null`.
 *
 * ⚠ ZÉRO DEVIENT `null`, et ce n'est pas la même chose que `nb` : la colonne
 * vaut « 0.00 » pour un prix jamais renseigné, et pré-remplir un champ avec
 * zéro ferait lire « cet article coûte zéro » au lieu de le laisser invitant.
 */
const prixOuNull = (v: string | number | null | undefined): number | null => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Réexportés pour ne casser aucun appelant : leur domicile est le module pur.
export { ETAT_STOCK, type EtatStock, type FiltreEtatStock };

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
  /**
   * `Product.track_inventory`.
   *
   * ⚠ RENDU, parce que l'état ne suffit pas à rejouer le critère du serveur.
   * `etatDuRayon` range un rayon vide en « rupture » SANS regarder le suivi -
   * c'est juste pour l'affichage, `out` du serveur ne le teste pas non plus -
   * alors que les critères d'ALERTE et de RÉQUISITION l'exigent tous deux
   * (`check_low_stock_alerts`, `lignes_proposees`). Un appelant qui doit les
   * rejouer n'a donc pas à relire le catalogue pour un drapeau déjà lu ici.
   */
  suitLeStock: boolean;
  coutUnitaire: number;
  valeur: number;
  /**
   * Les QUATRE prix de la fiche, et la péremption.
   *
   * ⚠ `coutUnitaire` NE SUFFIT PAS, et il ne les remplace pas : c'est la
   * VALORISATION du rayon (`avg_cost`, à défaut `cost_price`), celle qui sert à
   * chiffrer un stock. Ces quatre-là sont les prix de la FICHE, ceux que le
   * formulaire d'un seul mouvement pré-remplit (`chercherArticlesPourMouvement`)
   * et sur lesquels se calcule une marge. Les confondre afficherait une marge
   * assise sur le coût moyen pondéré du rayon plutôt que sur ce qu'on paie.
   */
  prixAchatDetail: number | null;
  prixAchatContenant: number | null;
  prixVenteDetail: number | null;
  prixVenteGros: number | null;
  /** `Product.has_expiry_date` : la péremption devient alors obligatoire. */
  perissable: boolean;
  /**
   * Le nom de l'unité de DÉTAIL : bouteille, plaquette, pièce…
   *
   * ⚠ RENDU pour que la saisie nomme son canal. « Quantité en unité » est le
   * mot de personne ; « Quantité en PLAQUETTES » est celui du marchand, et
   * c'est déjà ce que `quantiteAffichee` emploie - il le lisait sans l'exposer.
   */
  uniteDetail: string | null;
  /**
   * Aucune ligne de stock n'existe encore pour cet article DANS CET ENTREPÔT.
   *
   * Rendu seulement par une lecture `catalogueEntier` : c'est le cas d'un
   * entrepôt neuf, ou d'une référence jamais reçue là. Les compteurs y valent
   * zéro parce qu'il n'y a RIEN, et l'écran doit le dire autrement qu'une
   * rupture constatée : `null` ne se lit jamais comme zéro.
   */
  sansLigneDeStock: boolean;
}

export interface FiltresNiveaux {
  recherche?: string;
  entrepot?: string | null;
  categorie?: string | null;
  /**
   * Plusieurs catégories, SOUS-ARBRES déjà résolus par l'appelant.
   *
   * ⚠ ELLE EST EN SQL, ET ELLE DOIT L'ÊTRE. Filtrer après la fenêtre
   * (`limite`) ferait lire trois cents rayons puis n'en garder aucun de la
   * catégorie demandée : c'est le défaut que `/rayon` a déjà payé, « une liste
   * filtrée était silencieusement tronquée, et `total` comptait la fenêtre ».
   */
  categories?: string[];
  etat?: FiltreEtatStock;
  /**
   * Ce qu'il faut RÉAPPROVISIONNER : sous un seuil réel, ruptures comprises.
   *
   * ⚠ CE N'EST PAS `etat: "bas"`, et la différence compte. `bas` exige
   * `quantite > 0` - c'est un état d'affichage, exclusif de « rupture » - alors
   * que `lignes_proposees` du serveur ne le teste pas : un rayon VIDE est
   * précisément celui qu'il faut racheter en premier. Les deux listes
   * diverger­aient sur tout article épuisé.
   */
  reassort?: boolean;
  /**
   * Partir du CATALOGUE, et non des lignes de stock : tout article suivi,
   * actif, avec son stock DANS `entrepot` s'il en a un.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UN ENTREPÔT NEUF NE S'APPROVISIONNAIT PAS.                           │
   * │                                                                      │
   * │ La feuille d'approvisionnement et celle d'ajustement lisaient        │
   * │ `stocks` : un article n'y apparaissait qu'après avoir déjà été reçu  │
   * │ dans cet entrepôt. Le premier approvisionnement d'un dépôt qu'on     │
   * │ vient de créer était donc impossible depuis le terminal - la liste   │
   * │ était vide - alors que le serveur le fait par un joint EXTERNE       │
   * │ (`_articles_du_perimetre`). On reprend sa forme, et son critère :    │
   * │ `track_inventory` exigé, un service n'a pas de stock.                │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * Exige `entrepot` : sans lui, « le stock de l'entrepôt » ne veut rien dire.
   */
  catalogueEntier?: boolean;
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
function conditionsEtat(etat: FiltreEtatStock | undefined) {
  if (!etat || etat === "tous") return [];

  const quantite = sql`cast(${stocks.quantity} as real)`;
  // ┌──────────────────────────────────────────────────────────────────────────┐
  // │ LE `cast` DU SEUIL EST OBLIGATOIRE, ET SON ABSENCE EST SILENCIEUSE.      │
  // │                                                                          │
  // │ `reorder_point` est passé de `PositiveIntegerField` à `DecimalField` le  │
  // │ jour où « alerter sous 2,5 kg » est devenu possible. Une décimale         │
  // │ descend au tirage sous forme de TEXTE, et en SQLite une valeur REAL      │
  // │ comparée à une valeur TEXT est TOUJOURS inférieure : le texte trie après │
  // │ tous les nombres.                                                        │
  // │                                                                          │
  // │ Sans ce `cast`, `seuil > 0` serait donc toujours vrai et                  │
  // │ `quantite <= seuil` toujours vrai : TOUT produit suivi s'afficherait     │
  // │ « Stock bas », sur l'écran dont le métier est de dire ce qu'il faut       │
  // │ réapprovisionner. Aucune erreur, aucun journal, et le magasinier         │
  // │ cesserait de lire une liste qui signale tout.                            │
  // └──────────────────────────────────────────────────────────────────────────┘
  const seuil = sql`coalesce(cast(${products.reorderPoint} as real), 0)`;
  const suivi = sql`coalesce(${products.trackInventory}, 0) = 1`;
  const sousLeSeuil = sql`${seuil} > 0 and ${quantite} <= ${seuil} and ${suivi}`;

  // La rupture ne regarde QUE la quantité : `out` du serveur ne teste pas
  // `track_inventory`, et un rayon vide est vide qu'on le suive ou non.
  // L'ALERTE du serveur (`low`), ruptures comprises, et SANS exiger un seuil
  // réel : c'est le critère exact de `low_stock_count` du tableau de bord
  // serveur, que la tuile du terminal reprend. Voir `FiltreEtatStock`.
  if (etat === "alerte") return [sql`${quantite} <= ${seuil} and ${suivi}`];
  if (etat === "rupture") return [sql`${quantite} <= 0`];
  if (etat === "bas") return [sql`${quantite} > 0 and ${sousLeSeuil}`];
  return [sql`${quantite} > 0 and not (${sousLeSeuil})`];
}

/**
 * Ce qu'il faut RÉAPPROVISIONNER, en SQL : miroir de `lignes_proposees`.
 *
 * ⚠ CE N'EST PAS `conditionsEtat("bas")`, et c'est la seule différence :
 * celui-là exige `quantite > 0`, parce que « bas » et « rupture » sont deux
 * ÉTATS exclusifs à l'écran. Le critère de RÉASSORT, lui, inclut les ruptures -
 * un rayon vide est celui qu'on rachète en premier. Les deux listes
 * divergeraient sur tout article épuisé.
 *
 * Les trois conditions sont celles du serveur, et les trois comptent : le suivi
 * (un service n'a pas de seuil), un seuil RÉEL (un `reorder_point` à zéro ne
 * déclenche rien, sinon tout article épuisé serait réapprovisionné en
 * permanence), et la quantité sous ce seuil. Le `cast` n'est pas optionnel,
 * pour la raison écrite juste au-dessus.
 */
function conditionReassort() {
  const quantite = sql`cast(${stocks.quantity} as real)`;
  const seuil = sql`coalesce(cast(${products.reorderPoint} as real), 0)`;
  const suivi = sql`coalesce(${products.trackInventory}, 0) = 1`;
  return sql`${seuil} > 0 and ${quantite} <= ${seuil} and ${suivi}`;
}

export async function niveauxDeStock(
  f: FiltresNiveaux = {}
): Promise<{ elements: LigneNiveau[]; total: number }> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;
  const uniteDetail = alias(units, "unite_detail");
  const uniteContenant = alias(units, "unite_contenant");

  const parCatalogue = Boolean(f.catalogueEntier && f.entrepot);

  const conditions = [
    // Par le catalogue, l'entrepôt est dans la JOINTURE : le mettre ici
    // écarterait précisément les articles qui n'y ont pas encore de ligne.
    f.entrepot && !parCatalogue ? eq(stocks.warehouseId, f.entrepot) : undefined,
    ...(parCatalogue
      ? [
          eq(products.isActive, true),
          eq(products.trackInventory, true),
          or(eq(products.isDeleted, false), isNull(products.isDeleted)),
        ]
      : []),
    f.categorie ? eq(products.categoryId, f.categorie) : undefined,
    // Plusieurs catégories : le SOUS-ARBRE que l'appelant a résolu. En SQL, et
    // non après la fenêtre - voir la docstring de `FiltresNiveaux.categories`.
    f.categories?.length ? inArray(products.categoryId, f.categories) : undefined,
    f.reassort ? conditionReassort() : undefined,
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

  const colonnes = {
      id: stocks.id,
      productId: products.id,
      stockProductId: stocks.productId,
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
      packageCostPrice: products.packageCostPrice,
      sellingPrice: products.sellingPrice,
      wholesalePrice: products.wholesalePrice,
      perissable: products.hasExpiryDate,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      unite: uniteDetail.name,
      uniteContenant: uniteContenant.name,
      categorie: categories.name,
      entrepot: warehouses.name,
  };
  const filtre = conditions.length > 0 ? and(...conditions) : undefined;

  const lignes = parCatalogue
    ? await db
        .select(colonnes)
        .from(products)
        .leftJoin(
          stocks,
          and(eq(stocks.productId, products.id), eq(stocks.warehouseId, f.entrepot!))
        )
        .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
        .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
        .leftJoin(categories, eq(categories.id, products.categoryId))
        .leftJoin(warehouses, eq(warehouses.id, stocks.warehouseId))
        .where(filtre)
        .orderBy(asc(products.name))
        .limit(f.limite ?? 200)
    : await db
        .select(colonnes)
        .from(stocks)
        .leftJoin(products, eq(products.id, stocks.productId))
        .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
        .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
        .leftJoin(categories, eq(categories.id, products.categoryId))
        .leftJoin(warehouses, eq(warehouses.id, stocks.warehouseId))
        .where(filtre)
        .orderBy(asc(products.name))
        .limit(f.limite ?? 200);

  const rendues = lignes.map((l) => {
    // Le produit vient de la table qui MÈNE la lecture : `products` par le
    // catalogue, `stocks` sinon (un produit supprimé y laisse sa ligne).
    const produitId = l.productId ?? l.stockProductId ?? "";
    const sansLigneDeStock = l.id === null;
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
      // Sans ligne de stock, l'identifiant de rangée se fabrique sur le
      // produit : il est unique dans une lecture bornée à UN entrepôt.
      id: l.id ?? `produit:${produitId}`,
      produitId,
      produit: l.produit ?? "Produit supprimé",
      sku: l.sku ?? null,
      categorie: l.categorie ?? null,
      entrepot: l.entrepot ?? null,
      entrepotId: l.warehouseId ?? f.entrepot ?? null,
      quantiteAffichee: sansLigneDeStock
        ? "Aucun stock ici"
        : cond
          ? formatPackagedSplit(cond, paquets, vrac)
          : `${formatUnitQuantity(total, l.unite ?? "unité")}`,
      disponibleAffiche: cond
        ? formatPackagedSplit(cond, dispo.packages, dispo.loose)
        : formatUnitQuantity(Math.max(0, total - reserve), l.unite ?? "unité"),
      total,
      reserve,
      facteur: cond?.factor ?? null,
      contenants: paquets,
      vrac,
      conditionnement: cond,
      seuilReassort: seuil,
      etat,
      suitLeStock: Boolean(l.trackInventory),
      coutUnitaire: cout,
      valeur: total * cout,
      prixAchatDetail: prixOuNull(l.costPrice),
      prixAchatContenant: prixOuNull(l.packageCostPrice),
      prixVenteDetail: prixOuNull(l.sellingPrice),
      prixVenteGros: prixOuNull(l.wholesalePrice),
      perissable: Boolean(l.perissable),
      uniteDetail: cond?.retailWord ?? l.unite ?? null,
      sansLigneDeStock,
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
      packageCostPrice: products.packageCostPrice,
      sellingPrice: products.sellingPrice,
      wholesalePrice: products.wholesalePrice,
      perissable: products.hasExpiryDate,
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
      : `${formatUnitQuantity(total, l.unite ?? "unité")}`,
    disponibleAffiche: cond
      ? formatPackagedSplit(cond, dispo.packages, dispo.loose)
      : formatUnitQuantity(Math.max(0, total - reserve), l.unite ?? "unité"),
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
    suitLeStock: Boolean(l.trackInventory),
    coutUnitaire: cout,
    valeur: total * cout,
    prixAchatDetail: prixOuNull(l.costPrice),
    prixAchatContenant: prixOuNull(l.packageCostPrice),
    prixVenteDetail: prixOuNull(l.sellingPrice),
    prixVenteGros: prixOuNull(l.wholesalePrice),
    perissable: Boolean(l.perissable),
    sansLigneDeStock: false,
    emplacement: null,
    dernierMouvement: s.lastMovementAt ?? null,
    dernierComptage: s.lastCountedAt ?? null,
  };
}
