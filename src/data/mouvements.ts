/**
 * Journal des mouvements de stock.
 * Miroir de `app/dashboard/stock/movements/page.tsx`.
 *
 * **La quantité est rendue dans les termes de la SAISIE D'ORIGINE**
 * (`input_package_quantity`, `input_loose_quantity`, `packaging_factor` figé
 * sur la ligne), jamais redécoupée au conditionnement d'aujourd'hui. Un produit
 * repassé de 24 à 12 unités par casier ferait sinon diverger l'historique à
 * chaque changement de facteur : c'est le défaut que le back-office a corrigé
 * dans ses exports.
 */
import { and, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { formatPackagedSplit, getPackaging, pluralizeUnit } from "@vente-facile/core";

import { db } from "@/db/client";
import { identifiantsSousArbre } from "@/data/categories";
import { bornesLocales, type PeriodeFiltre } from "@/data/periode-filtre";
import {
  TYPE_MOUVEMENT_STOCK,
  cumulerParSens,
  typesFiltres,
} from "@/data/types-mouvement";
import { products, stockMovements, units, warehouses } from "@/db/schema";

export interface MouvementStock {
  id: string;
  produit: string;
  sku: string | null;
  entrepot: string | null;
  type: string;
  typeLabel: string;
  entree: boolean;
  /** « 10 cartons + 5 bouteilles », dans les termes de la saisie. */
  quantiteAffichee: string;
  date: Date | null;
}

export interface FiltresMouvements {
  recherche?: string;
  /** Code de type, ou `null` pour tous. */
  type?: string | null;
  /** `true` : entrées seules. `false` : sorties seules. `null` : les deux. */
  entree?: boolean | null;
  entrepot?: string | null;
  /** Catégorie du produit. Le SOUS-ARBRE y est inclus, comme côté serveur. */
  categorie?: string | null;
  periode?: PeriodeFiltre;
  limite?: number;
}

/**
 * Un périmètre RÉSOLU : ce qui demandait une lecture est déjà lu.
 *
 * Le sous-arbre de catégories vit en base ; le chercher dans `conditionsDe`
 * rendrait ce constructeur asynchrone, donc impossible à partager entre la
 * liste et le cadran sans le lire DEUX fois par rendu.
 */
interface PerimetreMouvements {
  filtres: FiltresMouvements;
  /** `null` : aucun filtre de catégorie. */
  categories: string[] | null;
}

async function resoudre(f: FiltresMouvements): Promise<PerimetreMouvements> {
  return { filtres: f, categories: await identifiantsSousArbre(f.categorie ?? null) };
}

/**
 * Les conditions SQL d'un jeu de filtres, le sens compris.
 *
 * La liste et le cadran partagent ce constructeur, faute de quoi le compteur,
 * les lignes et le fichier exporté pourraient porter trois périmètres
 * différents.
 *
 * Le SENS y entre par `codesParSens`, donc par la table des types : c'est elle
 * qui fait foi, et c'est la même liste que celle envoyée à l'export. L'écrire
 * en conditions dérivées la ferait diverger au premier type ajouté.
 *
 * ⚠ Il vivait auparavant en JavaScript, APRÈS lecture, ce qui obligeait la
 * requête à demander trois fois la fenêtre pour ne pas rendre une page
 * tronquée - et rendait tout comptage exact impossible.
 */
function conditionsDe(p: PerimetreMouvements) {
  const filtres = p.filtres;
  const terme = (filtres.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;

  // LE TYPE ET LE SENS S'INTERSECTENT, ils ne s'écrasent pas. `[]` dit que le
  // couple est contradictoire (sens « Entrées » et type « Vente ») : la liste
  // doit alors être vide, comme le document. `inArray(x, [])` n'étant pas
  // fiable, on pose la condition impossible, motif déjà employé ailleurs.
  const types = typesFiltres(filtres.type ?? null, filtres.entree ?? null);

  const { debutMs, finMs } = filtres.periode
    ? bornesLocales(filtres.periode)
    : { debutMs: null, finMs: null };

  const conditions = [
    types === null
      ? undefined
      : types.length === 0
        ? sql`1 = 0`
        : inArray(stockMovements.movementType, types),
    filtres.entrepot ? eq(stockMovements.warehouseId, filtres.entrepot) : undefined,
    p.categories ? inArray(products.categoryId, p.categories) : undefined,
    debutMs != null ? gte(stockMovements.createdAt, new Date(debutMs)) : undefined,
    finMs != null ? lte(stockMovements.createdAt, new Date(finMs)) : undefined,
    terme
      ? or(
          like(sql`lower(coalesce(${products.name}, ''))`, motif),
          like(sql`lower(coalesce(${products.sku}, ''))`, motif),
          // LES NOTES AUSSI, et c'est une réparation : `filter_search` du
          // serveur y cherche depuis toujours (`product__name | product__sku |
          // notes`). Sans elles, chercher « casse » montrait N lignes à
          // l'écran et en exportait N+k, sans que rien ne le signale.
          like(sql`lower(coalesce(${stockMovements.notes}, ''))`, motif)
        )
      : undefined,
  ].filter(Boolean);
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Les quatre relevés du journal, sur TOUT le périmètre filtré.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ILS SE CALCULENT EN SQL, JAMAIS SUR LA PAGE AFFICHÉE.                   │
 * │                                                                          │
 * │ Les sommer sur les lignes chargées donnerait le poids de la FENÊTRE      │
 * │ sous un libellé qui annonce la période. Un total faux qui a l'air juste  │
 * │ est le défaut que le back-office a dû corriger sur ses niveaux de stock, │
 * │ puis l'historique des ventes sur ses deux chiffres.                      │
 * │                                                                          │
 * │ Les décimales voyageant en TEXTE, le `cast` n'est pas optionnel - sans   │
 * │ lui SQLite additionnerait des chaînes. Et `abs` non plus : voir          │
 * │ `cumulerParSens`, une sortie est négative en base et deux lignes         │
 * │ anciennes portent la convention inverse.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Deux requêtes, et il en faut deux : le SENS se départage par type, donc par
 * un GROUP BY, tandis que les articles distincts se comptent sur l'ensemble -
 * un `count(distinct)` par type compterait deux fois un produit qui a bougé de
 * deux façons.
 *
 * Pas de relevé en ARGENT, et c'est délibéré : la colonne « Valeur » du
 * document est signée et son total est une VARIATION (ce qui est entré moins
 * le coût de ce qui est sorti), pas un volume mouvementé. L'afficher sous un
 * libellé de volume serait faux ; le nommer « variation » dans un cadran de
 * comptoir n'apprendrait rien. Le fichier le porte pour qui en a besoin.
 */
export async function relevesMouvements(
  filtres: FiltresMouvements = {}
): Promise<RelevesMouvements> {
  return _releves(await resoudre(filtres));
}

async function _releves(perimetre: PerimetreMouvements): Promise<RelevesMouvements> {
  const filtre = conditionsDe(perimetre);

  const [parType, [global]] = await Promise.all([
    db
      .select({
        type: stockMovements.movementType,
        nombre: sql<number>`count(*)`,
        quantite: sql<number>`sum(abs(cast(${stockMovements.quantity} as real)))`,
      })
      .from(stockMovements)
      .leftJoin(products, eq(products.id, stockMovements.productId))
      .where(filtre)
      .groupBy(stockMovements.movementType),
    db
      .select({
        // Combien d'ARTICLES ont bougé : « 44 mouvements sur 6 articles » ne se
        // lit nulle part ailleurs, et c'est ce qui dit si la période a remué
        // tout le rayon ou toujours le même produit.
        articles: sql<number>`count(distinct ${stockMovements.productId})`,
      })
      .from(stockMovements)
      .leftJoin(products, eq(products.id, stockMovements.productId))
      .where(filtre),
  ]);

  // Un périmètre vide rend `null` sur les sommes, jamais zéro : un `NaN`
  // traverserait le formateur en silence.
  const cumul = cumulerParSens(
    parType.map((l) => ({
      type: l.type,
      nombre: Number(l.nombre) || 0,
      quantite: Number(l.quantite) || 0,
    }))
  );

  return { ...cumul, articles: Number(global?.articles) || 0 };
}

/** Les quatre relevés du cadran. */
export interface RelevesMouvements {
  nombre: number;
  /** Articles DISTINCTS touchés sur le périmètre. */
  articles: number;
  /** Unités entrées, en magnitude. */
  entrees: number;
  /** Unités sorties, en magnitude : le libellé porte déjà le sens. */
  sorties: number;
}

export interface JournalMouvements {
  elements: MouvementStock[];
  releves: RelevesMouvements;
  /** Vrai quand la fenêtre n'a pas tout ramené : il reste des lignes derrière. */
  tronque: boolean;
}

/**
 * La liste ET son cadran, en une seule lecture.
 *
 * Un seul point d'entrée pour l'écran : deux abonnements séparés rendraient
 * deux états qui se rafraîchissent à des instants différents, et le compteur
 * pourrait annoncer un nombre que la liste ne porte pas encore.
 */
export async function journalMouvements(
  filtres: FiltresMouvements = {}
): Promise<JournalMouvements> {
  // UNE seule résolution du sous-arbre pour les deux lectures : la liste et le
  // cadran doivent porter le même périmètre, et le relire deux fois par rendu
  // n'y ajouterait qu'une occasion de diverger.
  const perimetre = await resoudre(filtres);
  const [elements, releves] = await Promise.all([_liste(perimetre), _releves(perimetre)]);
  return { elements, releves, tronque: releves.nombre > elements.length };
}

export async function listeMouvements(
  f: FiltresMouvements | number = {}
): Promise<MouvementStock[]> {
  // Compatibilité : l'appelant historique passait une limite nue.
  const filtres: FiltresMouvements = typeof f === "number" ? { limite: f } : f;
  return _liste(await resoudre(filtres));
}

async function _liste(perimetre: PerimetreMouvements): Promise<MouvementStock[]> {
  const filtres = perimetre.filtres;
  const limite = filtres.limite ?? 100;

  // DEUX ALIAS, et il en faut deux : une seule jointure sur `units` ferait
  // porter au contenant le nom de l'unité de détail.
  const uniteDetail = alias(units, "unite_detail_mvt");
  const uniteContenant = alias(units, "unite_contenant_mvt");

  const lignes = await db
    .select({
      id: stockMovements.id,
      movementType: stockMovements.movementType,
      quantity: stockMovements.quantity,
      inputPackageQuantity: stockMovements.inputPackageQuantity,
      inputLooseQuantity: stockMovements.inputLooseQuantity,
      packagingFactor: stockMovements.packagingFactor,
      createdAt: stockMovements.createdAt,
      produit: products.name,
      sku: products.sku,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      unite: uniteDetail.name,
      uniteContenant: uniteContenant.name,
      entrepot: warehouses.name,
    })
    .from(stockMovements)
    .leftJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .leftJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
    .where(conditionsDe(perimetre))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limite);

  const rendus = lignes.map((m) => {
    const t = TYPE_MOUVEMENT_STOCK[m.movementType] ?? {
      label: m.movementType,
      entree: true,
    };
    const total = Math.abs(Number(m.quantity ?? 0));
    const paquets = Number(m.inputPackageQuantity ?? 0);
    const vrac = Number(m.inputLooseQuantity ?? 0);

    // Le facteur FIGÉ sur la ligne, jamais celui du produit aujourd'hui.
    const facteur = m.packagingFactor != null ? Number(m.packagingFactor) : null;
    const conditionnement =
      facteur && facteur >= 2
        ? getPackaging({
            selling_mode: m.sellingMode,
            units_per_package: facteur,
            unit_name: m.unite,
            // ⚠ LE NOM DU CONTENANT DEMANDE UNE SECONDE JOINTURE.
            //
            // `packaging_unit_id` était SÉLECTIONNÉ et jamais joint : le nom
            // n'arrivait pas, `getPackaging` retombait sur son repli, et le
            // journal écrivait « 2 contenants + 3 AMPOULES » là où le rayon
            // porte des BOITES. Un mot que personne n'emploie au comptoir, et
            // le défaut exact que le lot 7 avait corrigé sur les niveaux de
            // stock sans jamais le reporter ici.
            packaging_unit_name: m.uniteContenant,
          })
        : null;

    const quantiteAffichee =
      conditionnement && (paquets > 0 || vrac > 0)
        ? formatPackagedSplit(conditionnement, paquets, vrac)
        : `${total} ${pluralizeUnit(m.unite ?? "unité", total)}`;

    return {
      id: m.id,
      produit: m.produit ?? "Produit supprimé",
      sku: m.sku ?? null,
      entrepot: m.entrepot ?? null,
      type: m.movementType,
      typeLabel: t.label,
      entree: t.entree,
      quantiteAffichee,
      date: m.createdAt ?? null,
    };
  });

  return rendus;
}
