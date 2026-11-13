/**
 * L'imputation d'un règlement, ANNONCÉE avant d'être faite.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CECI EST UN APERÇU, PAS UNE DÉCISION. Le serveur seul impute et écrit.   │
 * │ Ce module dit au caissier ce qui VA se passer, pour qu'il ne le découvre │
 * │ pas sur le reçu du client.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La règle est celle de `contacts.services._settle_open_invoices`, et elle
 * tient en une phrase : **on solde les factures les plus anciennes d'abord, et
 * seul le reliquat devient une avance.** L'ordre n'est pas un détail
 * d'affichage : c'est celui dans lequel le serveur imputera, et présenter les
 * factures autrement ferait attendre au caissier une imputation différente de
 * celle qui aura lieu.
 *
 * Le montant raisonne dans la devise des FACTURES, pas dans celle des billets.
 * C'est la seule comparaison valide : un `amount_due` est libellé dans la
 * devise de sa facture. Le back-office s'est fait prendre en convertissant vers
 * la devise principale, et refusait alors un règlement de 50 USD sur une
 * facture de 50 USD, comparé à 140 000.
 */

export interface FactureAImputer {
  reference: string;
  resteAPayer: number;
}

export interface Imputation {
  /** Factures entièrement soldées, dans l'ordre d'imputation. */
  soldees: string[];
  /** Facture partiellement soldée par le reliquat, s'il y en a une. */
  partielle: string | null;
  /** Ce qui reste après les factures, et qui deviendra une avance. */
  avance: number;
}

/**
 * @param montant  Montant du règlement, DANS LA DEVISE DES FACTURES.
 * @param factures Factures ouvertes, de la plus ancienne à la plus récente.
 */
export function imputer(montant: number, factures: FactureAImputer[]): Imputation {
  const soldees: string[] = [];
  let partielle: string | null = null;
  let reste = montant;

  for (const f of factures) {
    // Une facture dont le reste est nul ou négatif n'absorbe rien : le serveur
    // la saute aussi (`if locked.amount_due <= 0: continue`). Sans ce test,
    // elle serait comptée comme « entièrement soldée » et le caissier lirait
    // une facture réglée qui ne l'a pas été.
    if (f.resteAPayer <= 0) continue;
    // La comparaison est à un centième près : un reste de 0,004 dû à une
    // conversion ferait sinon apparaître une facture « partiellement soldée »
    // pour un montant que personne ne peut remettre.
    if (reste <= 0.005) break;

    if (reste + 0.005 >= f.resteAPayer) {
      soldees.push(f.reference);
      reste -= f.resteAPayer;
    } else {
      partielle = f.reference;
      reste = 0;
      break;
    }
  }

  return { soldees, partielle, avance: reste > 0.005 ? reste : 0 };
}

/**
 * Le SIGNE d'un ajustement vient du sens choisi, jamais de la saisie.
 *
 * Un caissier qui taperait « -500 » dans « augmenter la dette » inverserait
 * l'opération sans qu'aucun écran ne le dise, et le reçu sortirait juste : la
 * valeur absolue est donc prise à la source.
 */
export function montantAjustement(sens: "augmenter" | "reduire", saisi: number): number {
  return (sens === "augmenter" ? 1 : -1) * Math.abs(saisi);
}

/**
 * La part de la dette, dans une devise, que les factures VISIBLES n'expliquent pas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CAISSIER NE VOIT QUE SES PROPRES VENTES, ET LA DETTE EST CELLE DE     │
 * │ TOUT L'ÉTABLISSEMENT.                                                    │
 * │                                                                          │
 * │ Depuis le lot L9, le tirage borne les ventes d'un caissier sans          │
 * │ `sales.view_all` à celles qu'il a faites, comme le back-office. Le solde │
 * │ du client (`customer_balances`), lui, reste entier. La différence, ce    │
 * │ sont les factures d'un collègue - et le SERVEUR les impute aussi, les    │
 * │ plus anciennes d'abord : l'imputation annoncée ne porte alors que sur    │
 * │ les factures du caissier, et il faut le dire.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Zéro quand tout s'explique. Même tolérance d'un demi-centième que `imputer`.
 */
export function detteNonVisible(dette: number, factures: FactureAImputer[]): number {
  const visible = factures.reduce((s, f) => s + Math.max(0, f.resteAPayer), 0);
  const reste = dette - visible;
  return reste > 0.005 ? reste : 0;
}

/** Ce que la part de dette inexpliquée EST, selon ce que ce compte voit. */
export type NatureNonVisible = "aucune" | "factures_d_un_collegue" | "hors_facture";

export interface LectureDuReliquat {
  nature: NatureNonVisible;
  /** Dette hors facture (ajustement, reliquat ancien) que le versement réduit d'abord. */
  horsFacture: number;
  /** Ce qui deviendra une avance - ou PEUT le devenir, quand on ne voit pas tout. */
  avance: number;
  /**
   * Le reçu porte-t-il sur des factures (`RGL`) ou est-ce une avance (`AVC`) ?
   * Le numéro est fabriqué ICI et le serveur le reprend tel quel : il doit
   * décider comme le serveur, qui ne regarde que les factures OUVERTES.
   */
  surFactures: boolean;
}

/**
 * Ce que devient le reliquat d'un versement, une fois les factures visibles soldées.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PART INEXPLIQUÉE N'EST PAS LA MÊME CHOSE POUR TOUT LE MONDE.          │
 * │                                                                          │
 * │ Le PROPRIÉTAIRE tire toutes les ventes, de tous les dépôts : si la dette │
 * │ dépasse ses factures ouvertes, l'écart ne peut venir que d'une dette     │
 * │ HORS FACTURE - un ajustement, un reliquat ancien. Le serveur la réduit   │
 * │ d'abord (`settle_debt`) avant de rendre le solde créditeur : annoncer le │
 * │ reliquat entier comme une avance promettrait au client un crédit qu'il   │
 * │ n'aura pas. Et le serveur ne voit alors AUCUNE facture ouverte : il      │
 * │ numéroterait le reçu `AVC`, donc le terminal aussi.                      │
 * │                                                                          │
 * │ Tous les autres ont un tirage BORNÉ (par dépôt, et par auteur pour un    │
 * │ caissier) : l'écart peut être les factures d'un collègue ou d'un autre   │
 * │ dépôt, que le serveur impute quand même. On ne peut pas le savoir, on le │
 * │ dit, et le reçu reste un règlement de factures.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Le critère est « voit TOUTES les ventes », c'est-à-dire le propriétaire,
 *   pas `sales.view_all` : un gérant qui l'a ne voit que les ventes de SES
 *   dépôts, et prendrait les factures d'une autre boutique pour une dette hors
 *   facture.
 */
export function lireReliquat(e: {
  reliquat: number;
  nonVisible: number;
  nbFacturesOuvertes: number;
  voitToutesLesVentes: boolean;
}): LectureDuReliquat {
  const reliquat = Math.max(0, e.reliquat);
  if (e.nonVisible <= 0) {
    return {
      nature: "aucune",
      horsFacture: 0,
      avance: reliquat,
      surFactures: e.nbFacturesOuvertes > 0,
    };
  }
  if (e.voitToutesLesVentes) {
    const horsFacture = Math.min(reliquat, e.nonVisible);
    const avance = reliquat - horsFacture;
    return {
      nature: "hors_facture",
      horsFacture,
      avance: avance > 0.005 ? avance : 0,
      surFactures: e.nbFacturesOuvertes > 0,
    };
  }
  return {
    nature: "factures_d_un_collegue",
    horsFacture: 0,
    avance: reliquat,
    surFactures: true,
  };
}
