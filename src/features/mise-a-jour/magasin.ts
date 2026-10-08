/**
 * Ouvrir la fiche de l'application dans un magasin.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN `canOpenURL`, ET C'EST MESURÉ SUR LE MANIFESTE ENGENDRÉ.           │
 * │                                                                          │
 * │ Depuis Android 11, `canOpenURL` traverse le filtrage de visibilité des   │
 * │ paquets. Le manifeste que ce projet engendre ne déclare qu'un `<queries>`│
 * │ pour `https` : `canOpenURL("market://…")` rend donc FAUX même sur un     │
 * │ terminal qui a le Play Store. Le bouton disparaîtrait sur exactement les │
 * │ appareils capables de mettre à jour.                                     │
 * │                                                                          │
 * │ Déclarer le schéma demanderait un greffon de manifeste, un `prebuild` et │
 * │ un binaire neuf - c'est-à-dire le cycle même qu'on cherche à forcer. On  │
 * │ ESSAIE donc, et on lit le rejet : `openURL` rejette sa promesse quand    │
 * │ aucune activité ne répond. C'est la forme que `data/telephone.ts`        │
 * │ emploie déjà.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Les adresses viennent du SERVEUR et ne se fabriquent jamais ici : un APK de
 * préproduction porte un identifiant natif suffixé, dont la fiche de magasin
 * n'existe pas. Le serveur les rend déjà ordonnées (`market://` d'abord, repli
 * `https` ensuite).
 */
import { Linking } from "react-native";

/**
 * Essaie chaque adresse jusqu'à ce qu'une s'ouvre. Rend `false` si aucune ne
 * répond, pour que l'appelant NOMME l'échec plutôt que de laisser croire à un
 * bouton en panne.
 *
 * ⚠ Sur un appareil sans magasin mais avec un navigateur, l'adresse `https`
 * « réussit » et ouvre une page web inutile. On ne peut pas le savoir d'ici :
 * c'est le message réglable du serveur qui dit alors quoi faire.
 */
export async function ouvrirMagasin(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // On passe à la suivante. Un `market://` refusé est le cas ORDINAIRE d'un
      // terminal de comptoir sans Play Store, pas une anomalie.
    }
  }
  return false;
}
