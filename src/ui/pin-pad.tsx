/**
 * Pavé numérique.
 *
 * Le clavier système ne convient pas : il occupe la moitié de l'écran, ses
 * touches sont petites, et il propose une saisie prédictive absurde pour un
 * code. Ici, douze cibles de 72 points, atteignables au pouce d'une seule main
 * sur un terminal tenu debout au comptoir.
 */
import { View } from "react-native";

import { Icon } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <View className="flex-row justify-center">
      {Array.from({ length }, (_, i) => (
        <View
          key={i}
          className={`mx-2 h-3.5 w-3.5 rounded-full ${
            i < filled ? "bg-primary" : "bg-border"
          }`}
        />
      ))}
    </View>
  );
}

export function PinPad({
  onDigit,
  onBackspace,
  disabled = false,
}: {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row flex-wrap justify-center">
      {KEYS.map((key, index) => {
        if (key === "") return <View key={index} className="m-2 h-[72px] w-[72px]" />;

        const isBack = key === "back";
        return (
          <Pressable
            key={index}
            disabled={disabled}
            onPress={() => (isBack ? onBackspace() : onDigit(key))}
            accessibilityRole="button"
            accessibilityLabel={isBack ? "Effacer" : key}
            pressedClassName="active:bg-secondary"
            className={`m-2 h-[72px] w-[72px] items-center justify-center rounded-full ${
              isBack ? "" : "bg-card"
            } ${disabled ? "opacity-40" : ""}`}
          >
            {isBack ? (
              <Icon name="backspace-outline" size={24} color="mutedForeground" />
            ) : (
              <Text variant="h3" numeric>
                {key}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
