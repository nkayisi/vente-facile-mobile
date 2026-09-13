/**
 * Le branchement des permissions Android.
 *
 * La DÉCISION vit dans `printing/permissions.ts`, qui n'importe rien et se
 * teste. Ici, les appels au système, et rien d'autre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ OÙ CHAQUE APPEL SE PLACE, ET C'EST UNE RÈGLE DE COMPTOIR.               │
 * │                                                                          │
 * │ `permissionsAccordees()` N'OUVRE AUCUNE BOÎTE DE DIALOGUE. Elle est      │
 * │ appelée par `disponible()`, donc à chaque ticket : une invite système    │
 * │ surgirait au moment de l'encaissement, devant un client, sur un écran    │
 * │ que le caissier n'a pas ouvert pour régler son imprimante.               │
 * │                                                                          │
 * │ `demanderPermissionsBluetooth()` ne s'appelle QUE depuis l'écran         │
 * │ Imprimante, sur un geste explicite.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { PermissionsAndroid, Platform } from "react-native";

import {
  permissionsRequises,
  verdict,
  type EtatPermissions,
  type ReponsePermission,
} from "../../permissions";

/** Le niveau d'API, ou 0 hors Android où la question ne se pose pas. */
function niveauApi(): number {
  return Platform.OS === "android" && typeof Platform.Version === "number"
    ? Platform.Version
    : 0;
}

/**
 * Tout est-il déjà accordé ?
 *
 * Hors Android, il n'y a rien à accorder : iOS demande l'accès Bluetooth à la
 * première utilisation, par le système, et sa réponse se lit dans l'état de
 * l'adaptateur basse consommation.
 */
export async function permissionsAccordees(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    for (const p of permissionsRequises(niveauApi())) {
      if (!(await PermissionsAndroid.check(p))) return false;
    }
    return true;
  } catch {
    // Une vérification qui échoue n'est pas un octroi : dans le doute, on
    // considère que rien n'est accordé et l'écran le proposera.
    return false;
  }
}

/** Demande les permissions. À n'appeler que sur un geste du marchand. */
export async function demanderPermissionsBluetooth(): Promise<EtatPermissions> {
  if (Platform.OS !== "android") return { etat: "sans_objet" };

  const requises = permissionsRequises(niveauApi());
  try {
    const reponses = await PermissionsAndroid.requestMultiple(requises);
    return verdict(requises, reponses as Partial<Record<string, ReponsePermission>>);
  } catch {
    return { etat: "refusees", manquantes: requises };
  }
}
