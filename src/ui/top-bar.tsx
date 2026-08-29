/**
 * Barre du haut : hamburger à gauche, avatar à droite.
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
 */
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "./avatar";
import { Icon } from "./icon";
import { Pressable } from "./pressable";
import { HIT } from "./tokens";

export function TopBar({
  nomUtilisateur,
  onMenu,
  onAvatar,
}: {
  nomUtilisateur?: string | null;
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

      <Pressable
        onPress={onAvatar}
        accessibilityRole="button"
        accessibilityLabel="Mon compte"
        className="items-center justify-center"
        style={{ width: HIT.min, height: HIT.min }}
      >
        <Avatar nom={nomUtilisateur} taille={32} />
      </Pressable>
    </View>
  );
}
