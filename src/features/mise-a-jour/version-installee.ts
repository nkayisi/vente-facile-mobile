/**
 * La version du binaire réellement installé.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL LECTEUR DANS TOUT `src/`, ET C'EST TENU PAR UN GARDE-FOU.        │
 * │                                                                          │
 * │ Deux lecteurs, c'est deux réponses possibles, et celui qu'on oublierait  │
 * │ perdrait la règle qui compte : « illisible ⇒ on n'exige rien ». Un       │
 * │ terminal ne doit jamais se bloquer sur un défaut d'instrument.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ **`nativeApplicationVersion`, PAS `nativeBuildVersion`.** Le numéro de
 * compilation vit sur les serveurs EAS, diverge entre Android et iOS, et n'est
 * auto-incrémenté que sur le profil `production` : deux APK de préproduction
 * peuvent porter le même, et ce sont eux qu'on pose à la main sur les terminaux
 * de comptoir. La version applicative, elle, est celle qu'on lit dans
 * `app.config.ts` et celle que le magasin affiche.
 */
import * as Application from "expo-application";

export function versionInstallee(): string | null {
  return Application.nativeApplicationVersion ?? null;
}
