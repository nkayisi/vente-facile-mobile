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
