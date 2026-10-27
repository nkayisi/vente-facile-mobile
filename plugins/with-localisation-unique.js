const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

/**
 * Une seule declaration de localisation dans le manifeste final.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ GOOGLE PLAY REFUSAIT LE BUNDLE, ET LA CAUSE EST DANS LE NOM DES BALISES.  │
 * │                                                                            │
 * │ « Declarations en double de l'element android.permission.ACCESS_FINE_      │
 * │ LOCATION <uses-permission> dans le fichier manifeste avec differentes      │
 * │ versions maxSdkVersions. »                                                 │
 * │                                                                            │
 * │ MESURE, dans le rapport de fusion (`manifest-merger-*-report.txt`) :       │
 * │                                                                            │
 * │   uses-permission-sdk-23#ACCESS_FINE_LOCATION  max=30   <- nous            │
 * │     ajoute par le greffon de `react-native-ble-plx`, fusionne avec la      │
 * │     declaration de meme type de `rxandroidble`                             │
 * │   uses-permission#ACCESS_FINE_LOCATION         max=(aucun)                 │
 * │     ajoute par `react-native-bluetooth-classic`                            │
 * │                                                                            │
 * │ Le fusionneur de manifestes identifie un element par SON NOM DE BALISE et  │
 * │ son `android:name` : `<uses-permission>` et `<uses-permission-sdk-23>`     │
 * │ sont donc deux elements DIFFERENTS, il n'a aucun conflit a resoudre, et    │
 * │ les deux survivent. Play Console, elle, ramene les deux balises a la meme  │
 * │ permission et voit deux plafonds qui se contredisent.                      │
 * │                                                                            │
 * │ ⚠ AUCUN REGLAGE D'`app.config.ts` N'Y CHANGE RIEN, et c'est pourquoi la    │
 * │ note de `CLAUDE.md` le declarait « non traite » : la declaration nue vient │
 * │ du manifeste d'une BIBLIOTHEQUE, et elle survit a la fusion quoi qu'on     │
 * │ ecrive de notre cote. Le seul levier est `tools:node="remove"`.            │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ ON RETIRE LA NUE, ON GARDE LA PLAFONNEE, ET AUCUNE CAPACITE N'EST PERDUE. │
 * │                                                                            │
 * │ `uses-permission-sdk-23` ne demande la permission qu'a partir de l'API 23. │
 * │ MESURE : ce projet vise `minSdkVersion 24`, donc la declaration plafonnee  │
 * │ couvre la plage 24 a 30 EN ENTIER, c'est-a-dire exactement celle ou        │
 * │ `ACCESS_FINE_LOCATION` est requise pour decouvrir une imprimante en        │
 * │ Bluetooth classique. Au-dessus de 30, c'est `BLUETOOTH_SCAN` portant       │
 * │ `neverForLocation` qui l'autorise, et l'application ne demande jamais la   │
 * │ position a l'execution (`src/printing/permissions.ts`).                    │
 * │                                                                            │
 * │ L'ecriture inverse - poser `maxSdkVersion="30"` sur la nue par             │
 * │ `tools:replace` - laisserait DEUX declarations au lieu d'une. Play ne      │
 * │ refuserait plus le bundle, les plafonds concordant, mais le manifeste      │
 * │ garderait un doublon dont plus rien n'expliquerait la raison.              │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ SANS EQUIVALENT PLAFONNE, ON LEVE PLUTOT QUE DE RETIRER.                  │
 * │                                                                            │
 * │ C'est la garde qui porte tout le greffon. Le jour ou                       │
 * │ `react-native-ble-plx` disparaitrait du projet, ou ou son greffon          │
 * │ cesserait de poser ses `uses-permission-sdk-23`, retirer la declaration    │
 * │ nue retirerait `ACCESS_FINE_LOCATION` du binaire ENTIEREMENT : le scan     │
 * │ Bluetooth echouerait sur tout Android anterieur a la version 12, et        │
 * │ l'ecran dirait « Aucune imprimante trouvee » - un defaut de materiel, pour │
 * │ le marchand, et rien dans les journaux.                                    │
 * │                                                                            │
 * │ Un `expo prebuild` qui echoue bruyamment vaut infiniment mieux qu'un       │
 * │ binaire publie dont l'impression ne marche plus sur la moitie du parc.     │
 * └────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Les deux permissions que le greffon de `react-native-ble-plx` plafonne.
 *
 * ⚠ `ACCESS_COARSE_LOCATION` n'est PAS en doublon aujourd'hui : mesure dans le
 * rapport de fusion, aucune bibliotheque ne la declare en `<uses-permission>`
 * nu. Elle est traitee quand meme parce que la cause est STRUCTURELLE et vaut
 * pour les deux - le meme greffon les plafonne toutes deux, et le manifeste
 * source de `react-native-ble-plx` les declare toutes deux en balise nue. Le
 * jour ou une bibliotheque la fait remonter, Play refuserait a nouveau et il
 * faudrait revenir ici. Poser le retrait d'avance ne retire rien tant que
 * personne ne la declare.
 */
const LOCALISATION = [
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
];

/** Nom de la balise plafonnee, celle que le greffon BLE alimente. */
const BALISE_PLAFONNEE = "uses-permission-sdk-23";

/** Nom de la balise nue, celle que les bibliotheques alimentent. */
const BALISE_NUE = "uses-permission";

/**
 * Pose `tools:node="remove"` sur chaque declaration nue de localisation.
 *
 * Exportee a part du greffon pour etre eprouvable sans rendre un projet natif :
 * cette fonction est toute la regle, le greffon n'est que son branchement.
 *
 * @param {import("expo/config-plugins").AndroidConfig.Manifest.AndroidManifest} manifeste
 */
function retirerLocalisationNue(manifeste) {
  AndroidConfig.Manifest.ensureToolsAvailable(manifeste);

  const plafonnees = manifeste.manifest[BALISE_PLAFONNEE] ?? [];
  if (!Array.isArray(manifeste.manifest[BALISE_NUE])) {
    manifeste.manifest[BALISE_NUE] = [];
  }
  const nues = manifeste.manifest[BALISE_NUE];

  for (const nom of LOCALISATION) {
    const estPlafonnee = plafonnees.some(
      (entree) => entree?.$?.["android:name"] === nom,
    );
    if (!estPlafonnee) {
      throw new Error(
        `with-localisation-unique : ${nom} n'est plus declaree en ` +
          `<${BALISE_PLAFONNEE}>, donc la retirer la retirerait du binaire ` +
          `en entier et le Bluetooth classique cesserait de trouver une ` +
          `imprimante sur tout Android anterieur a la version 12.\n` +
          `Verifiez que le greffon "react-native-ble-plx" est toujours ` +
          `declare dans app.config.ts et que ce greffon passe APRES lui ` +
          `dans la liste.`,
      );
    }

    // On MODIFIE une entree existante plutot que d'en ajouter une seconde :
    // deux `<uses-permission>` du meme nom dans notre propre manifeste sont
    // un conflit que le fusionneur, cette fois, refuse pour de bon.
    const existante = nues.find((entree) => entree?.$?.["android:name"] === nom);
    if (existante) {
      existante.$["tools:node"] = "remove";
    } else {
      nues.push({ $: { "android:name": nom, "tools:node": "remove" } });
    }
  }

  return manifeste;
}

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withLocalisationUnique = (config) =>
  withAndroidManifest(config, (config) => {
    config.modResults = retirerLocalisationNue(config.modResults);
    return config;
  });

module.exports = withLocalisationUnique;
module.exports.retirerLocalisationNue = retirerLocalisationNue;
module.exports.LOCALISATION = LOCALISATION;
