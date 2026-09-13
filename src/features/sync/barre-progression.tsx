/**
 * Le filet de progression, visible sur TOUS les écrans.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UN FILET GLOBAL, ET PAS SEULEMENT LE TÉMOIN DE LA BARRE.       │
 * │                                                                          │
 * │ Le témoin de synchronisation vit dans la `TopBar`, donc sur les cinq     │
 * │ onglets seulement. Un cycle automatique qui part pendant que le          │
 * │ marchand est sur une fiche de vente, un comptage ou l'encaissement       │
 * │ n'aurait alors AUCUN retour visible - et la promesse du lot est qu'une   │
 * │ synchronisation se voit toujours.                                        │
 * │                                                                          │
 * │ Il est rendu par le fournisseur, donc au-dessus de toute la navigation,  │
 * │ et non par `Screen` : un composant posé dans chaque écran devrait être   │
 * │ ajouté à chacun d'eux, et celui qui l'oublierait ne le saurait jamais.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Il vit dans `features/sync/` et non dans `src/ui/` : `useSynchronisation`
 * tire `@/sync` → `@/db/client`, qui appelle `SQLite.openDatabaseSync` AU
 * CHARGEMENT du module. Dans `src/ui/`, il rendrait `import { Text } from
 * "@/ui"` impossible à charger dans un test pur. Même motif qu'en tête de
 * `bandeau-envoi.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL LIT LA ZONE SÛRE, ET LA RAISON EST NOMMÉE.                           │
 * │                                                                          │
 * │ La règle du dépôt veut un seul propriétaire par bord. Ici on ne POSE     │
 * │ aucune marge : on se POSITIONNE en absolu, hors flux, à l'ordonnée où    │
 * │ commence l'en-tête. Mesuré dans le dépôt, cette ordonnée est la même     │
 * │ partout : `TopBar` pose `paddingTop: insets.top` sur les quinze écrans   │
 * │ d'onglets, et `Screen` fait de même pour tous les autres, POS compris    │
 * │ (`edges` vaut `[]` dans `(tabs)` uniquement). Le filet tombe donc juste  │
 * │ sous la barre d'état, en travers du haut de l'en-tête, sans couvrir      │
 * │ aucune icône : la rangée fait quarante-quatre points et ses glyphes y    │
 * │ sont centrés.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useEffect, useState } from "react";
import { Animated, Easing, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PullProgress } from "@/sync";
import { useMouvementReduit, useTheme } from "@/ui";

const HAUTEUR = 3;
/** Part de la largeur occupée par le segment qui glisse. */
const PART_SEGMENT = 0.35;
const DUREE_MS = 1_100;

/**
 * ⚠ L'état arrive en PROPS et non par `useSynchronisation`.
 *
 * Le fournisseur rend ce filet, donc l'atteindre par le contexte créait un
 * cycle d'imports (`provider` → `barre-progression` → `provider`) que Metro
 * tolère en prévenant qu'il « peut donner des valeurs non initialisées ». Un
 * composant rendu par le fournisseur n'a de toute façon rien à aller chercher
 * dans un contexte dont son parent tient déjà les valeurs.
 *
 * Relevé dans le journal d'un vrai terminal, pas à la relecture.
 */
export function BarreProgressionSync({
  enCours,
  progression,
}: {
  enCours: boolean;
  progression: PullProgress | null;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const reduit = useMouvementReduit();

  // Même motif qu'`Apparition` : une `Animated.Value` est LUE au rendu, et un
  // `ref` lu au rendu est ce que `react-hooks/refs` interdit.
  const [glissement] = useState(() => new Animated.Value(0));

  /**
   * Le filet est INDÉTERMINÉ par défaut, et ce n'est pas un raccourci.
   *
   * `PullProgress.expectedTotal` ne vaut un nombre que si le manifeste a été
   * demandé avec `?counts=1`, ce que `pullAll` ne fait QUE lorsque la sonde
   * `pull/changed/` est indisponible, c'est-à-dire à la toute première
   * synchronisation. En régime courant il n'y a donc aucun pourcentage, et une
   * barre déterminée figée à zéro se lit comme un blocage.
   */
  const attendu = progression?.expectedTotal ?? null;
  const pct =
    attendu && attendu > 0
      ? Math.min(100, Math.round(((progression?.receivedTotal ?? 0) / attendu) * 100))
      : null;

  const indetermine = enCours && pct === null;

  useEffect(() => {
    if (!indetermine || reduit) {
      glissement.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(glissement, {
        toValue: 1,
        duration: DUREE_MS,
        // `linear` et non `ease` : un balayage qui accélère puis ralentit se
        // lit comme une progression réelle, or on ne sait justement pas où
        // l'on en est.
        easing: Easing.linear,
        // Sur le fil natif : le fil JS écrit la base pendant tout le tirage, et
        // un filet qui saccade se lit comme une application qui rame.
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [glissement, indetermine, reduit]);

  if (!enCours) return null;

  const largeurSegment = Math.round(width * PART_SEGMENT);

  return (
    <View
      // Le filet ne doit JAMAIS intercepter un doigt : il passe en travers du
      // hamburger et du témoin de synchronisation.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        top: insets.top,
        left: 0,
        right: 0,
        height: HAUTEUR,
        overflow: "hidden",
        zIndex: 60,
      }}
    >
      {pct !== null ? (
        <View
          style={{ height: HAUTEUR, width: `${pct}%`, backgroundColor: colors.primary }}
        />
      ) : reduit ? (
        // Le repli n'est pas « pas d'animation puis un saut » : c'est le filet
        // DÉJÀ en place. Il dit « quelque chose tourne » sans bouger d'un point.
        <View style={{ height: HAUTEUR, width: "100%", backgroundColor: colors.primary }} />
      ) : (
        <Animated.View
          style={{
            height: HAUTEUR,
            width: largeurSegment,
            backgroundColor: colors.primary,
            transform: [
              {
                translateX: glissement.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-largeurSegment, width],
                }),
              },
            ],
          }}
        />
      )}
    </View>
  );
}
