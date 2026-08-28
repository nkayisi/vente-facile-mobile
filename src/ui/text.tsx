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

const VARIANTS: Record<TextVariant, string> = {
  h1: "text-3xl font-bold text-foreground",
  h2: "text-2xl font-bold text-foreground",
  h3: "text-xl font-semibold text-foreground",
  h4: "text-lg font-semibold text-foreground",
  bodyLarge: "text-lg text-foreground",
  body: "text-base text-foreground",
  bodySmall: "text-sm text-foreground",
  label: "text-sm font-medium text-foreground",
  caption: "text-xs text-muted-foreground",
  muted: "text-sm text-muted-foreground",
  error: "text-sm text-destructive",
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
      className={`${VARIANTS[variant]}${className ? ` ${className}` : ""}`}
      style={[numeric ? { fontVariant: ["tabular-nums"] } : null, style]}
      {...rest}
    />
  );
}
