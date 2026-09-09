/**
 * Apparition d'un élément de liste : une montée de huit points, un fondu.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE JOUE AU MONTAGE, ET SEULEMENT AU MONTAGE.                          │
 * │                                                                          │
 * │ Les écrans lisent par `useLecture`, qui relit à chaque changement de     │
 * │ base : un tirage, une vente poussée, une opération sortie du journal.    │
 * │ Une animation rejouée à chaque relecture ferait clignoter tout l'écran   │
 * │ pendant une synchronisation, c'est-à-dire précisément quand le caissier  │
 * │ regarde ses chiffres. Elle ne joue donc qu'au MONTAGE, ce qui la rend    │
 * │ fidèle à ce qu'elle raconte : cet élément vient d'arriver.               │
 * │                                                                          │
 * │ C'est l'équivalent de l'`initial={false}` du web, obtenu ici par la      │
 * │ nature de React : une carte gardée par sa clé ne se remonte pas.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Le décalage est PLAFONNÉ.** Trente éléments à quarante millisecondes
 * feraient plus d'une seconde avant que le dernier ne paraisse : au-delà des
 * six premiers, tout entre ensemble. Ce qui est en bas de l'écran n'est de
 * toute façon pas regardé pendant l'entrée.
 *
 * **`prefers-reduced-motion` a son équivalent natif**, et il est respecté :
 * un mouvement peut donner la nausée, et un écran de caisse n'est pas
 * l'endroit où l'imposer. Le repli n'est pas « pas d'animation puis un saut »,
 * c'est l'élément DÉJÀ en place.
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

/** Décalage entre deux éléments, et rang au-delà duquel tout entre ensemble. */
const PAS_MS = 40;
const RANGS_DECALES = 6;

function useMouvementReduit(): boolean {
  const [reduit, setReduit] = useState(false);
  useEffect(() => {
    let vivant = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (vivant) setReduit(v);
      })
      .catch(() => {
        // Un système qui ne sait pas répondre n'est pas une raison de ne rien
        // afficher : on anime, c'est le comportement par défaut.
      });
    const abo = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduit);
    return () => {
      vivant = false;
      abo.remove();
    };
  }, []);
  return reduit;
}

export function Apparition({
  index = 0,
  children,
}: {
  /** Rang dans la liste : il porte le décalage. */
  index?: number;
  children: React.ReactNode;
}) {
  const reduit = useMouvementReduit();
  // `useState` d'initialisation paresseuse plutôt qu'un `useRef` : une
  // `Animated.Value` est LUE au rendu (elle est passée au style), et un `ref`
  // lu au rendu est précisément ce que la règle `react-hooks/refs` interdit.
  // La valeur est créée une fois et ne change jamais d'identité, comme un ref.
  const [progression] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduit) {
      progression.setValue(1);
      return;
    }
    const animation = Animated.timing(progression, {
      toValue: 1,
      duration: 180,
      delay: Math.min(index, RANGS_DECALES) * PAS_MS,
      // `ease-out` : ce qui entre ralentit en arrivant. Un `linear` se lit
      // comme un rendu qui rame plutôt que comme un mouvement voulu.
      easing: Easing.out(Easing.quad),
      // Sur le fil UI : le fil JS est occupé à lire la base au moment exact où
      // l'animation démarre, et une entrée qui saute est pire qu'aucune.
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
    // Le rang ne change pas pour une carte donnée : elle est gardée par sa clé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduit]);

  return (
    <Animated.View
      style={{
        opacity: progression,
        transform: [
          {
            translateY: progression.interpolate({
              inputRange: [0, 1],
              outputRange: [8, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
