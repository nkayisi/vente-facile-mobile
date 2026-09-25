/**
 * Quels entrepôts un membre peut viser, selon son rôle.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE A DÉMÉNAGÉ, IL N'A PAS ÉTÉ DUPLIQUÉ.                          │
 * │                                                                          │
 * │ Ces trois symboles vivaient dans `features/caisse/perimetre.ts`, un      │
 * │ module qui parle de DÉPENSES : les importer depuis l'écran des           │
 * │ transferts aurait été un mensonge de nom. `features/caisse/perimetre.ts` │
 * │ les réexporte, et ses tests passent sans une ligne modifiée - c'est le   │
 * │ critère qui valide le découpage.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il décide de ce qu'un écran propose, il doit s'éprouver sans
 * appareil.
 */
import { entrepotParDefaut, type EntrepotChoisissable } from "@/data/entrepot-defaut";

export type RoleMembre = "owner" | "manager" | "stock_keeper" | "cashier" | null;

/** Les rôles que le serveur borne par ENTREPÔT (le caissier l'est par son identité). */
export const ROLES_BORNES_PAR_ENTREPOT: RoleMembre[] = ["manager", "stock_keeper"];

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

export { entrepotParDefaut };
export type { EntrepotChoisissable };
