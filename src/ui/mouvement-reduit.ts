/**
 * La préférence système « réduire les animations », en une seule source.
 *
 * Elle vivait en privé dans `apparition.tsx`. Deux composants qui animent
 * doivent la lire au MÊME endroit : deux abonnements séparés, c'est deux
 * comportements qui finissent par diverger, et cette préférence est posée par
 * des gens que le mouvement gêne réellement.
 *
 * Le repli n'est jamais « pas d'animation puis un saut » : c'est l'élément
 * DÉJÀ en place. Chaque appelant en tire sa propre conséquence.
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useMouvementReduit(): boolean {
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
