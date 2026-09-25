/**
 * Quel entrepôt une dépense doit porter, et ce que ça change pour son auteur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE DÉPENSE SANS ENTREPÔT EST INVISIBLE À SON PROPRE AUTEUR.            │
 * │                                                                          │
 * │ `ExpenseViewSet.get_queryset` appelle `restrict_visibility_for_request`  │
 * │ avec `include_null_warehouse=False`, et c'est DÉLIBÉRÉ côté serveur :    │
 * │ les charges d'établissement - loyer, salaires - restent au propriétaire. │
 * │ Mais ni le back-office ni le terminal n'envoyaient d'entrepôt, si bien   │
 * │ qu'un GÉRANT qui saisit une dépense la perd de vue à la seconde où elle  │
 * │ part. Elle n'est pas perdue, elle est invisible - ce qui est pire, parce │
 * │ qu'il la ressaisit.                                                      │
 * │                                                                          │
 * │ Le caissier, lui, est borné par `created_by` : l'entrepôt ne change rien │
 * │ à SA visibilité. Il décide en revanche si le gérant qui doit approuver   │
 * │ verra jamais son brouillon.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DÉFAUT SE PREND DANS LES ENTREPÔTS ACCESSIBLES, JAMAIS DANS TOUTE LA │
 * │ TABLE.                                                                   │
 * │                                                                          │
 * │ `create_expense` oppose `assert_warehouse_allowed_for_request` dès qu'un │
 * │ entrepôt est présent : un entrepôt hors périmètre lève une erreur de     │
 * │ validation, donc verdict `rejected`, donc quarantaine. Un                │
 * │ `entrepotParDefaut(tousLesEntrepots)` naïf enverrait donc TOUTES les     │
 * │ dépenses d'un gérant affecté à la boutique B vers la quarantaine, parce  │
 * │ que la boutique A porte `is_default`.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il décide de ce qui part au serveur, il doit s'éprouver sans
 * appareil.
 */
import { entrepotParDefaut } from "@/data/entrepot-defaut";
import {
  entrepotsAccessibles,
  ROLES_BORNES_PAR_ENTREPOT as ROLES_BORNES,
  type EntrepotNomme,
  type RoleMembre,
} from "@/features/perimetre/entrepots";

// La règle « quels entrepôts ce rôle peut-il viser » a DÉMÉNAGÉ dans
// `features/perimetre/entrepots.ts` : elle sert désormais tous les filtres de
// l'application, et un module qui parle de dépenses n'était pas sa place. On la
// réexporte pour que les appelants existants n'aient rien à changer.
export { entrepotsAccessibles };
export type { EntrepotNomme, RoleMembre };

/**
 * L'entrepôt à proposer d'emblée, pris dans les seuls accessibles.
 *
 * Rend `null` quand il y a plusieurs dépôts et aucun principal : deviner ferait
 * rattacher la dépense au mauvais établissement, et le marchand ne s'en
 * apercevrait qu'en cherchant une pièce qu'il ne retrouve pas.
 */
export function entrepotDeLaDepense(
  role: RoleMembre,
  assignes: { id: string }[],
  tous: EntrepotNomme[]
): string | null {
  return entrepotParDefaut(entrepotsAccessibles(role, assignes, tous));
}

/**
 * Cette dépense échappera-t-elle à la vue de son auteur une fois envoyée ?
 *
 * Vrai pour un rôle borné qui n'attache aucun entrepôt. Le propriétaire, lui,
 * voit tout : `null` lui est parfaitement licite, et c'est même le seul moyen
 * d'enregistrer une charge d'établissement.
 */
export function depenseSeraitInvisible(
  role: RoleMembre,
  entrepotChoisi: string | null
): boolean {
  return entrepotChoisi === null && ROLES_BORNES.includes(role);
}

/**
 * Un rôle borné SANS aucune affectation ne peut pas saisir utilement.
 *
 * Le formulaire le DIT au lieu de laisser enregistrer une pièce que personne
 * ne reverra : c'est « `null` ne se lit jamais comme zéro » appliqué à la
 * visibilité. L'absence d'affectation se dit, elle ne se devine pas.
 */
export function saisieSansIssue(
  role: RoleMembre,
  assignes: { id: string }[],
  tous: EntrepotNomme[]
): boolean {
  return (
    ROLES_BORNES.includes(role) &&
    entrepotsAccessibles(role, assignes, tous).length === 0
  );
}
