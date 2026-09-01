/**
 * Courbe d'aire, en SVG. Miroir de l'`AreaChart` recharts du back-office.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE DEVISE PAR GRAPHIQUE, ET ELLE EST NOMMÉE.                     │
 * │                                                                          │
 * │ Même règle que le `BarChart`, et pour la même raison : empiler des       │
 * │ francs et des dollars dessine une courbe qui ne veut rien dire. Le       │
 * │ composant ne connaît pas les devises - il reçoit des nombres et un       │
 * │ formateur -, c'est l'appelant qui garantit l'homogénéité de la série.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Fait maison plutôt qu'une bibliothèque : `react-native-svg` est déjà là, et
 * aucune des bibliothèques de graphiques ne suit les jetons de thème sans
 * configuration. C'est l'arbitrage déjà rendu pour le `BarChart`, et celui
 * rendu contre `react-native-nyx-printer` : une dépendance se paie en arbre
 * de paquets et en retard sur React Native, pas en lignes de code économisées.
 *
 * **L'INTERPOLATION EST MONOTONE (Fritsch-Carlson), pas une Bézier naïve.**
 * Une courbe lissée « au plus simple » DÉPASSE ses points : entre une journée
 * à zéro et une journée à cent, elle descend sous zéro avant de remonter. Sur
 * un chiffre d'affaires, cela dessine une recette négative qui n'a jamais
 * existé, et le remplissage la peint sous l'axe. C'est aussi ce que fait
 * `type="monotone"` côté web, donc la parité est exacte.
 *
 * **Il n'y a pas de survol sur un téléphone.** Le web lit ses valeurs dans une
 * infobulle ; ici on touche la courbe et la valeur s'écrit en tête, où elle
 * reste lisible après le doigt levé.
 */
import { useState } from "react";
import { View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import { indicesEtiquettes } from "@/features/tableau-de-bord/series";

import { Text } from "./text";
import { useTheme } from "./theme";

export interface PointAire {
  label: string;
  valeur: number;
}

/** Marge intérieure : le trait a 2 points d'épaisseur et le marqueur 4 de rayon. */
const MARGE = 6;

/**
 * Pentes monotones de Fritsch-Carlson.
 *
 * Chaque pente est bornée par les pentes des segments voisins, ce qui garantit
 * qu'aucun arc ne sort de l'intervalle de ses deux extrémités. C'est cette
 * borne, et elle seule, qui empêche la courbe de plonger sous zéro.
 */
function pentes(ys: number[], dx: number): number[] {
  const n = ys.length;
  if (n < 2) return new Array(n).fill(0);
  const deltas = new Array(n - 1);
  for (let i = 0; i < n - 1; i += 1) deltas[i] = (ys[i + 1] - ys[i]) / dx;

  const m = new Array(n).fill(0);
  m[0] = deltas[0];
  m[n - 1] = deltas[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    // Un extremum local reçoit une pente NULLE : c'est ce qui aplatit le
    // sommet au lieu de le dépasser.
    m[i] = deltas[i - 1] * deltas[i] <= 0 ? 0 : (deltas[i - 1] + deltas[i]) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (deltas[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / deltas[i];
    const b = m[i + 1] / deltas[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * deltas[i];
      m[i + 1] = t * b * deltas[i];
    }
  }
  return m;
}

function cheminCourbe(xs: number[], ys: number[], dx: number): string {
  if (xs.length === 0) return "";
  if (xs.length === 1) return `M ${xs[0]} ${ys[0]}`;
  const m = pentes(ys, dx);
  let d = `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const c1x = xs[i] + dx / 3;
    const c1y = ys[i] + (m[i] * dx) / 3;
    const c2x = xs[i + 1] - dx / 3;
    const c2y = ys[i + 1] - (m[i + 1] * dx) / 3;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${xs[i + 1].toFixed(2)} ${ys[i + 1].toFixed(2)}`;
  }
  return d;
}

export function AreaChart({
  points,
  hauteur = 170,
  formater,
  /**
   * Ce qui s'écrit en tête tant que rien n'est touché. À défaut, le MAXIMUM
   * de la série : c'est la seule valeur que l'échelle rend déjà lisible, et
   * l'annoncer évite de laisser croire que le point le plus haut vaut le
   * total de la période.
   */
  resume,
}: {
  points: PointAire[];
  hauteur?: number;
  /** Rendu d'une valeur avec sa devise. L'appelant la connaît, pas nous. */
  formater: (v: number) => string;
  resume?: { label: string; valeur: number };
}) {
  const { colors } = useTheme();
  const [largeur, setLargeur] = useState(0);
  const [choisi, setChoisi] = useState<number | null>(null);

  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.valeur), 0);
  const utileL = Math.max(0, largeur - MARGE * 2);
  const utileH = hauteur - MARGE * 2;
  // Un maximum nul laisserait la courbe collée en haut : on l'assoit au bas.
  const y = (v: number) => MARGE + (max > 0 ? utileH - (v / max) * utileH : utileH);
  const dx = points.length > 1 ? utileL / (points.length - 1) : 0;
  const xs = points.map((_, i) =>
    points.length > 1 ? MARGE + i * dx : MARGE + utileL / 2
  );
  const ys = points.map((p) => y(p.valeur));

  const trait = cheminCourbe(xs, ys, dx);
  // L'aire referme sur la ligne de base ; sans le `L` de retour, le
  // remplissage se ferme en diagonale sur le premier point.
  const aire =
    points.length > 1
      ? `${trait} L ${xs[xs.length - 1].toFixed(2)} ${hauteur - MARGE} L ${xs[0].toFixed(2)} ${hauteur - MARGE} Z`
      : "";

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LA DENSITÉ DE L'AXE SE DÉDUIT DE LA LARGEUR DES ÉTIQUETTES.          │
  // │                                                                      │
  // │ Un nombre fixe ne peut pas convenir aux deux : « 06 » tient dix fois │
  // │ sur la largeur d'une carte, « janv. » quatre fois moins. Fixé à      │
  // │ sept, l'année perdait un mois sur huit alors que la place était là.  │
  // │ Le plafond de HUIT n'est pas une contrainte de place mais de calme : │
  // │ au-delà, un axe de quantièmes se lit comme une règle graduée.        │
  // └──────────────────────────────────────────────────────────────────────┘
  const largeurEtiquette =
    Math.max(...points.map((p) => p.label.length), 1) * 6.6 + 6;
  const tiennent = utileL > 0 ? Math.floor(utileL / largeurEtiquette) : 2;
  const visibles = indicesEtiquettes(
    points.length,
    Math.max(2, Math.min(8, tiennent))
  );
  const point = choisi !== null ? points[choisi] : null;

  const toucher = (e: GestureResponderEvent) => {
    if (largeur <= 0) return;
    const x = e.nativeEvent.locationX;
    const i =
      points.length > 1
        ? Math.round((x - MARGE) / (dx || 1))
        : 0;
    setChoisi(Math.min(points.length - 1, Math.max(0, i)));
  };

  const mesurer = (e: LayoutChangeEvent) => setLargeur(e.nativeEvent.layout.width);

  return (
    <View>
      {/* La lecture en tête REMPLACE l'infobulle du web : sur un téléphone il
          n'y a pas de survol, et une valeur qu'on ne peut lire qu'en gardant
          le doigt posé n'est pas lisible du tout. */}
      <View className="mb-2 h-5 flex-row items-baseline justify-between">
        <Text variant="caption" numberOfLines={1}>
          {point ? point.label : (resume?.label ?? "Maximum")}
        </Text>
        <Text
          variant="bodySmall"
          numeric
          numberOfLines={1}
          className="font-sans-medium"
        >
          {formater(point ? point.valeur : (resume?.valeur ?? max))}
        </Text>
      </View>

      <View
        onLayout={mesurer}
        style={{ height: hauteur }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={toucher}
        onResponderMove={toucher}
        accessibilityRole="image"
        accessibilityLabel={`Évolution sur ${points.length} points, maximum ${formater(max)}`}
      >
        {largeur > 0 ? (
          <Svg width={largeur} height={hauteur}>
            <Defs>
              <LinearGradient id="aireVentes" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity={0.28} />
                <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Filets de fond, discrets : ils situent sans concurrencer la
                donnée. Trois suffisent, le web en dessine autant. */}
            {[0, 0.5, 1].map((part) => (
              <Line
                key={part}
                x1={MARGE}
                x2={largeur - MARGE}
                y1={MARGE + part * utileH}
                y2={MARGE + part * utileH}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ))}

            {aire ? <Path d={aire} fill="url(#aireVentes)" /> : null}
            <Path
              d={trait}
              stroke={colors.primary}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />

            {/* Un point unique n'a pas de courbe : sans ce marqueur, la
                journée sélectionnée ne se verrait pas du tout. */}
            {points.length === 1 ? (
              <Circle cx={xs[0]} cy={ys[0]} r={4} fill={colors.primary} />
            ) : null}

            {choisi !== null ? (
              <>
                <Line
                  x1={xs[choisi]}
                  x2={xs[choisi]}
                  y1={MARGE}
                  y2={hauteur - MARGE}
                  stroke={colors.mutedForeground}
                  strokeWidth={1}
                />
                <Circle
                  cx={xs[choisi]}
                  cy={ys[choisi]}
                  r={5}
                  fill={colors.primary}
                  stroke={colors.card}
                  strokeWidth={2}
                />
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>

      {/* ┌──────────────────────────────────────────────────────────────────┐
          │ LES ÉTIQUETTES SONT POSÉES, PAS RÉPARTIES EN PARTS ÉGALES.       │
          │                                                                  │
          │ Une rangée de `flex-1` donne à chaque étiquette la largeur d'un  │
          │ point de la série : sur un mois, trois cent trente points        │
          │ divisés par trente et un font dix points par cellule, où « 06 »  │
          │ ne tient pas. React Native l'a coupé en « … », et l'axe rendait  │
          │ « 01 … 11 16 21 … 31 » - relevé sur l'émulateur, invisible à la  │
          │ relecture parce que les étiquettes des bords, elles, tenaient.   │
          │                                                                  │
          │ Chacune est donc ancrée à SON abscisse, avec la place de         │
          │ s'écrire ; les bords s'alignent sur le bord pour ne pas sortir   │
          │ de la carte.                                                     │
          └──────────────────────────────────────────────────────────────────┘ */}
      <View className="mt-1.5 h-4">
        {points.map((p, i) => {
          if (!visibles.has(i) || largeur <= 0) return null;
          const premier = i === 0;
          const dernier = i === points.length - 1;
          return (
            <View
              key={`${p.label}-${i}`}
              className="absolute w-14"
              style={{
                left: premier
                  ? 0
                  : dernier
                    ? undefined
                    : Math.round(xs[i]) - 28,
                right: dernier ? 0 : undefined,
              }}
            >
              <Text
                variant="caption"
                numberOfLines={1}
                className={`${premier ? "text-left" : dernier ? "text-right" : "text-center"}${
                  choisi === i ? " text-foreground" : ""
                }`}
              >
                {p.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
