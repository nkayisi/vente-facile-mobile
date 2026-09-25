/**
 * Relevés du tableau de bord. Miroir de `app/dashboard/page.tsx`.
 *
 * **Chaque relevé se compare à la période PRÉCÉDENTE de même longueur**, comme
 * le back-office : « ↗ 100 % vs période précédente ». Une variation sans point
 * de comparaison ne dit rien.
 */
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getPackaging } from "@vente-facile/core";

import { db } from "@/db/client";
import { deviseOuPrincipale } from "./devise-principale";
import {
  customers,
  paymentMethods,
  payments,
  products,
  saleItems,
  sales,
  stocks,
  units,
} from "@/db/schema";
import { ventesEnAttenteDetaillees } from "@/features/ventes/attente";
import {
  fusionnerVentesEnFile,
  retientVenteEnFile,
  type Fusion,
} from "@/features/tableau-de-bord/en-file";
import type {
  ContexteFile,
  FiltrePerimetre,
} from "@/features/perimetre/filtre-perimetre";
import { referencesDejaTirees } from "./deja-tirees";
import {
  cumulerProduits,
  libelleQuantite,
  type LigneVendue,
} from "@/features/tableau-de-bord/produits";
import {
  bornes,
  cleDeSeau,
  seauxDePeriode,
  type Periode,
} from "@/features/tableau-de-bord/series";

const nb = (v: string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Un montant de vente ramené en DEVISE PRINCIPALE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TABLEAU DE BORD EST UN ÉCRAN EN DEVISE PRINCIPALE.                    │
 * │                                                                          │
 * │ Il ventilait par devise et offrait un sélecteur ; le back-office, lui,   │
 * │ additionnait les monnaies sans regarder. Aucune des deux lectures n'est  │
 * │ celle qu'attend le marchand : ses prix d'achat comme ses prix de vente   │
 * │ sont tenus en devise principale, et c'est dans cette monnaie qu'il juge  │
 * │ sa journée. Le livre de caisse RESTE multi-devise, lui : il rend la      │
 * │ réalité physique du tiroir, où les liasses ne se mélangent pas.          │
 * │                                                                          │
 * │ `exchange_rate` est le taux FIGÉ sur la vente (unités de principale pour │
 * │ une unité de la devise de facture). Jamais le taux du jour : un tableau  │
 * │ de bord dont les chiffres d'hier bougent avec le cours n'est pas         │
 * │ relisable, et le marchand ne saurait pas lequel croire. C'est aussi ce   │
 * │ que fait `primary_sum` côté serveur.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const enPrincipale = (v: {
  total: string | null;
  exchangeRate: string | null;
}): number => {
  const taux = nb(v.exchangeRate);
  // Un taux nul ou absent vaudrait « montant à zéro » : sur une vente en devise
  // secondaire dont le taux n'aurait pas été enregistré, le chiffre d'affaires
  // perdrait la vente en silence. Le taux neutre laisse au moins le montant.
  return nb(v.total) * (taux > 0 ? taux : 1);
};

/**
 * `Periode` vit dans le module PUR `features/tableau-de-bord/series`, avec le
 * découpage qui la consomme. Elle est re-exportée ici pour que les écrans
 * gardent un seul import, et parce que ce fichier reste l'entrée du tableau
 * de bord.
 */
export type { Periode };

/**
 * Les bornes vivent dans le module PUR `features/tableau-de-bord/series`, avec
 * le découpage qui les consomme : c'est ce qui les rend testables sans ouvrir
 * la base, et elles doivent l'être - un décalage de bornes ne lève rien, il
 * fait simplement disparaître des ventes d'un écran.
 */
export { bornes };

/**
 * Libellés du sélecteur et de la ligne de sous-titre, repris du web.
 *
 * Ils NOMMENT la fenêtre glissante. « Mois » laissait entendre le mois
 * calendaire, et le marchand qui ne retrouvait pas ses ventes de la semaine
 * dans « Mois » y lisait une perte de données plutôt qu'un début de mois.
 */
export const LABELS_PERIODE: Record<Periode, { bouton: string; phrase: string }> = {
  day: { bouton: "Jour", phrase: "Aujourd'hui" },
  week: { bouton: "7 jours", phrase: "Les 7 derniers jours" },
  month: { bouton: "30 jours", phrase: "Les 30 derniers jours" },
  year: { bouton: "12 mois", phrase: "Les 12 derniers mois" },
};

/**
 * Les ventes du journal, prêtes à être fusionnées aux tables tirées.
 *
 * La mise en forme, les conversions et le dédoublonnage vivent dans le module
 * PUR `features/tableau-de-bord/en-file`, avec leurs tests. Ici on ne fait que
 * LIRE : le journal, les références déjà tirées, et le catalogue local d'où
 * viennent le facteur de conditionnement et le prix d'achat.
 */
/**
 * Les conditions SQL du périmètre sur `sales`.
 *
 * Rendues en TABLEAU pour se glisser dans un `and(...)` existant : la table
 * porte les deux colonnes en direct (`warehouse_id`, `sold_by_id`), aucune
 * jointure n'est donc nécessaire, et les listes `TABLES_*` n'ont pas à gagner
 * `registers` ni `register_sessions`.
 */
function conditionsDePerimetre(perimetre: FiltrePerimetre) {
  return [
    perimetre.entrepot ? eq(sales.warehouseId, perimetre.entrepot) : undefined,
    perimetre.utilisateur ? eq(sales.soldById, perimetre.utilisateur) : undefined,
  ].filter(Boolean);
}

async function ventesEnFile(
  perimetre: FiltrePerimetre,
  file: ContexteFile
): Promise<Fusion> {
  const toutes = await ventesEnAttenteDetaillees();
  // On filtre AVANT la fusion : une passe au lieu de deux, et le
  // dédoublonnage se calcule alors sur la population réellement retenue.
  const attente = toutes.filter((v) => retientVenteEnFile(v, perimetre, file));
  if (attente.length === 0) return { ventes: [], lignes: [], reglements: [] };

  const dejaTirees = await referencesDejaTirees(attente.map((v) => v.reference));

  const facteurs = new Map<string, number | null>();
  const couts = new Map<string, number>();
  for (const p of await db
    .select({
      id: products.id,
      cost: products.costPrice,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
    })
    .from(products)) {
    // Le facteur du catalogue est celui d'AUJOURD'HUI, là où une ligne tirée
    // porte celui qui était figé le jour de la vente. L'écart est nul ici : une
    // vente encore en file a été encaissée il y a quelques minutes ou quelques
    // heures, et le facteur n'a pas pu changer entre-temps sans que le stock du
    // comptoir change aussi. C'est la seule source disponible avant la poussée.
    facteurs.set(
      p.id,
      getPackaging({
        selling_mode: p.sellingMode,
        units_per_package: p.unitsPerPackage,
      })?.factor ?? null
    );
    couts.set(p.id, nb(p.cost));
  }

  return fusionnerVentesEnFile({ ventes: attente, dejaTirees, facteurs, couts });
}

/** La forme d'une vente, qu'elle vienne du tirage ou du journal. */
interface VenteTiree {
  id: string;
  total: string | null;
  exchangeRate: string | null;
  saleDate: Date | null;
  status: string | null;
  isDeleted: boolean | null;
}

/** Une ligne, qu'elle vienne du tirage ou du journal. Coût DÉJÀ multiplié. */
interface LigneRetenue {
  saleId: string;
  quantite: number;
  cout: number;
}

export interface CarteReleve {
  /** Chiffre d'affaires de la période, EN DEVISE PRINCIPALE. */
  ventes: number;
  variationVentes: number;
  clients: number;
  nouveauxClients: number;
  unitesVendues: number;
  variationUnites: number;
  /** Bénéfice brut, en devise principale lui aussi. */
  benefice: number;
  /** Marge en pourcentage, ou `null` quand il n'y a rien à rapporter. */
  marge: number | null;
}

/** Recopie de `calc_variation` du serveur : sans précédent, 100 % ou 0. */
function variation(courant: number, precedent: number): number {
  if (!precedent) return courant ? 100 : 0;
  return Math.round(((courant - precedent) / precedent) * 1000) / 10;
}

export async function relevesTableauDeBord(
  p: Periode,
  perimetre: FiltrePerimetre,
  file: ContexteFile
): Promise<CarteReleve> {
  const { debut, fin, debutPrecedent, finPrecedent } = bornes(p);

  // SEULES LES VENTES TERMINEES COMPTENT, et non supprimées. Le serveur filtre
  // `status='completed', is_deleted=False`. Compter un brouillon ou une vente
  // annulée dans le chiffre d'affaires serait une contrevérité, d'autant plus
  // trompeuse qu'elle a l'air exacte.
  const toutes = await db
    .select({
      id: sales.id,
      total: sales.total,
      exchangeRate: sales.exchangeRate,
      saleDate: sales.saleDate,
      status: sales.status,
      isDeleted: sales.isDeleted,
    })
    .from(sales)
    // ⚠ CETTE LECTURE N'AVAIT AUCUN `.where()` : elle chargeait toute la table
    // pour filtrer en JavaScript. Le périmètre la force à devenir une vraie
    // requête, et c'est un gain que le filtre rend obligatoire.
    .where(and(...conditionsDePerimetre(perimetre)));

  const enFile = await ventesEnFile(perimetre, file);
  const duJournal: VenteTiree[] = enFile.ventes.map((v) => ({
    id: v.id,
    // Le total est DÉJÀ en principale : le taux a été appliqué par le module de
    // fusion, qui seul sait si le ticket était rangé en principale (version 1)
    // ou en devise de facture (version 2). Le repasser par `enPrincipale`
    // le convertirait une seconde fois.
    total: v.totalPrincipal === null ? null : String(v.totalPrincipal),
    exchangeRate: "1",
    saleDate: v.date,
    status: v.status,
    isDeleted: false,
  }));
  const retenues = [...toutes, ...duJournal].filter(
    (v) => v.status === "completed" && !v.isDeleted && v.saleDate
  );
  const dansPeriode = retenues.filter((v) => v.saleDate! >= debut && v.saleDate! < fin);
  const avant = retenues.filter(
    (v) => v.saleDate! >= debutPrecedent && v.saleDate! < finPrecedent
  );

  const idsPeriode = new Set(dansPeriode.map((v) => v.id));
  const idsAvant = new Set(avant.map((v) => v.id));
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ UN MONTANT INCONNU N'ENTRE NI EN RECETTE NI EN COÛT.                  │
  // │                                                                        │
  // │ Une vente du journal dont le ticket est introuvable a des unités       │
  // │ CERTAINES - elles viennent du corps de l'opération - mais une recette  │
  // │ inconnue. Compter son coût sans sa recette ferait plonger le bénéfice  │
  // │ d'un montant que rien à l'écran n'explique, et la marge avec lui. Ses  │
  // │ unités comptent, son argent non : c'est « null ne se lit jamais comme  │
  // │ zéro » appliqué aux deux bouts de la soustraction.                     │
  // └────────────────────────────────────────────────────────────────────────┘
  const idsChiffrables = new Set(
    dansPeriode.filter((v) => v.total !== null).map((v) => v.id)
  );
  const lignes: LigneRetenue[] = [
    ...(await db
      .select({
        saleId: saleItems.saleId,
        quantity: saleItems.quantity,
        costPrice: saleItems.costPrice,
      })
      .from(saleItems)).map((l) => ({
        saleId: l.saleId,
        quantite: nb(l.quantity),
        cout: nb(l.costPrice) * nb(l.quantity),
      })),
    // Les lignes du journal portent leur coût DÉJÀ multiplié par la quantité :
    // le module de fusion le tire du catalogue local, une vente en file n'ayant
    // aucun `cost_price` sur ses lignes - le serveur le pose à la création.
    ...enFile.lignes.map((l) => ({
      saleId: l.saleId,
      quantite: l.quantite,
      cout: l.cout,
    })),
  ];

  let unites = 0;
  let unitesAvant = 0;
  let cout = 0;
  for (const l of lignes) {
    const q = l.quantite;
    if (idsPeriode.has(l.saleId)) {
      unites += q;
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ LE COÛT N'EST PAS CONVERTI, ET C'EST VOLONTAIRE.                 │
      // │                                                                  │
      // │ `cost_price` vient du catalogue, qui n'a pas de devise : il est  │
      // │ DÉJÀ en principale, comme le prix d'achat que le marchand a      │
      // │ saisi. Lui appliquer le taux d'une vente en francs le diviserait │
      // │ par deux mille huit cents, et la marge afficherait 100 %.        │
      // └──────────────────────────────────────────────────────────────────┘
      if (idsChiffrables.has(l.saleId)) cout += l.cout;
    } else if (idsAvant.has(l.saleId)) {
      unitesAvant += q;
    }
  }

  const totalPeriode = dansPeriode.reduce((s, v) => s + enPrincipale(v), 0);
  const totalAvant = avant.reduce((s, v) => s + enPrincipale(v), 0);

  const tousClients = await db
    .select({ id: customers.id, createdAt: customers.createdAt })
    .from(customers);
  const nouveaux = tousClients.filter(
    (c) => c.createdAt && c.createdAt >= debut && c.createdAt < fin
  );

  const benefice = totalPeriode - cout;

  return {
    ventes: totalPeriode,
    variationVentes: variation(totalPeriode, totalAvant),
    clients: tousClients.length,
    nouveauxClients: nouveaux.length,
    unitesVendues: unites,
    variationUnites: variation(unites, unitesAvant),
    benefice,
    // La marge est un RAPPORT : sans chiffre d'affaires, elle ne se rattache à
    // rien et un « 0 % » se lirait comme une vente à perte.
    marge: totalPeriode > 0 ? (benefice / totalPeriode) * 100 : null,
  };
}

// ===========================================================================
// LES GRAPHIQUES ET LES TABLEAUX DU BAS
//
// Tout est calculé LOCALEMENT, sur les tables tirées : le tableau de bord doit
// s'ouvrir hors ligne, c'est le premier écran que le marchand regarde le matin.
// Les définitions suivent celles du serveur (`organizations/views.py::dashboard`)
// pour que le terminal et le back-office ne donnent jamais deux chiffres pour
// le même établissement.
// ===========================================================================

export interface PointSerie {
  label: string;
  valeur: number;
}

export interface TranchePaiement {
  nom: string;
  /** Montant en devise principale : c'est lui qui donne la part. */
  montant: number;
  nombre: number;
}

export interface TrancheDevise {
  /** Code de la devise du BILLET reçu. */
  code: string;
  /** Montant tel que le caissier l'a compté, dans cette devise. */
  natif: number;
  /** Le même, ramené en devise principale. */
  principal: number;
  nombre: number;
}

export interface GraphesTableauDeBord {
  evolution: PointSerie[];
  /** Encaissements par DEVISE du billet reçu. */
  devises: TrancheDevise[];
  /** Les mêmes encaissements, par moyen de paiement, en principale. */
  paiements: TranchePaiement[];
  /** Total encaissé sur la période, en devise principale. */
  totalEncaisse: number;
  /** Total facturé sur la période, en devise principale. */
  totalVendu: number;
}

/**
 * L'évolution des ventes et la répartition des encaissements, EN PRINCIPALE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ANNEAU VENTILE PAR DEVISE, PAS PAR MOYEN DE PAIEMENT.                 │
 * │                                                                          │
 * │ Sur un écran tout entier converti, la question qui reste est « en quelle │
 * │ monnaie l'argent est entré », et elle ne se lit nulle part ailleurs. La  │
 * │ PART se calcule sur le montant converti - sans quoi 7 728 FC et          │
 * │ 132 775 $ ne seraient pas comparables et l'anneau mentirait - mais la    │
 * │ légende porte AUSSI le montant natif, qui est celui que le caissier a    │
 * │ compté dans son tiroir.                                                  │
 * │                                                                          │
 * │ Les moyens de paiement restent servis, en second plan : même contenu     │
 * │ qu'avant, rangé au rang qui est désormais le sien.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **L'évolution et l'anneau ne parlent pas de la même chose** : la première
 * suit la FACTURE, le second le BILLET reçu. Une vente libellée en dollars peut
 * être réglée en francs, et les deux lectures sont justes. L'écran écrit donc
 * « facturé » d'un côté, « encaissé » de l'autre.
 */
export async function graphesTableauDeBord(
  p: Periode,
  perimetre: FiltrePerimetre,
  file: ContexteFile
): Promise<GraphesTableauDeBord> {
  const { debut, fin } = bornes(p);
  const dansLaPeriode = and(
    eq(sales.status, "completed"),
    eq(sales.isDeleted, false),
    gte(sales.saleDate, debut),
    lt(sales.saleDate, fin),
    ...conditionsDePerimetre(perimetre)
  );

  // La courbe compte les ventes du JOURNAL comme les autres : sans elles, une
  // journée encaissée hors ligne dessine un zéro, ce qui se lit comme un
  // effondrement et non comme un retard de synchronisation.
  const enFile = await ventesEnFile(perimetre, file);
  const lignesVentes = [
    ...(await db
      .select({
        total: sales.total,
        exchangeRate: sales.exchangeRate,
        date: sales.saleDate,
      })
      .from(sales)
      .where(dansLaPeriode)),
    ...enFile.ventes
      .filter(
        (v) =>
          v.status === "completed" && v.date && v.date >= debut && v.date < fin
      )
      .map((v) => ({
        // Déjà en principale, d'où le taux neutre : voir `duJournal` plus haut.
        total: v.totalPrincipal === null ? null : String(v.totalPrincipal),
        exchangeRate: "1",
        date: v.date,
      })),
  ];

  // Les seaux VIDES sont posés d'abord : une journée sans vente doit se voir
  // comme un zéro, pas disparaître de l'axe. Voir `features/tableau-de-bord/series`.
  const seaux = seauxDePeriode(p, debut, fin);
  const par = new Map(seaux.map((s) => [s.cle, 0]));
  let totalVendu = 0;
  for (const l of lignesVentes) {
    if (!l.date) continue;
    const cle = cleDeSeau(l.date, p);
    if (!par.has(cle)) continue;
    const v = enPrincipale(l);
    par.set(cle, (par.get(cle) as number) + v);
    totalVendu += v;
  }

  const lignesPaiements = await db
    .select({
      montant: payments.amount,
      remis: payments.tenderedAmount,
      devise: payments.currency,
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ `payments.amount` EST DÉJÀ DANS LA DEVISE DE LA VENTE.           │
      // │                                                                  │
      // │ Ce n'est PAS le billet reçu : celui-là est `tendered_amount`,    │
      // │ exprimé dans `payments.currency`. Le taux qui ramène un règlement │
      // │ en principale est donc celui de la VENTE, pas celui du règlement │
      // │ (qui, lui, convertit le billet vers la facture).                 │
      // └──────────────────────────────────────────────────────────────────┘
      tauxVente: sales.exchangeRate,
      nom: paymentMethods.name,
    })
    .from(payments)
    .innerJoin(sales, eq(sales.id, payments.saleId))
    .leftJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
    .where(and(dansLaPeriode, eq(payments.status, "completed")));

  // ┌──────────────────────────────────────────────────────────────────────────┐
  // │ LES RÈGLEMENTS DU JOURNAL EN SONT, SINON DEUX CARTES SE CONTREDISENT.   │
  // │                                                                          │
  // │ `payments` est une table TIRÉE : une vente encaissée hors ligne n'y a    │
  // │ aucune ligne. La courbe « facturé » comptait donc la vente et l'anneau   │
  // │ « encaissé » l'ignorait, sur le même écran, après le même geste. Le      │
  // │ marchand lisait deux chiffres pour une seule journée sans rien pour      │
  // │ trancher.                                                                │
  // │                                                                          │
  // │ Le nom du moyen se joint par son identifiant : le corps de l'opération   │
  // │ le nomme, comme le serializer l'attend, et le catalogue local en donne   │
  // │ le libellé.                                                              │
  // └──────────────────────────────────────────────────────────────────────────┘
  const nomsDesMoyens = new Map<string, string>();
  for (const m of await db
    .select({ id: paymentMethods.id, nom: paymentMethods.name })
    .from(paymentMethods)) {
    nomsDesMoyens.set(m.id, m.nom);
  }
  const ventesRetenues = new Set(
    enFile.ventes
      .filter((v) => v.status === "completed" && v.date && v.date >= debut && v.date < fin)
      .map((v) => v.id)
  );
  const reglementsEnFile = enFile.reglements
    .filter((r) => ventesRetenues.has(r.saleId))
    .map((r) => ({
      montant: null,
      remis: String(r.natif),
      devise: r.devise,
      tauxVente: null,
      nom: r.methodeId ? (nomsDesMoyens.get(r.methodeId) ?? null) : null,
      // Déjà ramené en principale par les DEUX taux figés de l'opération, celui
      // du règlement puis celui de la vente. Voir `en-file.ts`.
      principalDejaCalcule: r.principal,
    }));

  const parMoyen = new Map<string, TranchePaiement>();
  const parDevise = new Map<string, TrancheDevise>();
  let totalEncaisse = 0;
  for (const l of [
    ...lignesPaiements.map((l) => ({ ...l, principalDejaCalcule: null as number | null })),
    ...reglementsEnFile,
  ]) {
    const principal =
      l.principalDejaCalcule ??
      enPrincipale({ total: l.montant, exchangeRate: l.tauxVente });

    // « Non défini » est le libellé du serveur pour un règlement dont la
    // méthode a été supprimée. Le taire ferait manquer de l'argent à l'anneau.
    const nom = l.nom ?? "Non défini";
    const t = parMoyen.get(nom) ?? { nom, montant: 0, nombre: 0 };
    t.montant += principal;
    t.nombre += 1;
    parMoyen.set(nom, t);

    const code = deviseOuPrincipale(l.devise);
    const d = parDevise.get(code) ?? { code, natif: 0, principal: 0, nombre: 0 };
    // `tendered_amount` est nullable pour compatibilité : les anciennes lignes
    // mono-devise sont backfillées à `amount`, et le repli n'est juste que dans
    // ce cas précis, devise du règlement égale à celle de la vente.
    d.natif += nb(l.remis ?? l.montant);
    d.principal += principal;
    d.nombre += 1;
    parDevise.set(code, d);

    totalEncaisse += principal;
  }

  return {
    evolution: seaux.map((s) => ({
      label: s.label,
      valeur: par.get(s.cle) as number,
    })),
    devises: [...parDevise.values()]
      .filter((d) => d.code)
      .sort((a, b) => b.principal - a.principal),
    paiements: [...parMoyen.values()].sort((a, b) => b.montant - a.montant),
    totalEncaisse,
    totalVendu,
  };
}

export interface ProduitVendu {
  id: string;
  nom: string;
  sku: string;
  /** Quantité totale, en unité de détail. */
  quantite: number;
  /** « 3 casiers + 7 bouteilles », ou « 24 bouteilles » sans conditionnement. */
  rendu: string;
  /** Non nul : le rendu est ventilé, et le total brut mérite d'être rappelé. */
  facteur: number | null;
  /** Recette, EN DEVISE PRINCIPALE, au taux figé sur chaque vente. */
  revenus: number;
}

/**
 * Les produits les plus vendus de la période. Miroir de `_dashboard_top_product`.
 *
 * **Le partage gros/détail vient des CONTENANTS RÉELLEMENT FACTURÉS**, jamais
 * d'une division du total au facteur du jour : cinq casiers plus cent vingt
 * bouteilles ne se relisent pas « dix casiers », et le facteur d'un produit a
 * pu changer depuis la vente. C'est la règle posée dans tout le stock, et le
 * serveur l'applique ici de la même façon.
 */
export async function topProduits(
  p: Periode,
  perimetre: FiltrePerimetre,
  file: ContexteFile,
  limite = 10
): Promise<ProduitVendu[]> {
  const { debut, fin } = bornes(p);
  const uniteDetail = alias(units, "unite_detail");
  const uniteContenant = alias(units, "unite_contenant");

  const lignes = await db
    .select({
      produitId: products.id,
      nom: products.name,
      sku: products.sku,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      unite: uniteDetail.name,
      uniteContenant: uniteContenant.name,
      quantity: saleItems.quantity,
      packageQuantity: saleItems.packageQuantity,
      packagingFactor: saleItems.packagingFactor,
      total: saleItems.total,
      tauxVente: sales.exchangeRate,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .where(
      and(
        eq(sales.status, "completed"),
        eq(sales.isDeleted, false),
        gte(sales.saleDate, debut),
        lt(sales.saleDate, fin),
        ...conditionsDePerimetre(perimetre)
      )
    );

  // Le conditionnement est celui du PRODUIT (le nom du contenant vient du
  // catalogue) ; le facteur qui découpe, lui, est celui figé sur chaque LIGNE.
  const conditionnements = new Map<string, ReturnType<typeof getPackaging>>();
  const unites = new Map<string, string | null>();
  const brutes: LigneVendue[] = lignes.map((l) => {
    if (!conditionnements.has(l.produitId)) {
      unites.set(l.produitId, l.unite);
      conditionnements.set(
        l.produitId,
        getPackaging({
          selling_mode: l.sellingMode,
          units_per_package: l.unitsPerPackage,
          unit_name: l.unite,
          packaging_unit_name: l.uniteContenant,
        })
      );
    }
    return {
      produitId: l.produitId,
      nom: l.nom,
      sku: l.sku,
      quantite: nb(l.quantity),
      contenants: nb(l.packageQuantity),
      facteurLigne: l.packagingFactor ?? null,
      total: nb(l.total),
      tauxVente: nb(l.tauxVente),
    };
  });

  // ┌──────────────────────────────────────────────────────────────────────────┐
  // │ LES VENTES DU JOURNAL COMPTENT ICI AUSSI.                               │
  // │                                                                          │
  // │ `sale_items` est une table TIRÉE : après une journée hors ligne, la      │
  // │ section restait vide pendant que le chiffre d'affaires, lui, bougeait.   │
  // │ Un « aucun produit vendu » sous une recette non nulle se lit comme une   │
  // │ panne, pas comme un retard de synchronisation.                           │
  // │                                                                          │
  // │ Le nom et le conditionnement viennent du catalogue local ; le facteur    │
  // │ est celui d'aujourd'hui, et non celui figé sur la ligne, parce qu'une    │
  // │ vente en file n'a pas encore de ligne serveur. Voir `ventesEnFile`.      │
  // └──────────────────────────────────────────────────────────────────────────┘
  const enFile = await ventesEnFile(perimetre, file);
  const idsRetenus = new Set(
    enFile.ventes
      .filter(
        (v) => v.status === "completed" && v.date && v.date >= debut && v.date < fin
      )
      .map((v) => v.id)
  );
  const lignesEnFile = enFile.lignes.filter(
    (l) => idsRetenus.has(l.saleId) && l.produitId
  );

  if (lignesEnFile.length > 0) {
    const ids = [...new Set(lignesEnFile.map((l) => l.produitId as string))];
    const fiches = await db
      .select({
        id: products.id,
        nom: products.name,
        sku: products.sku,
        sellingMode: products.sellingMode,
        unitsPerPackage: products.unitsPerPackage,
        unite: uniteDetail.name,
        uniteContenant: uniteContenant.name,
      })
      .from(products)
      .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
      .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
      .where(inArray(products.id, ids));

    const parId = new Map(fiches.map((f) => [f.id, f]));
    for (const l of lignesEnFile) {
      const f = parId.get(l.produitId as string);
      if (!f) continue;
      if (!conditionnements.has(f.id)) {
        unites.set(f.id, f.unite);
        conditionnements.set(
          f.id,
          getPackaging({
            selling_mode: f.sellingMode,
            units_per_package: f.unitsPerPackage,
            unit_name: f.unite,
            packaging_unit_name: f.uniteContenant,
          })
        );
      }
      brutes.push({
        produitId: f.id,
        nom: f.nom,
        sku: f.sku,
        quantite: l.quantite,
        contenants: l.contenants,
        facteurLigne: conditionnements.get(f.id)?.factor ?? null,
        // Déjà en principale, d'où le taux neutre. `null` - ticket introuvable -
        // ne fabrique pas de recette : la quantité, elle, est certaine, elle
        // vient du corps de l'opération.
        total: l.revenuPrincipal ?? 0,
        tauxVente: 1,
      });
    }
  }

  return cumulerProduits(brutes)
    .slice(0, limite)
    .map((c) => {
      const cond = conditionnements.get(c.id) ?? null;
      return {
        id: c.id,
        nom: c.nom,
        sku: c.sku,
        quantite: c.quantite,
        rendu: libelleQuantite(cond, unites.get(c.id) ?? null, c),
        // Le facteur est rendu DÈS QU'IL EXISTE, que le partage vienne des
        // contenants facturés ou d'une division du total : c'est lui qui
        // autorise l'écran à rappeler « N au total » sous la lecture en
        // contenants, et c'est ce que le serveur met dans sa réponse.
        facteur: cond?.factor ?? null,
        revenus: c.revenus,
      };
    });
}

export interface ReleveInventaire {
  /** Produits au seuil de réassort ou en dessous. */
  stockBas: number;
  /** Valeur d'achat du stock, dans la devise de tenue des coûts. */
  valeurStock: number;
}

/**
 * Les deux relevés d'inventaire du web.
 *
 * **Les deux périmètres DIFFÈRENT, et c'est le serveur qui en décide ainsi** :
 * le comptage des stocks bas ne retient que les produits SUIVIS en inventaire,
 * la valorisation prend tout ce qui n'est pas supprimé. Les aligner « pour
 * faire propre » ferait diverger le terminal du back-office.
 *
 * La valorisation suit `Stock.unit_cost_expression()` : le coût moyen s'il est
 * renseigné, sinon le prix d'achat du catalogue. Cette règle avait trois
 * écritures côté serveur, et le même stock s'affichait à deux valeurs selon
 * l'écran ouvert ; il n'y en a plus qu'une, et c'est celle-ci que l'on suit.
 */
/**
 * ⚠ ENTREPÔT SEUL. Un stock est un ÉTAT, pas un acte : filtrer par utilisateur
 * n'a pas de sens et viderait une carte que le marchand lit ailleurs. L'écran
 * le DIT plutôt que d'afficher zéro.
 */
export async function releveInventaire(
  perimetre: FiltrePerimetre
): Promise<ReleveInventaire> {
  const lignes = await db
    .select({
      quantity: stocks.quantity,
      avgCost: stocks.avgCost,
      costPrice: products.costPrice,
      reorderPoint: products.reorderPoint,
      trackInventory: products.trackInventory,
    })
    .from(stocks)
    .innerJoin(products, eq(products.id, stocks.productId))
    .where(
      and(
        eq(products.isDeleted, false),
        // Entrepôt SEUL : un stock est un état, pas un acte. `perimetre.utilisateur`
        // est ignoré ici, et l'écran le DIT - vider une carte que le marchand
        // lit ailleurs est pire que de l'expliquer.
        perimetre.entrepot ? eq(stocks.warehouseId, perimetre.entrepot) : undefined
      )
    );

  let stockBas = 0;
  let valeurStock = 0;
  for (const l of lignes) {
    const quantite = nb(l.quantity);
    const moyen = nb(l.avgCost);
    valeurStock += quantite * (moyen > 0 ? moyen : nb(l.costPrice));
    if (l.trackInventory && quantite <= Number(l.reorderPoint ?? 0)) stockBas += 1;
  }
  return { stockBas, valeurStock };
}
