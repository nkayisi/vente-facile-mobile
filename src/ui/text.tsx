/**
 * Typographie.
 *
 * Une seule échelle, nommée par rôle et non par taille : un écran qui écrit
 * `variant="h2"` reste juste si l'échelle bouge, un écran qui écrit
 * `text-xl` ne l'est plus.
 *
 * `numeric` passe la police en chiffres tabulaires. Le web le fait partout où
 * des montants s'empilent, et c'est encore plus visible sur un écran étroit :
 * sans cela, une colonne de prix ondule et devient pénible à balayer.
 */
import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { fusionner } from "./classes";

export type TextVariant =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "bodyLarge"
  | "body"
  | "bodySmall"
  | "label"
  | "caption"
  | "muted"
  | "error";

/**
 * Chaque variante pose une FAMILLE (`font-sans-bold`), jamais une graisse
 * (`font-bold`). Sur Android, une famille custom ne synthetise pas les
 * graisses : `font-bold` sur Inter rendrait du regular, en silence. Un test
 * interdit les classes de graisse dans tout `src/`.
 */
const VARIANTS: Record<TextVariant, string> = {
  h1: "text-3xl font-sans-bold text-foreground",
  h2: "text-2xl font-sans-bold text-foreground",
  h3: "text-xl font-sans-semibold text-foreground",
  h4: "text-lg font-sans-semibold text-foreground",
  bodyLarge: "text-lg font-sans text-foreground",
  body: "text-base font-sans text-foreground",
  bodySmall: "text-sm font-sans text-foreground",
  label: "text-sm font-sans-medium text-foreground",
  caption: "text-xs font-sans text-muted-foreground",
  muted: "text-sm font-sans text-muted-foreground",
  error: "text-sm font-sans text-destructive",
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  /** Chiffres à chasse fixe : à poser sur tout montant et toute quantité. */
  numeric?: boolean;
  className?: string;
}

export function Text({
  variant = "body",
  numeric = false,
  className,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      // La variante perd ce que l'appelant redéfinit : sans ce retrait,
      // `text-destructive` et `text-2xl` sont SANS EFFET sur une variante qui
      // porte déjà une couleur ou une taille. Voir `ui/classes.ts`.
      className={fusionner(VARIANTS[variant], className)}
      style={[numeric ? { fontVariant: ["tabular-nums"] } : null, style]}
      {...rest}
    />
  );
}
