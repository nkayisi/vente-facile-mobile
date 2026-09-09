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
import { useState } from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { indicesEtiquettes } from "@/features/tableau-de-bord/series";

import { Text } from "./text";
import { useTheme } from "./theme";

/** `gap-1.5` de la rangée de barres, en points. L'ancrage des étiquettes en
 *  dépend : deux valeurs à tenir en phase finiraient par diverger. */
const GOUTTIERE = 6;

export interface PointGraphe {
  label: string;
  valeur: number;
  /**
   * Seconde barre du même créneau, pour un graphique GROUPÉ.
   *
   * Le flux de trésorerie du back-office dessine les entrées ET les sorties
   * côte à côte : c'est leur écart qui renseigne, et une seule des deux ne le
   * montre pas. Le terminal se repliait sur les entrées seules, ce qui était
   * un écart avec le web autant qu'une demi-lecture.
   */
  valeurSecondaire?: number;
}

export function BarChart({
  points,
  hauteur = 120,
  /** Rendu d'une valeur, avec sa devise. L'appelant la connaît, pas nous. */
  formater,
  /** Nomme les deux séries d'un graphique groupé. Sans elles, deux couleurs
   *  sans légende ne disent pas laquelle est laquelle. */
  legende,
}: {
  points: PointGraphe[];
  hauteur?: number;
  formater?: (v: number) => string;
  legende?: { principale: string; secondaire: string };
}) {
  const { colors } = useTheme();
  const [largeur, setLargeur] = useState(0);
  const groupe = points.some((p) => p.valeurSecondaire !== undefined);
  // L'échelle porte sur les DEUX séries : la calculer sur la première ferait
  // sortir du cadre une sortie plus grosse que l'entrée du même jour, et cette
  // journée-là est précisément celle qu'on cherche.
  const max = Math.max(
    ...points.map((p) => Math.max(p.valeur, p.valeurSecondaire ?? 0)),
    0
  );

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LA DENSITÉ DE L'AXE SE DÉDUIT DE LA LARGEUR DES ÉTIQUETTES.          │
  // │                                                                      │
  // │ Une rangée de `flex-1` donne à chaque étiquette la largeur d'une      │
  // │ BARRE. Douze journées sur trois cent soixante points font trente     │
  // │ points par cellule, où « 09/08 » ne tient pas : React Native le      │
  // │ coupe en « 09/… », et l'axe rend « 09/… 14/08 16/08 17/08 24/… ».    │
  // │ Relevé à l'écran sur le flux de trésorerie.                          │
  // │                                                                      │
  // │ C'est le défaut déjà corrigé sur l'`AreaChart` du tableau de bord, et │
  // │ le remède est le sien, au même helper près : on n'affiche qu'une     │
  // │ étiquette sur N, N venant de la place réellement disponible. La      │
  // │ CELLULE reste, vide, pour que l'alignement sur les barres tienne -   │
  // │ retirer la vue décalerait tout l'axe.                                │
  // └──────────────────────────────────────────────────────────────────────┘
  const largeurEtiquette =
    Math.max(...points.map((p) => p.label.length), 1) * 6.6 + 6;
  const tiennent = largeur > 0 ? Math.floor(largeur / largeurEtiquette) : 2;
  const visibles = indicesEtiquettes(
    points.length,
    Math.max(2, Math.min(8, tiennent))
  );

  if (points.length === 0) return null;

  return (
    <View>
      <View className="flex-row items-end gap-1.5" style={{ height: hauteur }}>
        {points.map((p, i) => {
          // Une valeur nulle garde un filet visible : une barre absente se lit
          // comme une donnée manquante, pas comme un zéro.
          const part = max > 0 ? p.valeur / max : 0;
          const h = Math.max(2, Math.round(part * hauteur));
          const hSecondaire =
            p.valeurSecondaire === undefined
              ? 0
              : Math.max(
                  2,
                  Math.round((max > 0 ? p.valeurSecondaire / max : 0) * hauteur)
                );
          return (
              <View key={`${p.label}-${i}`} className="flex-1 flex-row items-end gap-0.5">
                <View className="flex-1 justify-end">
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
                {groupe ? (
                  <View className="flex-1 justify-end">
                    <Svg width="100%" height={hSecondaire}>
                      <Rect
                        x="0"
                        y="0"
                        width="100%"
                        height={hSecondaire}
                        rx={4}
                        fill={
                          (p.valeurSecondaire ?? 0) > 0 ? colors.destructive : colors.border
                        }
                      />
                    </Svg>
                  </View>
                ) : null}
              </View>
            );
        })}
      </View>
      {/* ┌────────────────────────────────────────────────────────────────┐
          │ LES ÉTIQUETTES SONT ANCRÉES, PAS RÉPARTIES EN CELLULES.        │
          │                                                                │
          │ Une cellule `flex-1` fait la largeur d'une BARRE : trente      │
          │ points pour douze journées, où « 09/08 » ne tient pas, même    │
          │ quand on n'en affiche qu'une sur deux - la place gagnée est    │
          │ chez la voisine, pas chez elle. Ancrée sur le CENTRE de sa     │
          │ barre, l'étiquette déborde sur les cellules vides et se lit    │
          │ en entier. C'est ce que fait l'`AreaChart`, pour la même       │
          │ raison et depuis le même défaut.                               │
          │                                                                │
          │ Les bords sont ramenés DANS le cadre : une première étiquette  │
          │ centrée sur la première barre sortirait à gauche de la carte.  │
          └────────────────────────────────────────────────────────────────┘ */}
      <View
        className="mt-1.5"
        style={{ height: 16 }}
        onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
      >
        {largeur > 0
          ? points.map((p, i) => {
              if (!visibles.has(i)) return null;
              const cellule = (largeur - GOUTTIERE * (points.length - 1)) / points.length;
              const centre = i * (cellule + GOUTTIERE) + cellule / 2;
              const demi = largeurEtiquette / 2;
              const x = Math.min(Math.max(centre - demi, 0), Math.max(0, largeur - largeurEtiquette));
              return (
                <Text
                  key={`${p.label}-l-${i}`}
                  variant="caption"
                  numberOfLines={1}
                  style={{
                    position: "absolute",
                    left: x,
                    width: largeurEtiquette,
                    textAlign: "center",
                  }}
                >
                  {p.label}
                </Text>
              );
            })
          : null}
      </View>
      {legende ? (
        <View className="mt-2 flex-row items-center gap-4">
          <View className="flex-row items-center gap-1.5">
            <View className="h-2.5 w-2.5 rounded-full bg-primary" />
            <Text variant="caption">{legende.principale}</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="h-2.5 w-2.5 rounded-full bg-destructive" />
            <Text variant="caption">{legende.secondaire}</Text>
          </View>
        </View>
      ) : null}

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

/**
 * Barres HORIZONTALES, libellés à gauche.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST CE QUE LE BACK-OFFICE DESSINE, ET C'EST AUSSI LE BON CHOIX ICI.   │
 * │                                                                          │
 * │ « Ventes par mode de paiement » et « Achats par client » y sont des      │
 * │ `BarChart layout="vertical"` de recharts, c'est-à-dire des barres        │
 * │ horizontales. Le terminal y avait mis un ANNEAU : lecture différente     │
 * │ pour la même donnée, et un marchand qui compare les deux écrans ne       │
 * │ retrouve pas son graphique.                                              │
 * │                                                                          │
 * │ L'horizontale sert en outre ce que la verticale ne sait pas faire : un   │
 * │ nom de client ou de moyen de paiement est LONG, et il se lit en entier   │
 * │ dans une colonne de gauche là où un axe vertical le coupe.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function BarChartHorizontal({
  points,
  formater,
  /** Largeur de la colonne des libellés. Assez pour un nom, pas plus. */
  largeurLabel = 110,
}: {
  points: PointGraphe[];
  formater: (v: number) => string;
  largeurLabel?: number;
}) {
  const { colors } = useTheme();
  const max = Math.max(...points.map((p) => p.valeur), 0);

  if (points.length === 0) return null;

  return (
    <View className="gap-2.5">
      {points.map((p, i) => {
        // Une valeur nulle garde un filet visible : une barre absente se lit
        // comme une donnée manquante, pas comme un zéro.
        const part = max > 0 ? p.valeur / max : 0;
        return (
          <View key={`${p.label}-${i}`} className="flex-row items-center gap-2">
            <View style={{ width: largeurLabel }}>
              <Text variant="caption" numberOfLines={2}>
                {p.label}
              </Text>
            </View>
            <View className="min-w-0 flex-1">
              <View className="h-5 flex-row items-center">
                <View style={{ width: `${Math.max(1.5, part * 100)}%` }}>
                  <Svg width="100%" height={20}>
                    <Rect
                      x="0"
                      y="0"
                      width="100%"
                      height={20}
                      rx={4}
                      fill={p.valeur > 0 ? colors.primary : colors.border}
                    />
                  </Svg>
                </View>
              </View>
            </View>
            <Text variant="caption" numeric className="font-sans-medium">
              {formater(p.valeur)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
