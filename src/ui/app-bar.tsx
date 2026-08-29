/**
 * Barre de titre d'écran.
 *
 * Maison, et non le header natif de `Stack` : celui-ci ne sait pas lire les
 * variables NativeWind posées par `ThemeProvider`, il faudrait lui passer des
 * couleurs brutes et donc tenir le thème à deux endroits.
 *
 * **`AppBar` ne pose AUCUNE zone sûre**, c'est `Screen` qui s'en charge. Deux
 * composants qui ajoutent `insets.top` donnent une barre de 90 points de haut,
 * et cela ne se voit que sur un terminal à encoche.
 *
 * Le glyphe de retour est `ArrowLeft`, celui que le back-office pose dans un
 * bouton fantôme : un bouton de retour qui ne se ressemble pas d'une surface à
 * l'autre est exactement ce que ce lot corrige.
 */
import { View } from "react-native";
import { router } from "expo-router";

import { HIT } from "./tokens";
import { Icon } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";

export function AppBar({
  title,
  subtitle,
  right,
  onBack,
  back = true,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  back?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-1 border-b border-border bg-card px-2 py-2">
      {back ? (
        <Pressable
          onPress={onBack ?? (() => router.back())}
          accessibilityRole="button"
          accessibilityLabel="Revenir à la page précédente"
          className="items-center justify-center rounded-lg"
          style={{ width: HIT.min, height: HIT.min }}
        >
          <Icon name="ArrowLeft" size={20} />
        </Pressable>
      ) : (
        <View className="w-2" />
      )}
      <View className="min-w-0 flex-1">
        {title ? (
          <Text variant="h4" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
