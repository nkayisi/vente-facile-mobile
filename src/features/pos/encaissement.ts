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
import { MONEY_EPS, type ModeReglement } from "@vente-facile/core/pos";

import type { ClientPos } from "./etat-panier";

/**
 * Ce que la feuille AFFICHE et PRÉREMPLIT dans la devise encaissée (montant
 * exigible, devise active, cagnotte, repère de taux) vit dans
 * `@vente-facile/core/pos`, que le comptoir du back-office lit aussi.
 */
export {
  cagnotteVersPrincipale,
  deviseNonActive,
  libelleDuTaux,
  manqueAffiche,
  montantApresBasculeDevise,
  montantExigible,
  recalerReglement,
  recapitulatifAffiche,
  versActive,
  versActiveSansDepasser,
  type AffichageEnDevise,
  type BasculeDeviseInput,
  type ExigibleInput,
  type ModeReglement,
  type RecalageInput,
  type RecapitulatifAffiche,
} from "@vente-facile/core/pos";

/**
 * Valeur du selecteur qui designe le credit.
 *
 * Le credit partage le selecteur des moyens de paiement, et ce n'est pas une
 * economie de place : c'est bien « comment le client regle », pas un reglage a
 * part. Le back-office emploie la meme sentinelle.
 */
export const OPTION_CREDIT = "__credit__";


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
  | "lignes-non-encaissables"
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
  /**
   * Les phrases du noyau qui ferment l'encaissement (stock, inventaire), une
   * par ligne en cause. Absent : rien ne ferme.
   */
  motifsLignes?: readonly string[];
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
  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LA FEUILLE GARDE LA PORTE ELLE-MÊME.                                 │
  // │                                                                      │
  // │ Le bouton du comptoir se fermait déjà, mais la feuille ouverte ne    │
  // │ regardait plus les lignes : un inventaire démarré pendant qu'elle    │
  // │ était ouverte (le verrou se relit de la base) laissait imprimer un   │
  // │ ticket que le serveur refusera. Aucun ticket ne sort pour une vente  │
  // │ qu'il refusera : c'est l'invariant, il se tient ici aussi.           │
  // └──────────────────────────────────────────────────────────────────────┘
  if (e.motifsLignes && e.motifsLignes.length > 0) return "lignes-non-encaissables";
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
    case "lignes-non-encaissables":
      return "Une ligne du panier ne s'encaisse pas en l'état : voyez le panier. La proforma reste possible.";
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
