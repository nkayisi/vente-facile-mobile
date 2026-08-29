/**
 * Avatar, avec repli sur les initiales.
 *
 * Miroir de `components/ui/avatar.tsx` : pastille orange, initiales blanches.
 *
 * Le calcul des initiales gère le nom vide et les prénoms composés. Un
 * `nom[0].toUpperCase()` nu plante sur une chaîne vide, ce qui arrive pour un
 * membre créé sans nom.
 */
import { Image } from "react-native";
import { View } from "react-native";

import { Text } from "./text";

export function initiales(nom: string | null | undefined): string {
  const mots = (nom ?? "").trim().split(/[\s-]+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

export function Avatar({
  nom,
  url,
  taille = 40,
}: {
  nom: string | null | undefined;
  url?: string | null;
  taille?: number;
}) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: taille, height: taille, borderRadius: taille / 2 }}
        accessibilityLabel={nom ?? undefined}
      />
    );
  }
  return (
    <View
      className="items-center justify-center bg-primary"
      style={{ width: taille, height: taille, borderRadius: taille / 2 }}
    >
      <Text
        className="font-sans-semibold text-primary-foreground"
        style={{ fontSize: Math.round(taille * 0.38) }}
      >
        {initiales(nom)}
      </Text>
    </View>
  );
}
