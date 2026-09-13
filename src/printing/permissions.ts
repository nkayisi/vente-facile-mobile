/**
 * Ce qu'Android exige pour chercher une imprimante et lui parler.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES DÉCLARER NE SUFFIT PAS, ET C'EST LA CAUSE PREMIÈRE.                 │
 * │                                                                          │
 * │ Depuis Android 12, `BLUETOOTH_SCAN` et `BLUETOOTH_CONNECT` sont des      │
 * │ permissions DANGEREUSES : sans octroi à l'exécution,                     │
 * │ `getBondedDevices()` et `connectToDevice()` lèvent `SecurityException`,  │
 * │ et le scan basse consommation rend une erreur.                           │
 * │                                                                          │
 * │ Relevé sur un terminal en service : les quatre permissions déclarées y   │
 * │ étaient à `granted=false`, et rien dans l'application ne les demandait.  │
 * │ Chaque appel avalant son exception, le refus se lisait « Aucune          │
 * │ imprimante trouvée » - c'est-à-dire comme une panne de matériel.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ MODULE PUR, SANS LE MOINDRE IMPORT, pas même `PermissionsAndroid` : ses
 * constantes ne sont que ces chaînes, et les importer lierait ce test à la
 * plateforme que simule `jest-expo`. Le câblage vit dans le pilote.
 */

export type PermissionAndroid =
  | "android.permission.BLUETOOTH_SCAN"
  | "android.permission.BLUETOOTH_CONNECT"
  | "android.permission.ACCESS_FINE_LOCATION";

/** Ce que rend `PermissionsAndroid.requestMultiple` pour chaque permission. */
export type ReponsePermission = "granted" | "denied" | "never_ask_again";

export type EtatPermissions =
  | { etat: "accordees" }
  | { etat: "refusees"; manquantes: PermissionAndroid[] }
  /** Android ne redemandera plus : seuls les Réglages peuvent encore l'accorder. */
  | { etat: "refusees_definitivement"; manquantes: PermissionAndroid[] }
  /** Ni Android, ni rien à demander : iOS, le web, un appareil sans radio. */
  | { etat: "sans_objet" };

/** Android 12. Le modèle de permissions Bluetooth y a changé en entier. */
const API_BLUETOOTH_MODERNE = 31;

/**
 * Les permissions à demander sur cette version d'Android.
 *
 * ⚠ PAS DE LOCALISATION À PARTIR DE 31, et c'est délibéré. Une imprimante ne
 * dérive aucune position : le manifeste déclare `BLUETOOTH_SCAN` avec le
 * drapeau `neverForLocation`, qui dispense précisément d'avoir à la demander.
 * L'ajouter ici ferait apparaître une demande de position pour imprimer un
 * ticket, ce qu'aucun marchand ne devrait avoir à accorder.
 *
 * En dessous de 31, il n'y a pas le choix : Android exigeait la localisation
 * FINE pour toute découverte, classique comme basse consommation.
 */
export function permissionsRequises(niveauApi: number): PermissionAndroid[] {
  if (niveauApi >= API_BLUETOOTH_MODERNE) {
    return ["android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT"];
  }
  return ["android.permission.ACCESS_FINE_LOCATION"];
}

/**
 * Le verdict, à partir de ce que le système a répondu.
 *
 * ⚠ UN SEUL `never_ask_again` L'EMPORTE SUR N'IMPORTE QUEL NOMBRE DE REFUS
 * ORDINAIRES. C'est le seul cas où redemander ne fait littéralement rien : la
 * boîte de dialogue ne s'ouvre plus, l'appel rend immédiatement un refus, et un
 * écran qui proposerait « Autoriser » enverrait le marchand appuyer sur un
 * bouton sans effet. La seule réponse honnête est alors d'ouvrir les Réglages.
 *
 * Une clé absente vaut refus : ne rien répondre n'est pas accorder.
 */
export function verdict(
  requises: PermissionAndroid[],
  resultats: Partial<Record<string, ReponsePermission>>
): EtatPermissions {
  const manquantes = requises.filter((p) => resultats[p] !== "granted");
  if (manquantes.length === 0) return { etat: "accordees" };

  const definitif = manquantes.some((p) => resultats[p] === "never_ask_again");
  return definitif
    ? { etat: "refusees_definitivement", manquantes }
    : { etat: "refusees", manquantes };
}
