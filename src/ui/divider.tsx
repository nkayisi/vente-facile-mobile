import { View } from "react-native";

/**
 * Filet de séparation.
 *
 * `inset` décale le filet pour qu'il commence sous le texte et non sous
 * l'icône : dans une liste, un filet pleine largeur découpe la colonne
 * d'icônes et casse la lecture verticale.
 */
export function Divider({ inset = false }: { inset?: boolean }) {
  return <View className={`h-px bg-border ${inset ? "ml-14" : ""}`} />;
}
