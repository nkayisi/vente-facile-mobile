/**
 * Tuile de choix : un titre, une description, et un état sélectionné.
 *
 * Miroir de la grille de types d'établissement de l'assistant web, et du
 * sélecteur de sens de conversion des devises, qui a exactement la même forme.
 *
 * **Deux colonnes, pas trois.** Le web passe à trois au-delà de 768 points ; à
 * 390 points il en rend deux, et la description y tient encore. À trois, elle
 * se réduirait à un mot et demi.
 */
import { View } from "react-native";

import { Icon, type IconName } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";

export function TuileChoix({
  titre,
  description,
  icon,
  choisie,
  onPress,
}: {
  titre: string;
  description?: string;
  icon?: IconName;
  choisie: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      haptic="selection"
      accessibilityRole="radio"
      accessibilityState={{ selected: choisie }}
      accessibilityLabel={description ? `${titre}. ${description}` : titre}
      className={`min-w-0 flex-1 basis-[45%] rounded-lg border-2 p-4 ${
        choisie ? "border-primary bg-accent" : "border-border bg-card"
      }`}
    >
      {icon ? (
        <View className="mb-2">
          <Icon name={icon} size={24} color={choisie ? "accentForeground" : "mutedForeground"} />
        </View>
      ) : null}
      <Text
        variant="bodySmall"
        className={
          choisie ? "font-sans-medium text-accent-foreground" : "font-sans-medium text-foreground"
        }
      >
        {titre}
      </Text>
      {description ? (
        <Text variant="caption" className="mt-1">
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}
