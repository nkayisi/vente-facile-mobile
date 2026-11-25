/**
 * Que le logo de l'établissement soit prêt à imprimer, si on le peut.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS DÉFAUTS DU CHARGEMENT, ET LE LOGO NE SORTAIT JAMAIS.              │
 * │                                                                          │
 * │ - Un échec était retenu comme « chargé » : plus aucune tentative avant   │
 * │   le prochain lancement, même le réseau revenu.                          │
 * │ - Un chargement en cours était JETÉ au démontage de `(app)` (le          │
 * │   verrouillage du terminal le démonte), puis jamais relancé.             │
 * │ - Rien n'était gardé : un démarrage à froid hors ligne imprimait toute   │
 * │   la journée sans logo.                                                  │
 * │ Le chargement vit désormais ICI, hors de React : il ne se perd plus au   │
 * │ démontage, un échec n'est pas retenu, et le logo est gardé dans          │
 * │ `local_settings` (la purge de déconnexion l'emporte avec l'établissement).│
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { ecrireReglage, lireReglage } from "@/data/reglages";

import { chargerLogo } from "./load-logo";
import { cheminCharge, effacerLogo, poserLogo } from "./logo-courant";
import { cleDuLogo, logoGardePour, type LogoGarde } from "./logo-garde";

export const CLE_LOGO_RECU = "recu.logo";

let enVol: Promise<void> | null = null;
let enVolPour: string | null = null;

/**
 * Pose le logo de `organisationId` / `chemin`, depuis ce qui est gardé ou depuis
 * le serveur. Ne lève jamais : un logo manquant ne doit pas troubler l'appelant.
 */
export function assurerLogo(
  organisationId: string | null | undefined,
  chemin: string | null | undefined
): Promise<void> {
  const cle = cleDuLogo(organisationId, chemin);

  if (!cle) {
    // L'établissement n'a pas (ou plus) de logo : rien à imprimer, rien à garder.
    // ⚠ Un chargement EN COURS ne doit plus rien poser : on l'oublie.
    const logoPose = cheminCharge() !== null;
    const avait = logoPose || enVol !== null;
    enVol = null;
    enVolPour = null;
    if (logoPose) effacerLogo();
    // ⚠ On n'écrit que si quelque chose était là : appelée à chaque
    // synchronisation et à chaque retour au premier plan, une écriture sans
    // objet réveillerait tous les écrans qui lisent `local_settings`. Une
    // entrée gardée pour un AUTRE logo est sans danger (`logoGardePour`
    // compare la clé), et la purge de déconnexion l'emporte.
    if (avait) void ecrireReglage(CLE_LOGO_RECU, null);
    return Promise.resolve();
  }
  if (cheminCharge() === cle) return Promise.resolve();
  if (enVol && enVolPour === cle) return enVol;

  // Un autre logo (un autre établissement) ne doit pas sortir pendant qu'on
  // charge celui-ci : pas de logo vaut mieux qu'un faux.
  effacerLogo();
  enVolPour = cle;
  /**
   * ⚠ Ce chargement est-il toujours celui qu'on attend ? Un établissement
   * changé (ou un logo retiré) pendant l'attente l'a remplacé : poser son
   * résultat ferait sortir le logo de la PRÉCÉDENTE boutique sous le nom de la
   * nouvelle, et l'écrire dans `local_settings` écraserait celui qu'on garde.
   */
  const toujoursAttendu = () => enVolPour === cle;
  enVol = (async () => {
    try {
      const garde = await lireReglage<LogoGarde | null>(CLE_LOGO_RECU, null);
      if (!toujoursAttendu()) return;
      const memorise = logoGardePour(garde, cle);
      if (memorise !== undefined) {
        poserLogo(cle, memorise);
        return;
      }
      const logo = await chargerLogo(organisationId as string);
      if (!toujoursAttendu()) return;
      poserLogo(cle, logo);
      await ecrireReglage(CLE_LOGO_RECU, { cle, logo } satisfies LogoGarde);
    } catch {
      // Hors ligne, ou serveur indisponible : on ne retient RIEN, le prochain
      // réveil (synchronisation, retour au premier plan) réessaiera.
    } finally {
      if (enVolPour === cle) {
        enVol = null;
        enVolPour = null;
      }
    }
  })();
  return enVol;
}
