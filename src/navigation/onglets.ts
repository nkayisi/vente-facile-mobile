/**
 * Les cinq onglets du bas. FIXES, quel que soit le rôle.
 *
 * C'est une révision de la première version, qui adaptait le jeu d'onglets au
 * rôle : une barre qui change de contenu selon qui se connecte oblige à
 * réapprendre l'application à chaque poste. Cinq emplacements toujours aux
 * mêmes places se retiennent au pouce, et les entrées hors droits sont de
 * toute façon signalées dans le tiroir.
 *
 * Le POS est au CENTRE, pas en tête : c'est l'action la plus fréquente de la
 * journée, et le centre de la barre est le point le plus sûr du pouce.
 *
 * **Les onze sections du menu restent toutes déclarées comme écrans d'onglet**,
 * avec `href: null` pour celles qui n'ont pas de bouton. Une route absente de
 * la déclaration perdrait la barre d'onglets quand on y entre depuis le tiroir.
 */
import type { IconName } from "@/ui";

export interface Onglet {
  /** Nom du fichier de route dans le groupe `(tabs)`. */
  nom: string;
  /** Étiquette de la barre. Courte : un bouton dispose d'un cinquième de la largeur. */
  label: string;
  icon: IconName;
}

export const ONGLETS: readonly Onglet[] = [
  { nom: "index", label: "Accueil", icon: "LayoutDashboard" },
  { nom: "caisse", label: "Caisse", icon: "Wallet" },
  { nom: "vendre", label: "POS", icon: "ShoppingCart" },
  { nom: "stock", label: "Stock", icon: "Boxes" },
  { nom: "parametres", label: "Paramètres", icon: "Settings" },
] as const;

export const NOMS_ONGLETS: readonly string[] = ONGLETS.map((o) => o.nom);
