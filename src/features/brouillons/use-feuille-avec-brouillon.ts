/**
 * L'ouverture d'une feuille qui peut se rouvrir sur son brouillon.
 *
 * Au RETOUR sur l'écran (la création d'article refermée), la feuille se
 * rouvre d'elle-même avec ce qu'elle portait. Une ouverture par le bouton de
 * l'écran oublie tout brouillon et repart vierge.
 */
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { oublierBrouillon, reprendreBrouillon } from "./brouillon-feuille";

export function useFeuilleAvecBrouillon<T>(cle: string): {
  ouverte: boolean;
  brouillon: T | null;
  ouvrir: () => void;
  fermer: () => void;
} {
  const [ouverte, setOuverte] = useState(false);
  const [brouillon, setBrouillon] = useState<T | null>(null);

  useFocusEffect(
    useCallback(() => {
      const repris = reprendreBrouillon<T>(cle);
      if (repris) {
        setBrouillon(repris);
        setOuverte(true);
      }
    }, [cle])
  );

  const ouvrir = useCallback(() => {
    oublierBrouillon(cle);
    setBrouillon(null);
    setOuverte(true);
  }, [cle]);

  const fermer = useCallback(() => setOuverte(false), []);

  return { ouverte, brouillon, ouvrir, fermer };
}
