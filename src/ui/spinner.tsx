import { ActivityIndicator, View } from "react-native";

import { Text } from "./text";
import { useTheme } from "./theme";
import type { Palette } from "./tokens";

export interface SpinnerProps {
  size?: "small" | "large";
  color?: keyof Palette;
  /** Texte sous l'indicateur : dire ce qu'on attend vaut mieux que tourner. */
  label?: string;
  /** Occupe tout l'espace disponible et centre. */
  fill?: boolean;
}

export function Spinner({
  size = "small",
  color = "primary",
  label,
  fill = false,
}: SpinnerProps) {
  const { colors } = useTheme();
  return (
    <View className={fill ? "flex-1 items-center justify-center" : "items-center"}>
      <ActivityIndicator size={size} color={colors[color]} />
      {label ? (
        <Text variant="caption" className="mt-2 text-center">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
