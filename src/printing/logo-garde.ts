/**
 * Le logo gardé dans `local_settings`, pour imprimer HORS LIGNE.
 *
 * Module PUR : la décision « ce qui est gardé vaut-il pour ce logo-ci ? » se
 * teste sans base. Voir `assurer-logo.ts` pour la lecture et l'écriture.
 *
 * ⚠ LA CLÉ PORTE LE CHEMIN DU LOGO : le serveur donne un nom NEUF à chaque
 * envoi, si bien qu'un logo changé ne peut jamais ressortir depuis l'ancien.
 */
import type { LoadedLogo } from "@vente-facile/core/receipt";

/** Ce qui est écrit sous `CLE_LOGO_RECU`. */
export interface LogoGarde {
  cle: string;
  logo: LoadedLogo | null;
}

/** La clé d'un logo, ou `null` quand l'établissement n'en a pas. */
export function cleDuLogo(
  organisationId: string | null | undefined,
  chemin: string | null | undefined
): string | null {
  if (!organisationId || !chemin) return null;
  return `${organisationId}|${chemin}`;
}

/**
 * Ce qui est gardé, s'il vaut pour `cle` : un logo, `null` (le serveur a dit
 * « pas de logo »), ou `undefined` (rien d'utilisable, il faut demander).
 */
export function logoGardePour(
  garde: LogoGarde | null | undefined,
  cle: string
): LoadedLogo | null | undefined {
  if (!garde || garde.cle !== cle) return undefined;
  const logo = garde.logo;
  if (logo === null) return null;
  if (!logo?.dataUrl?.startsWith("data:image/") || !(logo.aspectRatio > 0)) return undefined;
  return logo;
}
