/**
 * Icônes, deux familles derrière un seul composant.
 *
 * **lucide** porte tout ce qui a un miroir dans le back-office.** Ce sont
 * exactement les mêmes dessins : le registre est engendré depuis les deux
 * paquets et le générateur compare les tracés (voir `icons/registre.ts`). Un
 * marchand qui passe de son ordinateur à son terminal retrouve donc le même
 * glyphe au même endroit du même menu, ce qui est tout l'objet du lot.
 *
 * **Ionicons ne sert que là où le mobile est seul** : caméra, empreinte
 * digitale, Bluetooth, pavé numérique. Le web n'a pas ces écrans, il n'y a donc
 * rien à mettre en miroir.
 *
 * Le préfixe `ion:` est OBLIGATOIRE, jamais optionnel. Sans lui, un nom
 * d'Ionicon qui ressemble à un nom lucide passerait en silence dans la mauvaise
 * famille, et l'épaisseur de trait changerait au milieu d'une liste : le défaut
 * visuel le plus visible et le plus difficile à nommer.
 *
 * La couleur passe par un jeton, jamais par un hexadécimal en dur : c'est ce qui
 * fait qu'une icône suit le thème sombre sans qu'on y pense. L'ancienne
 * application semait des `#374151` dans les écrans, et ils seraient tous restés
 * clairs.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";

import { LUCIDE, type NomLucide } from "./icons/registre";
import { useTheme } from "./theme";
import type { Palette } from "./tokens";

type NomIonicon = ComponentProps<typeof Ionicons>["name"];

/** `"Boxes"` pour un glyphe du back-office, `"ion:camera-outline"` pour un glyphe propre au mobile. */
export type IconName = NomLucide | `ion:${NomIonicon}`;

export interface IconProps {
  name: IconName;
  /**
   * Taille en points. Par défaut 20, comme le `h-5 w-5` du web.
   *
   * Ionicons est appliqué UN POINT PLUS GRAND que lucide : le premier dessine
   * des pleins, le second des traits, et à taille égale un trait paraît plus
   * léger. La compensation vit ici et non dans les appels, sinon chaque écran
   * la refait à sa façon.
   */
  size?: number;
  /** Jeton de couleur. Par défaut, la couleur du texte courant. */
  color?: keyof Palette;
  /** Épaisseur du trait lucide. 2 est la valeur du web. Sans effet sur Ionicons. */
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color = "foreground", strokeWidth = 2 }: IconProps) {
  const { colors } = useTheme();
  return <IconBrute name={name} size={size} color={colors[color]} strokeWidth={strokeWidth} />;
}

/**
 * Variante à couleur brute.
 *
 * **Le seul endroit de l'application où une couleur d'icône n'est pas un
 * jeton**, et c'est justifié : `tabBarIcon` de la barre d'onglets reçoit une
 * couleur déjà interpolée par la navigation entre l'état actif et l'état
 * inactif. Lui imposer un jeton figerait l'animation.
 *
 * Ne pas l'employer ailleurs.
 */
export function IconBrute({
  name,
  size = 20,
  color,
  strokeWidth = 2,
}: Omit<IconProps, "color"> & { color: string }) {
  if (name.startsWith("ion:")) {
    return <Ionicons name={name.slice(4) as NomIonicon} size={size + 1} color={color} />;
  }
  const Glyphe = LUCIDE[name as NomLucide];
  return <Glyphe size={size} color={color} strokeWidth={strokeWidth} />;
}
