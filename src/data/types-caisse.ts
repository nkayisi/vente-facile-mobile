/**
 * Les types de mouvement de caisse et les statuts de dépense.
 *
 * Module PUR, et c'est le motif de l'extraction : ils vivaient dans
 * `data/caisse`, qui ouvre la base SQLite au chargement. Tout module qui veut
 * seulement NOMMER un type - le descripteur d'export, la feuille de filtres,
 * le garde-fou de parité - embarquait donc une base de données, et devenait
 * intestable hors appareil. C'est le déplacement déjà fait pour
 * `data/statuts-vente` et `data/types-mouvement`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIX CLÉS SUR ONZE ÉTAIENT FAUSSES, ET RIEN NE LE SIGNALAIT.             │
 * │                                                                          │
 * │ La table du terminal portait `customer_refund`, `supplier_purchase`,     │
 * │ `capital_injection`, `capital_withdrawal`, `other_income` et             │
 * │ `other_expense` : AUCUN de ces codes n'existe côté serveur.              │
 * │ `CashMovement.MovementType` déclare `sale_return`, `purchase`,           │
 * │ `fund_in`, `fund_out`, `other_in` et `other_out`.                        │
 * │                                                                          │
 * │ La lecture retombait sur son repli (`|| m.type`) et affichait le CODE    │
 * │ TECHNIQUE au milieu de libellés français. Pire : tout mouvement saisi    │
 * │ DEPUIS CE TERMINAL part en `other_in` ou `other_out` (voir              │
 * │ `features/caisse/actes.ts`), donc chaque apport de fonds enregistré au   │
 * │ comptoir s'affichait « other_in » sur l'écran de celui qui venait de le  │
 * │ saisir. Aucune erreur, aucun journal, aucune ligne rouge.                │
 * │                                                                          │
 * │ `change` (« Monnaie rendue ») manquait des DEUX côtés : le back-office   │
 * │ ne le déclare pas non plus, et un rendu de monnaie y sort donc sous son  │
 * │ `movement_type_display`, qui vient du serveur - le web s'en tirait par    │
 * │ chance, le terminal n'a pas ce repli.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Régénérer par :
 *   sed -n '/class MovementType/,/^$/p' backend/apps/cashbook/models.py
 */
import type { IconName } from "@/ui";
import type { GesteDepense } from "./gestes-depense";

/**
 * Les douze types, avec le libellé du serveur et le SENS que la caisse leur
 * connaît.
 *
 * ⚠ `sens` est ici une INDICATION, pas une vérité : `CashMovement.direction`
 * est une colonne à part entière et c'est ELLE qui décide du signe. Un
 * `adjustment` peut aller dans les deux sens, d'où son `null`. On ne s'en sert
 * que pour proposer un type cohérent dans un formulaire, jamais pour peindre
 * une ligne.
 */
export const TYPE_MOUVEMENT_CAISSE: Record<
  string,
  { label: string; sens: "in" | "out" | null }
> = {
  sale: { label: "Vente", sens: "in" },
  sale_return: { label: "Remboursement client", sens: "out" },
  expense: { label: "Dépense", sens: "out" },
  purchase: { label: "Achat fournisseur", sens: "out" },
  supplier_refund: { label: "Remboursement fournisseur", sens: "in" },
  debt_collection: { label: "Recouvrement dette", sens: "in" },
  fund_in: { label: "Apport de fonds", sens: "in" },
  fund_out: { label: "Retrait de fonds", sens: "out" },
  adjustment: { label: "Ajustement de caisse", sens: null },
  change: { label: "Monnaie rendue", sens: null },
  other_in: { label: "Autre entrée", sens: "in" },
  other_out: { label: "Autre sortie", sens: "out" },
};

/**
 * Le libellé d'un type, ou le code s'il est inconnu.
 *
 * Le repli rend le CODE et non « Inconnu » : un code affiché se cherche dans
 * le dépôt, un « Inconnu » ne mène nulle part. C'est ce repli qui a masqué les
 * six clés fausses pendant deux lots - il reste, mais la table est désormais
 * croisée avec le serveur par un test.
 */
export function libelleTypeCaisse(code: string): string {
  return TYPE_MOUVEMENT_CAISSE[code]?.label ?? code;
}

/** Les statuts d'une dépense, libellés et tons du back-office. */
export const STATUT_DEPENSE: Record<
  string,
  { label: string; ton: "neutral" | "warning" | "primary" | "success" | "destructive" }
> = {
  draft: { label: "Brouillon", ton: "neutral" },
  pending: { label: "En attente", ton: "warning" },
  approved: { label: "Approuvée", ton: "primary" },
  paid: { label: "Payée", ton: "success" },
  rejected: { label: "Rejetée", ton: "destructive" },
  cancelled: { label: "Annulée", ton: "neutral" },
};

/**
 * Les gestes possibles sur une dépense : voir `gestes-depense.ts`, module pur
 * éprouvé sur les mêmes cas que le back-office. L'auteur y compte - on
 * n'approuve jamais sa propre dépense, et un caissier ne paie que la sienne.
 */
export type TransitionDepense = GesteDepense;

/** Ce que chaque geste demande comme droit, et ce qu'il dit à l'écran. */
export const TRANSITION_DEPENSE: Record<
  TransitionDepense,
  { label: string; permission: string; destructif: boolean; icone: IconName }
> = {
  // ⚠ `submit` relève de `cashbook.create_expense` : c'est l'auteur qui soumet
  // sa propre dépense. `pay` relève de `cashbook.pay_expense`, que le caissier
  // a : il paie SA dépense une fois approuvée, et l'argent sort de SA caisse.
  // Approuver, rejeter, payer directement et annuler sont des décisions.
  submit: {
    label: "Soumettre",
    permission: "cashbook.create_expense",
    destructif: false,
    icone: "Send",
  },
  approve: {
    label: "Approuver",
    permission: "cashbook.approve_expense",
    destructif: false,
    icone: "CheckCircle2",
  },
  reject: {
    label: "Rejeter",
    permission: "cashbook.approve_expense",
    destructif: true,
    icone: "XCircle",
  },
  pay: {
    label: "Payer",
    permission: "cashbook.pay_expense",
    destructif: false,
    icone: "CreditCard",
  },
  pay_direct: {
    label: "Payer directement",
    permission: "cashbook.approve_expense",
    destructif: false,
    icone: "CreditCard",
  },
  cancel: {
    label: "Annuler la dépense",
    permission: "cashbook.approve_expense",
    destructif: true,
    icone: "XCircle",
  },
};
