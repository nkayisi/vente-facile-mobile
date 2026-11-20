/**
 * Ce qu'un membre peut faire d'une dépense, selon son statut et qui l'a saisie.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SERVEUR TRANCHE, L'ÉCRAN NE PROPOSE QUE CE QU'IL ACCEPTERA.           │
 * │                                                                          │
 * │ Les règles vivent dans `cashbook/services.py`. Un bouton proposé puis    │
 * │ refusé ne se voit pas ici : il part au journal et revient en             │
 * │ quarantaine, des heures plus tard, sur un autre écran. Copie tenue à la  │
 * │ main de `frontend/lib/cashbook/gestes-depense.ts`, éprouvée sur les      │
 * │ MÊMES cas.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * - **approuver / rejeter** : propriétaire ou gérant, JAMAIS sur sa propre
 *   dépense (sauf le propriétaire, qui n'a personne au-dessus de lui) ;
 * - **payer** une dépense approuvée : son auteur, ou qui peut approuver.
 *   C'est au paiement que l'argent sort du tiroir ;
 * - **payer directement** un brouillon ou une dépense en attente : vaut une
 *   approbation, donc mêmes règles qu'approuver ;
 * - une dépense **rejetée** ne se paie jamais.
 *
 * Module PUR : `features/caisse/actes.ts` tire `@/sync`, qui ouvre la base au
 * chargement, et une règle écrite là-bas ne serait pas éprouvable.
 */

export type GesteDepense = "submit" | "approve" | "reject" | "pay" | "pay_direct" | "cancel";

export interface DroitsDepense {
  /** `cashbook.create_expense` */
  peutCreer: boolean;
  /** `cashbook.approve_expense` */
  peutApprouver: boolean;
  /** `cashbook.pay_expense` */
  peutPayer: boolean;
  /** Le propriétaire approuve aussi ses propres dépenses. */
  proprietaire: boolean;
  /** L'identifiant de celui qui regarde, `null` s'il n'est pas connu. */
  moi: string | null;
}

export function gestesPossibles(
  depense: { status: string; created_by: string | null },
  droits: DroitsDepense
): GesteDepense[] {
  const aMoi = droits.moi != null && depense.created_by === droits.moi;
  const peutTrancher = droits.peutApprouver && (droits.proprietaire || !aMoi);
  const gestes: GesteDepense[] = [];

  if (depense.status === "draft" && droits.peutCreer) gestes.push("submit");
  if (depense.status === "pending" && peutTrancher) gestes.push("approve", "reject");
  if (depense.status === "approved" && droits.peutPayer && (aMoi || droits.peutApprouver)) {
    gestes.push("pay");
  }
  if ((depense.status === "draft" || depense.status === "pending") && peutTrancher) {
    gestes.push("pay_direct");
  }
  if (depense.status !== "cancelled" && depense.status !== "rejected" && droits.peutApprouver) {
    gestes.push("cancel");
  }
  return gestes;
}

/**
 * L'acte du journal qu'un geste met en file.
 *
 * « Payer directement » n'est pas un acte à part : c'est `expense.pay` sur une
 * dépense pas encore approuvée, et le serveur l'approuve du même geste.
 */
export function acteDuGeste(
  geste: GesteDepense
): "expense.submit" | "expense.approve" | "expense.reject" | "expense.pay" | "expense.cancel" {
  return geste === "pay_direct" ? "expense.pay" : `expense.${geste}`;
}

/**
 * Pourquoi un paiement ne peut pas partir, ou `null`.
 *
 * EN ESPÈCES, les billets sortent de la caisse de celui qui paie : le serveur
 * refuse un paiement en espèces sans caisse ouverte, et le terminal le dit
 * AVANT de mettre l'acte en file plutôt que de fabriquer une quarantaine.
 */
export function motifPaiementImpossible(
  moyen: { methodType: string } | null,
  caisseOuverte: boolean
): string | null {
  const enEspeces = moyen == null || moyen.methodType === "cash";
  if (enEspeces && !caisseOuverte) {
    return "Ouvrez votre caisse pour payer en espèces, ou choisissez un autre moyen de paiement.";
  }
  return null;
}

/**
 * Les décisions réellement ouvertes, une fois l'état d'envoi pris en compte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE DÉPENSE QUE LE SERVEUR IGNORE N'ACCEPTE AUCUNE DÉCISION.            │
 * │                                                                          │
 * │ Sur un identifiant qu'il n'a pas encore vu, le serveur refuse : verdict  │
 * │ `rejected`, donc quarantaine. Offrir « Approuver » sur une dépense en    │
 * │ file, c'est offrir un bouton qui fabrique un refus que le marchand n'a   │
 * │ pas provoqué. L'impression, elle, reste ouverte.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function decisionsPossibles(
  depense: { status: string; created_by: string | null },
  droits: DroitsDepense,
  enFile: boolean
): GesteDepense[] {
  return enFile ? [] : gestesPossibles(depense, droits);
}
