import { forwardRef, type ReactNode } from "react";
import { TextInput, View, type TextInputProps } from "react-native";

import { Text } from "./text";
import { useTheme } from "./theme";

/**
 * Champ de saisie.
 *
 * La bordure porte l'état, pas le fond : c'est la convention du back-office
 * (`--input` y est une couleur de BORDURE), et sur mobile un fond coloré par
 * champ rend un formulaire illisible.
 */
export interface InputProps extends Omit<TextInputProps, "className"> {
  /** Affiche la bordure en rouge. Le message va sur `FormField`. */
  invalid?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { invalid = false, leading, trailing, className = "", style, ...rest },
  ref
) {
  const { colors } = useTheme();
  return (
    <View
      className={`h-12 flex-row items-center rounded-lg border bg-card px-3 ${
        invalid ? "border-destructive" : "border-input"
      } ${className}`}
    >
      {leading ? <View className="mr-2">{leading}</View> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.mutedForeground}
        className="flex-1 text-base text-foreground"
        style={style}
        {...rest}
      />
      {trailing ? <View className="ml-2">{trailing}</View> : null}
    </View>
  );
});

/**
 * Libellé, aide et erreur autour d'un champ.
 *
 * Le message d'erreur remplace l'aide au lieu de s'ajouter : empiler les deux
 * pousse le champ suivant sous le clavier au moment précis où l'utilisateur
 * corrige sa saisie.
 */
export function FormField({
  label,
  hint,
  error,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <View className="mb-4">
      <View className="mb-1.5 flex-row items-center">
        <Text variant="label">{label}</Text>
        {required ? <Text variant="label" className="ml-1 text-destructive">*</Text> : null}
      </View>
      {children}
      {error ? (
        <Text variant="error" className="mt-1.5">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" className="mt-1.5">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
