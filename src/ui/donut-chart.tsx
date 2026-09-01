/**
 * Anneau de répartition, en SVG. Miroir du `PieChart` recharts du back-office.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA LÉGENDE PORTE LES MONTANTS, ELLE NE SE CONTENTE PAS DES NOMS.        │
 * │                                                                          │
 * │ Le web nomme les tranches dans sa légende et cache les montants dans     │
 * │ une infobulle de SURVOL. Un téléphone n'a pas de survol : reprendre cette│
 * │ légende telle quelle donnerait un anneau dont AUCUN chiffre n'est        │
 * │ lisible, et un marchand qui veut savoir combien est entré en espèces     │
 * │ n'aurait nulle part où le lire. Chaque ligne porte donc son montant et   │
 * │ sa part.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le trou de l'anneau n'est pas décoratif : il porte le total, et la tranche
 * choisie quand on en touche une. C'est ce qui rend la sélection utile plutôt
 * que jolie.
 *
 * **Les tranches ne sont pas la cible tactile, les lignes de légende le sont.**
 * Un secteur de six degrés fait moins de dix points de large : impossible à
 * viser, et sous la cible de quarante-quatre points. Une ligne de légende fait
 * la largeur de l'écran.
 */
import { useState } from "react";
import { View } from "react-native";
import { formatFixedFr } from "@vente-facile/core";
import Svg, { Circle, G, Path } from "react-native-svg";

import { arcsDonut, cheminSecteur } from "@/features/tableau-de-bord/series";

import { Pressable } from "./pressable";
import { Text } from "./text";
import { useTheme } from "./theme";
import type { ColorToken } from "./tokens";

export interface TrancheDonut {
  /** Clé stable : deux moyens de paiement peuvent porter le même libellé. */
  cle: string;
  label: string;
  valeur: number;
  /** Ligne d'appoint sous le libellé, par exemple « 12 règlements ». */
  detail?: string;
}

/**
 * Les jetons de série, dans l'ordre. Ce sont ceux du thème, jamais des
 * littéraux : le web écrit ses six couleurs en dur et son anneau reste clair
 * en thème sombre.
 */
const SERIE: ColorToken[] = ["chart1", "chart2", "chart3", "chart4", "chart5"];

export function couleurDeSerie(i: number): ColorToken {
  return SERIE[i % SERIE.length];
}

export function DonutChart({
  tranches,
  taille = 168,
  formater,
  /** Libellé du total inscrit au centre, hors sélection. */
  legendeTotal = "Total",
}: {
  tranches: TrancheDonut[];
  taille?: number;
  formater: (v: number) => string;
  legendeTotal?: string;
}) {
  const { colors } = useTheme();
  const [choisi, setChoisi] = useState<string | null>(null);

  const total = tranches.reduce((s, t) => s + Math.max(0, t.valeur), 0);
  const arcs = arcsDonut(tranches.map((t) => t.valeur));
  if (arcs.length === 0) return null;

  const r = taille / 2;
  // 0,62 est le rapport du web (60 sur 100 de rayon, épaissi de deux points
  // pour que l'anneau reste lisible à cent soixante-huit points au lieu de
  // deux cents).
  const rInterne = r * 0.62;
  const actif = tranches.find((t) => t.cle === choisi) ?? null;
  // La VIRGULE décimale, pas le point : « 100.0 % » est de l'anglais, et
  // l'écran d'à côté écrit déjà « 33 620,02 $ ». Deux conventions dans la
  // même carte se remarquent.
  const part = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const partEcrite = (v: number) => `${formatFixedFr(part(v), 1)} %`;

  return (
    <View>
      <View className="items-center">
        <View style={{ width: taille, height: taille }}>
          <Svg width={taille} height={taille}>
            <G>
              {tranches.map((t, i) => {
                const arc = arcs[i];
                if (!arc || arc.fin <= arc.debut) return null;
                const enAvant = actif === null || actif.cle === t.cle;
                return (
                  <Path
                    key={t.cle}
                    d={cheminSecteur(r, r, r, rInterne, arc.debut, arc.fin)}
                    fill={colors[couleurDeSerie(i)]}
                    // La tranche non retenue s'efface au lieu de disparaître :
                    // l'anneau doit rester entier, sinon la part choisie n'a
                    // plus de tout auquel se comparer.
                    opacity={enAvant ? 1 : 0.28}
                  />
                );
              })}
              {/* Un tour complet ne dessine qu'un arc de 360°, que SVG rend
                  vide : la ligne de fond garantit un anneau visible même
                  quand une seule tranche porte tout. */}
              {arcs.length === 1 ? (
                <Circle
                  cx={r}
                  cy={r}
                  r={(r + rInterne) / 2}
                  stroke={colors[couleurDeSerie(0)]}
                  strokeWidth={r - rInterne}
                  fill="none"
                />
              ) : null}
            </G>
          </Svg>

          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center px-6"
          >
            <Text variant="caption" numberOfLines={1}>
              {actif ? actif.label : legendeTotal}
            </Text>
            <Text
              variant="bodySmall"
              numeric
              numberOfLines={1}
              className="mt-0.5 font-sans-bold text-foreground"
            >
              {formater(actif ? actif.valeur : total)}
            </Text>
            {actif ? (
              <Text variant="caption" numeric className="mt-0.5">
                {partEcrite(actif.valeur)}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View className="mt-4">
        {tranches.map((t, i) => {
          const selectionne = choisi === t.cle;
          return (
            <Pressable
              key={t.cle}
              onPress={() => setChoisi(selectionne ? null : t.cle)}
              haptic="selection"
              accessibilityRole="button"
              accessibilityState={{ selected: selectionne }}
              accessibilityLabel={`${t.label}, ${formater(t.valeur)}, ${formatFixedFr(part(t.valeur), 1)} pour cent`}
              className={`min-h-11 flex-row items-center gap-3 rounded-lg px-2 py-2 ${
                selectionne ? "bg-muted" : ""
              }`}
            >
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colors[couleurDeSerie(i)] }}
              />
              <View className="min-w-0 flex-1">
                <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
                  {t.label}
                </Text>
                {t.detail ? (
                  <Text variant="caption" numberOfLines={1}>
                    {t.detail}
                  </Text>
                ) : null}
              </View>
              <View className="items-end">
                <Text variant="bodySmall" numeric numberOfLines={1}>
                  {formater(t.valeur)}
                </Text>
                <Text variant="caption" numeric>
                  {partEcrite(t.valeur)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
