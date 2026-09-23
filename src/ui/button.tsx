import { ActivityIndicator, View } from "react-native";

import { fusionner } from "./classes";
import { Icon, type IconName } from "./icon";
import { Pressable, type HapticKind } from "./pressable";
import { Text } from "./text";
import { useTheme } from "./theme";
import type { Palette } from "./tokens";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";

/** `pos` monte à 56 points : au comptoir on appuie vite et sans regarder. */
export type ButtonSize = "sm" | "md" | "lg" | "pos";

const VARIANTS: Record<
  ButtonVariant,
  { box: string; label: string; icon: keyof Palette }
> = {
  primary: {
    box: "bg-primary",
    label: "text-primary-foreground",
    icon: "primaryForeground",
  },
  secondary: {
    box: "bg-secondary",
    label: "text-secondary-foreground",
    icon: "secondaryForeground",
  },
  outline: {
    box: "border border-input bg-transparent",
    label: "text-foreground",
    icon: "foreground",
  },
  ghost: { box: "bg-transparent", label: "text-foreground", icon: "foreground" },
  destructive: {
    box: "bg-destructive",
    label: "text-destructive-foreground",
    icon: "destructiveForeground",
  },
};

const SIZES: Record<ButtonSize, { box: string; text: "bodySmall" | "label" | "body" }> = {
  sm: { box: "h-9 px-3", text: "bodySmall" },
  md: { box: "h-11 px-4", text: "label" },
  lg: { box: "h-12 px-5", text: "body" },
  pos: { box: "h-14 px-6", text: "body" },
};

export interface ButtonProps {
  children: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Affiche un indicateur ET bloque l'appui : un double envoi crée deux ventes. */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: IconName;
  rightIcon?: IconName;
  haptic?: HapticKind;
  className?: string;
}

export function Button({
  children,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  haptic = "selection",
  className = "",
}: ButtonProps) {
  const { colors } = useTheme();
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      haptic={inactive ? "none" : haptic}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      pressedClassName="active:opacity-80"
      // ⚠ `fusionner`, ET PAS UNE CONCATÉNATION. En NativeWind, deux classes
      // qui touchent la même propriété se départagent par ORDRE ALPHABÉTIQUE
      // dans la feuille compilée, pas par l'ordre du `className` : un appelant
      // qui demande `rounded-full` perdait contre le `rounded-lg` d'ici
      // (« f » < « l »), et son bouton restait carré, sans le moindre
      // avertissement. Même piège que `Text` et `Card`, par un troisième
      // chemin. Voir `ui/classes.ts`.
      className={fusionner(
        `flex-row items-center justify-center rounded-lg ${s.box} ${v.box} ${
          inactive ? "opacity-50" : ""
        } ${fullWidth ? "w-full" : "self-start"}`,
        className
      )}
    >
      {/* ┌──────────────────────────────────────────────────────────────────┐
          │ LA ROUE PREND LA PLACE DE L'ICÔNE, PAS CELLE DU LIBELLÉ.        │
          │                                                                  │
          │ Elle remplaçait tout le contenu. Deux conséquences, mesurées sur │
          │ l'émulateur :                                                    │
          │                                                                  │
          │  - un bouton qui n'est pas pleine largeur se RÉTRÉCIT à la       │
          │    taille de la roue. Dans un bandeau, « Synchroniser » devient  │
          │    une pastille de vingt points qui ne dit plus rien de ce qui   │
          │    se passe ;                                                    │
          │  - le libellé de chargement n'était JAMAIS rendu. Trois écrans   │
          │    en écrivaient pourtant un - « Synchronisation en cours »,     │
          │    « Clôture… », « Enregistrement… » - et personne ne l'a jamais │
          │    lu. Un texte écrit pour être vu et qui ne l'est pas est une   │
          │    information perdue deux fois : à l'écriture et à la lecture.  │
          └──────────────────────────────────────────────────────────────────┘ */}
      {loading ? (
        <View className="mr-2">
          <ActivityIndicator size="small" color={colors[v.icon]} />
        </View>
      ) : leftIcon ? (
        <View className="mr-2">
          <Icon name={leftIcon} size={18} color={v.icon} />
        </View>
      ) : null}
      <Text variant={s.text} className={v.label}>
        {children}
      </Text>
      {rightIcon && !loading ? (
        <View className="ml-2">
          <Icon name={rightIcon} size={18} color={v.icon} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Bouton réduit à son icône. La cible reste pleine, seul le dessin rétrécit. */
export function IconButton({
  name,
  onPress,
  variant = "ghost",
  label,
  disabled = false,
  size = 22,
}: {
  name: IconName;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Obligatoire : sans lui, la commande est muette pour un lecteur d'écran. */
  label: string;
  disabled?: boolean;
  size?: number;
}) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-11 w-11 items-center justify-center rounded-lg ${v.box} ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <Icon name={name} size={size} color={v.icon} />
    </Pressable>
  );
}
