/**
 * Icônes.
 *
 * Un seul jeu, une seule épaisseur de trait : mélanger deux familles se voit
 * immédiatement dans une barre d'onglets. Ionicons couvre tout ce dont un POS
 * a besoin et existe en variante pleine et contour.
 *
 * La couleur passe par un jeton et jamais par un hexadécimal en dur : c'est ce
 * qui fait qu'une icône suit le thème sombre sans qu'on y pense. L'ancienne
 * application semait des `#374151` et `#9ca3af` dans les écrans, et ils
 * seraient tous restés clairs.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";

import { useTheme } from "./theme";
import type { Palette } from "./tokens";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export interface IconProps {
  name: IconName;
  size?: number;
  /** Jeton de couleur. Par défaut, la couleur du texte courant. */
  color?: keyof Palette;
}

export function Icon({ name, size = 20, color = "foreground" }: IconProps) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={colors[color]} />;
}
