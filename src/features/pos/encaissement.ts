/**
 * Ce qui DECIDE a l'encaissement : le mode, ce qui ferme un bouton, et pourquoi.
 *
 * Miroir des trois endroits ou le back-office tranche la meme chose - le
 * `disabled` du bouton Confirmer, le grisage de l'option « Credit » du
 * selecteur, et `syncTenderToTotal`. Les recopier dans l'ecran mobile les
 * ferait deriver en silence : un bouton ferme sans motif se lit comme une
 * panne, et un montant qui ne se recale pas fait annoncer une monnaie fausse.
 *
 * ⚠ CE MODULE N'IMPORTE NI `@/db`, NI `@/ui`, NI `@/sync`. `@/ui` tire le
 * theme, qui tire les reglages, qui OUVRE SQLite au chargement : une regle
 * ecrite la-bas ne serait pas eprouvable sans appareil. C'est le deplacement
 * deja fait pour `data/etats-stock` et `features/stock/reception`.
 *
 * Aucun montant n'est calcule ici : les totaux viennent du panier, donc de
 * `@vente-facile/core/pos`.
 */
import { MONEY_EPS } from "@vente-facile/core/pos";

import { lireNombre } from "@/data/nombres";
import { convertirSaisie } from "@/features/caisse/montant-devise";

import type { ClientPos } from "./etat-panier";

/**
 * Valeur du selecteur qui designe le credit.
 *
 * Le credit partage le selecteur des moyens de paiement, et ce n'est pas une
 * economie de place : c'est bien « comment le client regle », pas un reglage a
 * part. Le back-office emploie la meme sentinelle.
 */
export const OPTION_CREDIT = "__credit__";

export type ModeReglement = "comptant" | "credit";

/** Libelle du champ montant. En credit, ce n'est plus un du mais un acompte. */
export function libelleMontant(mode: ModeReglement): string {
  // « Acompte facultatif » et non « Acompte (optionnel) » : `ChampMontant`
  // accole DEJA la devise entre parentheses, et « Acompte (optionnel) (USD) »
  // sortait a deux parentheses. Releve a l'ecran.
  return mode === "credit" ? "Acompte facultatif" : "Montant reçu";
}

// --- L'option « Credit » du selecteur -------------------------------------

export type MotifCreditFerme = "sans-client" | "non-autorise";

/**
 * Pourquoi le credit est ferme, ou `null` s'il est ouvert.
 *
 * ⚠ `allow_credit` et `credit_limit` sont DEUX REGLES DISTINCTES : une limite
 * a zero signifie « sans plafond », jamais « credit refuse ». Le plafond, lui,
 * ne ferme pas l'option - il se constate sur le montant de CETTE vente, et
 * c'est `evaluateCredit` du noyau qui le tranche.
 */
export function motifCreditFerme(
  client: ClientPos | null,
): MotifCreditFerme | null {
  if (!client) return "sans-client";
  if (client.allow_credit === false) return "non-autorise";
  return null;
}

/**
 * Le suffixe accole a l'option grisee.
 *
 * Le back-office le pose pour que le caissier lise LEQUEL des deux motifs
 * s'applique : une option grisee sans raison enseigne que la fonction n'existe
 * pas, et personne ne cherche un bug la ou il n'y a pas d'erreur.
 */
export function suffixeOptionCredit(motif: MotifCreditFerme | null): string {
  if (motif === "sans-client") return " (client requis)";
  if (motif === "non-autorise") return " (non autorisé)";
  return "";
}

/** La phrase opposee quand on tente quand meme de choisir le credit. */
export function phraseCreditFerme(
  motif: MotifCreditFerme,
  nomClient: string | null,
): string {
  return motif === "sans-client"
    ? "Sélectionnez un client avant de passer en vente à crédit."
    : `${nomClient || "Ce client"} n'est pas autorisé à acheter à crédit.`;
}

// --- Ce qui ferme le bouton de confirmation -------------------------------

export type BlocageEncaissement =
  | "panier-vide"
  | "sans-session"
  | "sans-moyen"
  | "montant-illisible"
  | "reference-manquante"
  | "total-negatif"
  | "sous-paye"
  | "credit-sans-client"
  | "credit-refuse";

export interface EntreeEncaissement {
  mode: ModeReglement;
  nbLignes: number;
  /** Une session de caisse est ouverte (tiree, en file ou bloquee). */
  sessionOuverte: boolean;
  moyenChoisi: boolean;
  /** Le moyen retenu exige une reference de transaction. */
  referenceExigee: boolean;
  reference: string;
  /** La saisie du montant est lisible (voir `lireNombre`). */
  montantLisible: boolean;
  /** Total de la facture, dans sa devise. Points deja deduits. */
  totalFacture: number;
  /** Somme remise, convertie en devise de facture. */
  payeFacture: number;
  client: ClientPos | null;
  /** Verdict de `evaluateCredit` du noyau. */
  creditBloque: boolean;
}

/**
 * Ce qui ferme le bouton, ou `null` s'il est ouvert.
 *
 * L'ORDRE COMPTE : on nomme d'abord ce qui empeche toute vente, ensuite ce qui
 * tient au reglage. Un caissier sans session ouverte doit lire « ouvrez une
 * caisse », pas « il manque 12 $ ».
 */
export function blocageEncaissement(
  e: EntreeEncaissement,
): BlocageEncaissement | null {
  if (e.nbLignes === 0) return "panier-vide";
  if (!e.sessionOuverte) return "sans-session";
  if (e.totalFacture < 0) return "total-negatif";
  if (!e.moyenChoisi) return "sans-moyen";
  if (!e.montantLisible) return "montant-illisible";
  if (e.referenceExigee && e.mode === "comptant" && !e.reference.trim()) {
    return "reference-manquante";
  }

  if (e.mode === "credit") {
    // Le client est oppose AVANT le plafond : sans lui, il n'y a pas de compte
    // ou porter la dette, et le verdict de credit n'existe meme pas.
    if (!e.client) return "credit-sans-client";
    if (e.creditBloque) return "credit-refuse";
    return null;
  }

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ UN COMPTANT SOUS-PAYE EST UN REFUS, PAS UNE BASCULE EN CREDIT.       │
  // │                                                                      │
  // │ Le terminal DEDUISAIT le credit du sous-paiement : un caissier qui   │
  // │ se trompait d'un chiffre portait la difference au compte d'un        │
  // │ client, et s'il n'y en avait pas le bouton se fermait sans un mot.   │
  // │ Le credit est desormais un CHOIX du selecteur, comme au back-office. │
  // └──────────────────────────────────────────────────────────────────────┘
  // La meme tolerance que l'affichage, sinon le bouton reste ferme alors que
  // l'ecran annonce « paye en totalite ».
  if (e.payeFacture + MONEY_EPS < e.totalFacture) return "sous-paye";
  return null;
}

/**
 * La phrase a ecrire SOUS le bouton, ou `null` quand l'ecran la dit deja.
 *
 * Un bouton ferme sans motif est un cul-de-sac. Mais repeter sous le bouton ce
 * qu'un bandeau annonce trois lignes plus haut fait douter qu'il s'agisse du
 * meme empechement : les cas deja expliques rendent `null`.
 */
export function phraseBlocage(
  blocage: BlocageEncaissement | null,
): string | null {
  switch (blocage) {
    case "sans-moyen":
      return "Choisissez un moyen de paiement.";
    case "montant-illisible":
      return "Le montant reçu n'est pas lisible.";
    case "reference-manquante":
      return "La référence de la transaction est obligatoire.";
    case "total-negatif":
      return "Le total ne peut pas être négatif. Réduisez les remises.";
    // Le sous-paiement est deja chiffre par « Il manque X », la session par son
    // bandeau, le credit par le sien, et un panier vide n'atteint pas l'ecran.
    default:
      return null;
  }
}

/** Le libelle du bouton. En comptant il porte le MONTANT : c'est ce qu'on annonce. */
export function libelleConfirmation(
  mode: ModeReglement,
  montantFormate: string,
): string {
  return mode === "credit"
    ? "Confirmer la vente à crédit"
    : `Encaisser ${montantFormate}`;
}

// --- Recalage du montant recu ---------------------------------------------

export interface RecalageInput {
  mode: ModeReglement;
  /** Total de la facture dans SA devise, points deja deduits. */
  totalFacture: number;
  deviseFacture: string;
  /** Devise dans laquelle le caissier encaisse. */
  deviseReglement: string;
  /**
   * Conversion PURE, SANS arrondi.
   *
   * ⚠ **Le nom porte le contrat, et ce n'est pas du zele.** `convertMoney` a la
   * MEME signature : la cabler ici compilerait sans un mot, et detruirait
   * l'information dont le plafond a besoin - 26 681 FC / 2300 vaut 11,60043...,
   * et `convertMoney` rend deja 11,60. Plafonner 11,60 rend 11,60, et le
   * sous-paiement revient. C'est `devises.convert` qu'il faut, la seule qui ne
   * perde rien, et l'appelant le lit dans le nom du champ.
   */
  convertirBrut: (montant: number, de: string, vers: string) => number;
  /** Nombre de decimales de la devise : 2 pour le dollar, 0 pour le franc. */
  decimalesDe: (code: string) => number;
}

/** Ce qu'il faut a `montantExigible`, sans le mode ni le reste du recalage. */
export type ExigibleInput = Omit<RecalageInput, "mode">;

/**
 * Le plus petit montant, dans la devise encaissee, qui SOLDE reellement la
 * facture.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON ARRONDIT VERS LE HAUT, ET C'EST UN CUL-DE-SAC QU'ON REFERME.         │
 * │                                                                          │
 * │ Le prereemplissage convertissait F -> R et arrondissait AU PLUS PROCHE ; │
 * │ puis `tendersIn` reconvertit R -> F et arrondit dans F. Quand l'unite    │
 * │ mineure de la devise ENCAISSEE vaut plus cher que celle de la devise de  │
 * │ FACTURE, l'aller-retour perd de l'argent :                               │
 * │                                                                          │
 * │   facture 26 681 FC, encaissement en USD, 1 USD = 2300 FC                │
 * │     26 681 / 2300 = 11,60043...  -> arrondi USD -> 11,60                 │
 * │     11,60 x 2300  = 26 680       -> arrondi CDF -> 26 680                │
 * │     26 680 < 26 681  =>  « sous-paye », bouton FERME                     │
 * │                                                                          │
 * │ Et le caissier n'a AUCUN moyen d'y repondre : aucun montant en dollars   │
 * │ ne vaut 26 681 FC. Mesure : 19 132 cas sur 40 000 a ce taux, avec un     │
 * │ manque jusqu'a ceil(taux/100) - 1 FC. C'est la configuration ORDINAIRE   │
 * │ en RDC - on facture en francs, le client paie en dollars.                │
 * │                                                                          │
 * │ Un vrai comptoir encaisse 11,61 $ et rend 22 FC de monnaie. Tolerer le   │
 * │ manque a la place ferait entrer une dette d'une unite mineure sur une    │
 * │ vente que le marchand croit soldee, et le solde du client deriverait     │
 * │ vente apres vente sans que rien ne le dise.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA TOLERANCE EST RELATIVE A L'UNITE MINEURE, JAMAIS A `Number.EPSILON`. │
 * │                                                                          │
 * │ La premiere ecriture retranchait `Number.EPSILON * facteur`, soit une    │
 * │ garde ABSOLUE de 2,22e-14 pour deux decimales - alors que l'erreur       │
 * │ flottante CROIT avec la magnitude. Des que `converti * facteur` tombe un │
 * │ ulp au-dessus de l'entier, `Math.ceil` ajoutait une unite mineure qui    │
 * │ n'avait rien a faire la. Mesure sur 200 000 montants a deux decimales :  │
 * │                                                                          │
 * │   USD -> USD   9 160 sur-arrondis  = 4,58 %   (4,11 sortait a 4,12)      │
 * │   USD -> CDF   6 397 sur-arrondis                                        │
 * │   CDF -> USD     125 sur-arrondis                                        │
 * │                                                                          │
 * │ Et `convert` du noyau rend le montant TEL QUEL quand les deux devises    │
 * │ coincident : le defaut frappait donc le cas MONO-DEVISE, qui est le cas  │
 * │ ordinaire. Sur une vente de 4,11 $, le champ portait 4,11 et le bouton   │
 * │ annoncait « Encaisser 4,12 $ » - deux nombres pour un seul encaissement, │
 * │ et choisir un moyen de paiement suffisait a recaler le champ sur 4,12.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `MONEY_EPS` est la tolerance deja employee par le projet, et par
 * `blocageEncaissement` sur le MEME couple de montants. Elle est sure dans les
 * deux sens : des milliers de fois au-dessus du bruit flottant, et tres en
 * dessous de ce que `tendersIn` - qui arrondit dans la devise de FACTURE -
 * peut voir. Mesure : zero sous-paiement introduit, dans les quatre
 * combinaisons de devises.
 *
 * ⚠ A devises EGALES, l'operation est neutre : `totalFacture` est deja arrondi
 * dans sa propre devise, donc le plafond ne deplace rien.
 */
export function montantExigible(e: ExigibleInput): number {
  const converti = e.convertirBrut(
    e.totalFacture,
    e.deviseFacture,
    e.deviseReglement,
  );
  const facteur = Math.pow(10, e.decimalesDe(e.deviseReglement));
  const produit = converti * facteur;
  const entier = Math.round(produit);
  // Un ecart de moins d'un millionieme d'unite mineure ne peut pas venir de la
  // CONVERSION : c'est la virgule flottante, et l'entier est ce qu'on veut.
  // Au-dela, le plafond est reel et il faut monter d'une unite.
  return (
    (Math.abs(produit - entier) < MONEY_EPS ? entier : Math.ceil(produit)) /
    facteur
  );
}

/**
 * Le montant a REPOSER dans le champ, ou `null` s'il ne faut pas y toucher.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SANS CE RECALAGE, APPLIQUER DES POINTS ANNONCE UNE MONNAIE FAUSSE.       │
 * │                                                                          │
 * │ Le champ garde le total BRUT ; le caissier lit alors une « monnaie a     │
 * │ rendre » egale a la valeur des points au lieu du reste du, et il la rend  │
 * │ - le tiroir manque le soir de ce qu'il vient d'offrir deux fois. Le      │
 * │ back-office ferme ce defaut par `syncTenderToTotal` ; c'en est le        │
 * │ miroir.                                                                  │
 * │                                                                          │
 * │ ⚠ EN CREDIT ON NE TOUCHE A RIEN : le champ y est un acompte FACULTATIF,  │
 * │ et le remplir ferait d'une vente a credit une vente soldee, qui          │
 * │ n'inscrirait aucune dette. Le back-office a paye ce defaut.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function recalerReglement(e: RecalageInput): string | null {
  if (e.mode === "credit") return null;
  return String(montantExigible(e));
}

// --- Bascule de la devise d'encaissement ----------------------------------

export interface BasculeDeviseInput extends ExigibleInput {
  mode: ModeReglement;
  /** Ce que le champ porte AVANT la bascule. */
  saisie: string;
  /** Devise du champ AVANT la bascule. */
  deviseAvant: string;
  /**
   * Conversion PUIS arrondi (`convertMoney`) : celle qui preserve la valeur
   * tapee, et celle que `tendersIn` refait en sens inverse pour juger le
   * paiement. C'est donc elle, et pas `convert`, qui dit si un reglement solde.
   */
  convertirArrondi: (montant: number, de: string, vers: string) => number;
}

/**
 * Le montant a reposer dans le champ apres un changement de devise.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE BASCULE DE DEVISE NE REND JAMAIS INSUFFISANT UN REGLEMENT QUI        │
 * │ SOLDAIT.                                                                 │
 * │                                                                          │
 * │ L'ecran convertissait la saisie AU PLUS PROCHE pendant que la validation │
 * │ et le bouton employaient le PLAFOND :                                    │
 * │                                                                          │
 * │   facture 26 681 FC, 1 USD = 2300 FC                                     │
 * │     champ prerempli  : 26 681 CDF                                        │
 * │     bascule en USD   : 26 681 / 2300 arrondi au plus proche -> 11,60     │
 * │     tendersIn(11,60) : 11,60 x 2300 = 26 680  <  26 681                  │
 * │     => « sous-paye », bouton FERME... qui annonce « Encaisser 11,61 $ »  │
 * │                                                                          │
 * │ Le champ portait 11,60, le bouton disait 11,61, et AUCUN montant en      │
 * │ dollars ne soldait la facture. C'est le cul-de-sac que `montantExigible` │
 * │ a ete ecrit pour refermer, rouvert par une seconde porte - et l'ecran se │
 * │ contredisait lui-meme sur le meme rendu.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ **Un montant PARTIEL reste converti, et c'est la moitie de la regle.** La
 * doctrine de `convertirSaisie` ne bouge pas - « on convertit, on n'efface
 * jamais » - et relever un acompte que le caissier a voulu partiel serait lui
 * reprendre sa saisie. On ne repose le plafond que lorsque la bascule vient de
 * faire PERDRE une suffisance qui etait la.
 */
export function montantApresBasculeDevise(e: BasculeDeviseInput): string {
  const converti = convertirSaisie(e.saisie, e.deviseAvant, e.deviseReglement, {
    convertir: e.convertirArrondi,
    decimales: e.decimalesDe,
  });

  // En credit le champ est un ACOMPTE facultatif : il ne solde rien, donc il
  // n'y a aucun plancher a tenir. Lui en imposer un ferait d'une vente a
  // credit une vente soldee, qui n'inscrirait aucune dette.
  if (e.mode === "credit") return converti;

  // « Solder » se lit exactement comme `tendersIn` le calcule sur un reglement
  // unique : conversion PUIS arrondi dans la devise de facture, avec la meme
  // tolerance que le bouton. Une seconde formule ici, et les deux divergeraient.
  const solde = (montant: string, devise: string): boolean => {
    const lu = lireNombre(montant);
    if (!lu.ok || lu.valeur == null) return false;
    return (
      e.convertirArrondi(lu.valeur, devise, e.deviseFacture) + MONEY_EPS >=
      e.totalFacture
    );
  };

  if (!solde(e.saisie, e.deviseAvant)) return converti;
  if (solde(converti, e.deviseReglement)) return converti;
  return String(montantExigible(e));
}
