/**
 * Le verrou d'orientation : portrait sur un téléphone, libre sur une tablette.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MANIFESTE NE SAIT PAS DIRE « SELON LA TAILLE », DONC LE CODE LE DIT. │
 * │                                                                          │
 * │ `app.config.ts` déclare `orientation: "default"` ; c'est ici qu'un       │
 * │ téléphone est verrouillé en portrait, au premier rendu. On ne fait PAS   │
 * │ l'inverse - démarrer verrouillé et libérer les tablettes - parce qu'un   │
 * │ terminal paysage de naissance (le rk3568) pivoterait à chaque lancement. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ ON JUGE SUR L'ÉCRAN, PAS SUR LA FENÊTRE. En multi-fenêtre, une tablette
 * peut ne donner que 400 points à l'application : ce n'est pas un téléphone
 * pour autant, et la verrouiller en portrait n'aurait aucun sens. Le système
 * ignore d'ailleurs les demandes d'orientation en multi-fenêtre.
 *
 * Hors du baril `@/ui` : le module natif n'a rien à faire dans les tests qui
 * importent le design system.
 */
import { useEffect } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

import { verrouPour } from "./disposition-regles";
import { useMargesSysteme } from "./zone-sure";

export function VerrouOrientation() {
  const { ecran } = useMargesSysteme();
  const verrou = verrouPour(ecran.largeur, ecran.hauteur);

  useEffect(() => {
    const demande =
      verrou === "portrait"
        ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        : ScreenOrientation.unlockAsync();
    // Un verrou refusé (multi-fenêtre, version d'Android qui l'ignore) laisse
    // l'écran tel qu'il est : ce n'est jamais une raison de faire tomber
    // l'application.
    demande.catch(() => {});
  }, [verrou]);

  return null;
}
