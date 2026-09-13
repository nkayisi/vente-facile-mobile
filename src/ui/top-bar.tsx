/**
 * Barre du haut : hamburger à gauche, un emplacement libre, la bascule de
 * thème et l'avatar à droite.
 *
 * Miroir de `components/layout/dashboard-header.tsx` en rendu étroit. Le web y
 * met aussi une salutation, mais elle est dans un `hidden sm:block` : **à 390
 * points le back-office n'affiche que le hamburger et l'avatar**, et c'est
 * exactement ce qu'on rend.
 *
 * Le titre de la page n'est PAS ici : sur le web il est dans le corps de la
 * page (`h1`), pas dans l'en-tête. Le reproduire dans la barre le ferait
 * apparaître deux fois.
 *
 * Elle consomme elle-même la zone sûre du haut, puisqu'elle est l'élément le
 * plus haut de l'écran. Les écrans qui vivent dessous ne doivent donc pas la
 * consommer une seconde fois.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA BASCULE DE THÈME EST ICI, ET NON DANS LE TIROIR.                     │
 * │                                                                          │
 * │ On change de thème quand la LUMIÈRE change - le soir au comptoir, sur le │
 * │ trottoir en plein soleil - et à cet instant-là on regarde l'écran, pas   │
 * │ un menu. Dans le pied du tiroir, il fallait d'abord ouvrir le menu pour  │
 * │ atteindre un réglage dont tout l'intérêt est d'être immédiat. C'est le   │
 * │ même motif qui lui a fait quitter l'écran « Apparence ».                 │
 * │                                                                          │
 * │ Divergence ASSUMÉE avec le back-office, qui n'a aucun sélecteur : sa     │
 * │ palette sombre existe, son habillage est codé en clair. C'est l'erreur   │
 * │ à ne pas reproduire sur un terminal tenu du matin au soir.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "./avatar";
import { BasculeTheme } from "./bascule-theme";
import { Icon } from "./icon";
import { Pressable } from "./pressable";
import { HIT } from "./tokens";

export function TopBar({
  nomUtilisateur,
  right,
  onMenu,
  onAvatar,
}: {
  nomUtilisateur?: string | null;
  /**
   * Emplacement libre, rendu le plus à GAUCHE des trois cibles de droite.
   *
   * L'ordre n'est pas négociable : la bascule de thème et l'avatar sont là
   * depuis longtemps, le marchand a la mémoire de leur position, et on ne
   * déplace pas une cible qu'un pouce trouve sans la regarder. Ce qui arrive
   * se range donc AVANT elles, jamais entre elles.
   *
   * ⚠ Ce qui est injecté ici DOIT porter `hitSlop={0}`. `Pressable` étend sa
   * cible de 8 points par défaut : trois boîtes de 44 points qui se touchent
   * verraient leurs zones se recouvrir sur 16 points, et un doigt tombé dans
   * la couture ferait le geste du voisin - changer de thème au lieu d'ouvrir
   * la synchronisation. Les deux cibles voisines le posent déjà, voir
   * `ui/bascule-theme.tsx`.
   */
  right?: React.ReactNode;
  onMenu: () => void;
  onAvatar?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row items-center justify-between border-b border-border bg-card px-2"
      style={{ paddingTop: insets.top }}
    >
      <Pressable
        onPress={onMenu}
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel="Ouvrir le menu"
        className="items-center justify-center rounded-lg"
        style={{ width: HIT.min, height: HIT.min }}
      >
        <Icon name="Menu" size={24} />
      </Pressable>

      <View className="flex-row items-center">
        {right}
        <BasculeTheme />
        <Pressable
          onPress={onAvatar}
          accessibilityRole="button"
          accessibilityLabel="Mon compte"
          // Les deux cibles font DÉJÀ 44 points et se touchent : le `hitSlop`
          // de 8 points que `Pressable` pose par défaut les ferait se
          // recouvrir, et un doigt tombé dans la couture changerait le thème
          // au lieu d'ouvrir le compte. Voir `ui/bascule-theme.tsx`.
          hitSlop={0}
          className="items-center justify-center"
          style={{ width: HIT.min, height: HIT.min }}
        >
          <Avatar nom={nomUtilisateur} taille={32} />
        </Pressable>
      </View>
    </View>
  );
}
