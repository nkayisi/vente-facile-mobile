/**
 * Les cinq emplacements de la barre d'onglets.
 *
 * Le contenu des quatre premiers dépend du rôle ; le premier est l'action
 * d'accueil, celle qu'on atteint au pouce sans réfléchir. Le cinquième est
 * TOUJOURS « Plus », et « Plus » est la barre latérale du web à l'identique.
 *
 * **Toutes les sections sont déclarées comme onglets, y compris celles qu'aucun
 * rôle ne montre.** C'est une correction au plan approuvé, qui annonçait « les
 * huit `Tabs.Screen` » : une route absente de la déclaration perd la barre
 * d'onglets quand on y entre depuis « Plus ». Celles hors du jeu du rôle
 * portent `href: null` : la route existe, elle n'a simplement pas de bouton.
 */
import type { Role } from "./menu";

/** Onglet propre au mobile : le comptoir n'est pas une section du menu web. */
export const ONGLET_VENDRE = "vendre";
export const ONGLET_PLUS = "plus";

export const TAB_SETS: Record<Role, readonly string[]> = {
  cashier: [ONGLET_VENDRE, "ventes", "contacts", "caisse", ONGLET_PLUS],
  stock_keeper: ["stock", "inventaire", "mouvements", "articles", ONGLET_PLUS],
  manager: ["index", ONGLET_VENDRE, "ventes", "stock", ONGLET_PLUS],
  owner: ["index", ONGLET_VENDRE, "ventes", "stock", ONGLET_PLUS],
};

/** Sans rôle connu, on ne montre que ce qui ne suppose aucun droit. */
const SANS_ROLE: readonly string[] = ["index", ONGLET_PLUS];

export function ongletsPourRole(role: Role | null | undefined): readonly string[] {
  return role ? TAB_SETS[role] : SANS_ROLE;
}
