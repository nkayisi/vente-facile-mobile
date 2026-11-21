/**
 * La barre latérale repliée en rail, mémorisée sur l'appareil.
 *
 * Elle vit ici et non dans `ui/disposition.tsx`, qui ne doit importer ni la
 * base locale ni le routeur : `src/ui/` est chargé par des tests qui ne montent
 * ni l'un ni l'autre.
 *
 * Lue comme le thème : `lireReglage` avale ses erreurs et rend le défaut, une
 * base pas encore prête ne fait donc rien tomber. Le défaut est « déplié » : un
 * réglage de confort ne doit jamais cacher la navigation à qui ne l'a pas
 * choisi.
 */
import { useCallback, useEffect, useState } from "react";

import { CLE_NAVIGATION_REPLIEE, ecrireReglage, lireReglage } from "@/data/reglages";

export function useRepliMemorise(): { replie: boolean; basculerRepli: () => void } {
  const [replie, setReplie] = useState(false);

  useEffect(() => {
    let annule = false;
    void lireReglage<boolean>(CLE_NAVIGATION_REPLIEE, false).then((v) => {
      if (!annule) setReplie(v === true);
    });
    return () => {
      annule = true;
    };
  }, []);

  const basculerRepli = useCallback(() => {
    setReplie((avant) => {
      const apres = !avant;
      void ecrireReglage(CLE_NAVIGATION_REPLIEE, apres);
      return apres;
    });
  }, []);

  return { replie, basculerRepli };
}
