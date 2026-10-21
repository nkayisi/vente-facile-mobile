/**
 * Prépare le canal de notification Android, une fois, au démarrage.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE N'EST PAS UNE DEMANDE DE PERMISSION, ET C'EST POUR CELA QUE C'EST    │
 * │ ICI PLUTÔT QUE DERRIÈRE UN GESTE.                                       │
 * │                                                                          │
 * │ `preparerCanal` n'ouvre AUCUNE invite : il déclare un canal, et l'appel  │
 * │ est idempotent. La doctrine qui interdit de demander au démarrage ne le  │
 * │ vise donc pas - elle vise `demanderPush`, qui vit dans un `onPress`.     │
 * │                                                                          │
 * │ ⚠ ET SANS LUI, TOUT LE RESTE PEUT MARCHER ET LA NOTIFICATION ÊTRE       │
 * │   MUETTE. Android 8+ exige un canal : à défaut, elle se pose dans le     │
 * │   volet SANS SON ni vibration, sur un terminal posé sur un comptoir que  │
 * │   personne ne regarde. Le nom (`alertes`) est celui que le serveur       │
 * │   envoie dans `channelId` ; les deux ne peuvent pas diverger sans que la │
 * │   livraison redevienne silencieuse.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Séparé de `jeton-push.ts` pour la même raison que `use-logo-etablissement`
 * l'est de `load-logo` : ce module-ci importe React, et les tests du premier
 * sont purs.
 */
import { useEffect } from "react";

import { preparerCanal } from "./jeton-push";

export function useCanalDeNotification(): void {
  useEffect(() => {
    // Un canal qu'on ne sait pas déclarer n'empêche pas de vendre : l'appel
    // est tolérant, comme `setPaperWidth` sur l'imprimante.
    void preparerCanal().catch(() => {});
  }, []);
}
