/**
 * Les deux papiers d'une dépense : la DEMANDE à la création, le REÇU au
 * paiement. Miroir de `frontend/lib/cashbook/documents-depense.ts`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE REÇU NE SORT QU'UNE FOIS L'ARGENT SORTI.                              │
 * │                                                                          │
 * │ Il s'imprimait à la création, alors que la dépense naît en brouillon et  │
 * │ que l'argent ne quitte le tiroir qu'au paiement : le bénéficiaire        │
 * │ repartait avec la pièce d'une sortie qui n'avait pas eu lieu, et qui     │
 * │ pouvait ne jamais avoir lieu. Ce qui sort à la création est une demande, │
 * │ et le papier le dit.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : l'écran l'appelle, le test aussi. Les deux portent le même
 * numéro, celui de la dépense, définitif dès la saisie.
 */
import { formatDateFr, formatDateTimeFr } from "@vente-facile/core";
import type { ExpenseReceiptData, ExpenseRequestData, ReceiptChrome } from "@vente-facile/core/receipt";

import type { DetailDepense } from "@/data/caisse";
import type { RecuDeDepensePayee } from "@/printing/jobs";

export type PapierDeDepense = "demande" | "recu";

/**
 * Le papier qu'une fiche propose de (ré)imprimer. Le reçu une fois payée, ou
 * dès qu'un reçu a été rangé au paiement (le paiement attend peut-être encore
 * son envoi) ; la demande tant qu'elle peut l'être ; rien pour une dépense
 * rejetée ou annulée, qui n'a ni sortie à justifier ni paiement à venir.
 */
export function papierDeLaFiche(statut: string, recuRange: boolean): PapierDeDepense | null {
  if (statut === "paid" || recuRange) return "recu";
  if (statut === "draft" || statut === "pending" || statut === "approved") return "demande";
  return null;
}

/** La demande, telle qu'elle sort à la saisie : l'instant de la demande, son auteur. */
export function demandeDeDepense(p: {
  reference: string;
  chrome: ReceiptChrome;
  demandeur?: string | null;
  categorie?: string | null;
  beneficiaire?: string | null;
  montant: number;
  devise: string;
  description?: string | null;
  le: Date;
  /**
   * `le` est un JOUR, pas un instant : la réimpression n'a que la date de la
   * dépense, et l'écrire avec une heure (minuit) affirmerait une heure inventée.
   * Le back-office imprime le jour seul, pour la même raison.
   */
  jour?: boolean;
  duplicata?: boolean;
}): ExpenseRequestData {
  return {
    kind: "expense_request",
    chrome: p.chrome,
    number: p.reference,
    date: p.jour ? formatDateFr(p.le) : formatDateTimeFr(p.le),
    cashierName: p.demandeur || undefined,
    category: p.categorie || undefined,
    payee: p.beneficiaire || undefined,
    amount: p.montant,
    currency: p.devise,
    description: p.description || undefined,
    isDuplicate: p.duplicata ?? false,
  };
}

/**
 * Le reçu, tel qu'il sort AU GESTE de paiement : le payeur est l'utilisateur
 * du terminal, l'heure celle de l'appui. Il se range marqué `auPaiement`.
 */
export function recuAuPaiement(p: {
  depense: DetailDepense;
  chrome: ReceiptChrome;
  payeur?: string | null;
  caisse?: string | null;
  moyen?: string | null;
  referencePaiement?: string | null;
  approbateur?: string | null;
  le: Date;
}): RecuDeDepensePayee {
  const d = p.depense;
  return {
    kind: "expense",
    auPaiement: true,
    chrome: p.chrome,
    number: d.reference,
    date: formatDateTimeFr(p.le),
    cashierName: p.payeur || undefined,
    registerName: p.caisse || undefined,
    category: d.categorie || undefined,
    payee: d.beneficiaire || undefined,
    paymentMethod: p.moyen || undefined,
    paymentReference: p.referencePaiement || undefined,
    approvedBy: p.approbateur || undefined,
    amount: d.montant,
    currency: d.devise,
    description: d.description || undefined,
  };
}

/**
 * Le reçu d'une dépense payée AILLEURS (back-office, autre terminal), refait
 * depuis ce que le tirage a descendu : la sortie d'argent nomme le payeur,
 * l'instant et la caisse.
 */
export function recuDepuisLaFiche(d: DetailDepense, chrome: ReceiptChrome): ExpenseReceiptData {
  return {
    kind: "expense",
    chrome,
    number: d.reference,
    // L'instant de la sortie d'argent quand on l'a ; sinon le JOUR seul, que
    // `paid_date` et `expense_date` désignent : une heure y serait inventée.
    date: d.paiementLe
      ? formatDateTimeFr(d.paiementLe)
      : formatDateFr(d.payeeLe ?? d.date ?? new Date()),
    cashierName: d.payeur || undefined,
    registerName: d.caisse || undefined,
    category: d.categorie || undefined,
    payee: d.beneficiaire || undefined,
    paymentMethod: d.moyen || undefined,
    paymentReference: d.reference_paiement || undefined,
    approvedBy: d.approbateur || undefined,
    amount: d.montant,
    currency: d.devise,
    description: d.description || undefined,
    isDuplicate: true,
  };
}
