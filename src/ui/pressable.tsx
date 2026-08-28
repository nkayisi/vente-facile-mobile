/**
 * Zone tactile de base.
 *
 * Trois choses que `Pressable` de React Native ne fait pas seul et qu'aucun
 * écran ne devrait avoir à refaire :
 *
 * 1. **Une cible d'au moins 44 points.** Un caissier appuie vite, parfois avec
 *    un ongle, parfois avec un gant. Le `hitSlop` compense quand le dessin est
 *    plus petit que la cible utile.
 * 2. **Un retour haptique.** Dans un marché bruyant on n'entend pas le
 *    terminal ; la vibration est le seul accusé de réception fiable.
 * 3. **Un état pressé visible**, sans quoi l'utilisateur appuie deux fois.
 */
import * as Haptics from "expo-haptics";
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
} from "react-native";

import { HIT } from "./tokens";

export type HapticKind = "none" | "selection" | "success" | "warning" | "error";

async function vibrate(kind: HapticKind) {
  if (kind === "none") return;
  try {
    if (kind === "selection") return await Haptics.selectionAsync();
    const type =
      kind === "success"
        ? Haptics.NotificationFeedbackType.Success
        : kind === "warning"
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error;
    await Haptics.notificationAsync(type);
  } catch {
    // Un terminal sans moteur haptique ne doit jamais faire échouer un appui.
  }
}

export interface PressableProps extends Omit<RNPressableProps, "children" | "className"> {
  className?: string;
  /**
   * Retour visuel pendant l'appui, écrit avec la variante `active:` de
   * NativeWind. Sans lui, l'utilisateur appuie deux fois faute de savoir si
   * son geste a porté, ce qui sur un encaissement crée deux ventes.
   */
  pressedClassName?: string;
  haptic?: HapticKind;
  children?: React.ReactNode;
}

export function Pressable({
  className = "",
  pressedClassName = "active:opacity-70",
  haptic = "selection",
  onPress,
  hitSlop,
  children,
  ...rest
}: PressableProps) {
  return (
    <RNPressable
      hitSlop={hitSlop ?? 8}
      onPress={(event) => {
        void vibrate(haptic);
        onPress?.(event);
      }}
      className={`${className} ${pressedClassName}`}
      {...rest}
    >
      {children}
    </RNPressable>
  );
}

export { HIT };
