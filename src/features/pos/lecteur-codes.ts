/**
 * Le module natif des lecteurs de codes intégrés (`modules/lecteur-codes`),
 * Android seulement.
 *
 * Le seul fichier qui le charge. Absent (iOS, binaire antérieur), le comptoir
 * garde ce qu'il avait : la caméra, et « Entrée » dans la recherche.
 */
import { Platform } from "react-native";

import { diffusionsPourLeModule } from "./diffusions";

interface Abonnement {
  remove(): void;
}

interface ModuleLecteur {
  activer(options: { champRecherche: string; diffusions: { action: string; cle: string }[] }): void;
  desactiver(): void;
  addListener(nom: "onTouche", f: (e: { touche: string; instant: number }) => void): Abonnement;
  addListener(nom: "onCodeDiffuse", f: (e: { code: string }) => void): Abonnement;
}

/**
 * Le `nativeID` du champ de recherche du comptoir : le seul champ dont le
 * module prend les touches. Tout autre champ garde les siennes, comme sur le
 * web, où la douchette est ignorée dans tout champ qui n'est pas la recherche.
 */
export const CHAMP_RECHERCHE_COMPTOIR = "pos-recherche";

/** `undefined` : jamais cherché. `null` : cherché, absent. */
let module: ModuleLecteur | null | undefined;

export function lecteurCodes(): ModuleLecteur | null {
  if (module !== undefined) return module;
  if (Platform.OS !== "android") {
    module = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expo = require("expo") as {
      requireOptionalNativeModule<T>(name: string): T | null;
    };
    module = expo.requireOptionalNativeModule<ModuleLecteur>("LecteurCodes");
  } catch {
    module = null;
  }
  return module;
}

/**
 * Qui tient la capture. Deux écrans peuvent se passer la main dans le
 * désordre (le comptoir perd le focus pendant que l'écran du scan le prend) :
 * seul celui qui l'a prise en DERNIER peut la rendre.
 */
let proprietaire: symbol | null = null;

export function prendreCapture(): symbol | null {
  const natif = lecteurCodes();
  if (!natif) return null;
  const jeton = Symbol("capture");
  proprietaire = jeton;
  natif.activer({
    champRecherche: CHAMP_RECHERCHE_COMPTOIR,
    diffusions: diffusionsPourLeModule(),
  });
  return jeton;
}

export function rendreCapture(jeton: symbol | null) {
  if (!jeton || proprietaire !== jeton) return;
  proprietaire = null;
  lecteurCodes()?.desactiver();
}
