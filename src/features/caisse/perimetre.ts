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
import { entrepotParDefaut, type EntrepotChoisissable } from "@/data/entrepot-defaut";

export type RoleMembre = "owner" | "manager" | "stock_keeper" | "cashier" | null;

/** Les rôles que le serveur borne par entrepôt sur la LISTE des dépenses. */
const ROLES_BORNES: RoleMembre[] = ["manager", "stock_keeper"];

export interface EntrepotNomme extends EntrepotChoisissable {
  nom: string;
}

/**
 * Les entrepôts qu'un membre peut viser sans se faire refuser.
 *
 * Un propriétaire n'a pas d'affectation : `accessible_warehouse_ids` rend
 * `None` pour lui côté serveur, ce qui veut dire « tous ». Pour les autres,
 * c'est exactement `assigned_warehouses`.
 */
export function entrepotsAccessibles(
  role: RoleMembre,
  assignes: { id: string }[],
  tous: EntrepotNomme[]
): EntrepotNomme[] {
  if (role === "owner") return tous.filter((e) => e.actif);
  const permis = new Set(assignes.map((a) => a.id));
  return tous.filter((e) => e.actif && permis.has(e.id));
}

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
