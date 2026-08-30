/**
 * Histogramme simple, en SVG.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE DEVISE PAR GRAPHIQUE, ET ELLE EST NOMMÉE.                     │
 * │                                                                          │
 * │ Empiler des francs et des dollars dessinerait une courbe qui ne veut     │
 * │ rien dire. C'est la même règle qui interdit les sommes inter-devises     │
 * │ partout ailleurs dans le produit, et un graphique n'y échappe pas -      │
 * │ il la rend même plus facile à enfreindre sans qu'on s'en aperçoive.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Fait maison plutôt qu'une bibliothèque de graphiques : sept barres et une
 * étiquette ne justifient pas une dépendance de plus, et aucune de celles qui
 * existent ne suit les jetons de thème sans configuration. `react-native-svg`
 * est déjà là, exigé par `lucide-react-native`.
 *
 * Le maximum est calculé sur la série ENTIÈRE, jamais par barre : sinon toutes
 * les barres feraient la même hauteur et le graphique ne dirait plus rien.
 */
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { Text } from "./text";
import { useTheme } from "./theme";

export interface PointGraphe {
  label: string;
  valeur: number;
}

export function BarChart({
  points,
  hauteur = 120,
  /** Rendu d'une valeur, avec sa devise. L'appelant la connaît, pas nous. */
  formater,
}: {
  points: PointGraphe[];
  hauteur?: number;
  formater?: (v: number) => string;
}) {
  const { colors } = useTheme();
  const max = Math.max(...points.map((p) => p.valeur), 0);

  if (points.length === 0) return null;

  return (
    <View>
      <View className="flex-row items-end gap-1.5" style={{ height: hauteur }}>
        {points.map((p, i) => {
          // Une valeur nulle garde un filet visible : une barre absente se lit
          // comme une donnée manquante, pas comme un zéro.
          const part = max > 0 ? p.valeur / max : 0;
          const h = Math.max(2, Math.round(part * hauteur));
          return (
            <View key={`${p.label}-${i}`} className="flex-1 justify-end">
              <Svg width="100%" height={h}>
                <Rect
                  x="0"
                  y="0"
                  width="100%"
                  height={h}
                  rx={4}
                  fill={p.valeur > 0 ? colors.primary : colors.border}
                />
              </Svg>
            </View>
          );
        })}
      </View>
      <View className="mt-1.5 flex-row gap-1.5">
        {points.map((p, i) => (
          <View key={`${p.label}-l-${i}`} className="flex-1 items-center">
            <Text variant="caption" numberOfLines={1}>
              {p.label}
            </Text>
          </View>
        ))}
      </View>
      {formater ? (
        <View className="mt-2 flex-row items-baseline justify-between">
          <Text variant="caption">Maximum</Text>
          <Text variant="caption" numeric>
            {formater(max)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
