const fs = require("fs");
const path = require("path");
const {
  withAppBuildGradle,
  withGradleProperties,
} = require("expo/config-plugins");

/**
 * Signature de release pour le Gradle LOCAL, depuis `credentials.json`.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ SANS CE GREFFON, UN `assembleRelease` LOCAL SIGNE DE LA CLE DE DEBUG.     │
 * │                                                                            │
 * │ MESURE dans le `android/app/build.gradle` engendre par `expo prebuild` :   │
 * │                                                                            │
 * │   release {                                                                │
 * │       // Caution! In production, you need to generate your own keystore... │
 * │       signingConfig signingConfigs.debug                                   │
 * │                                                                            │
 * │ Le gabarit de React Native le dit lui-meme, et personne ne l'avait fait.   │
 * │ L'APK sort donc signe de `debug.keystore`, dont le mot de passe est        │
 * │ « android » et que tout le monde possede. Il s'installe, il a l'air bon,   │
 * │ et il ne pourra JAMAIS etre mis a jour par un binaire signe de la vraie    │
 * │ cle - Android refuse tout changement de signature - ni publie.             │
 * │                                                                            │
 * │ ⚠ `android/` N'EST PAS VERSIONNE et se regenere a chaque                   │
 * │ `expo prebuild --clean` : une `signingConfig` posee a la main y serait     │
 * │ perdue au prochain passage, sans que rien ne le signale. C'est pourquoi la │
 * │ configuration de signature doit etre un GREFFON et pas une edition.        │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ `credentials.json` ABSENT ⇒ GREFFON INERTE. C'EST LA GARDE QUI PORTE TOUT.│
 * │                                                                            │
 * │ Sur les serveurs d'EAS, `credentials.json` N'EXISTE PAS : il est           │
 * │ gitignore, donc absent de l'archive envoyee, et c'est deliberement - le    │
 * │ CLI le lit sur la machine du developpeur et envoie le keystore separement, │
 * │ dans les identifiants du job (`readAndroidCredentialsAsync`). C'est EAS    │
 * │ qui ecrit alors sa propre configuration de signature.                      │
 * │                                                                            │
 * │ Un greffon qui poserait une `signingConfig` la-bas entrerait en conflit    │
 * │ avec la sienne, ou pire : il poserait une signature dont les proprietes    │
 * │ Gradle n'existent pas, et le build echouerait a la configuration. Rendre   │
 * │ la main quand le fichier est absent n'est donc pas une tolerance, c'est la │
 * │ condition pour que le meme arbre serve les deux chemins.                   │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ LE SECRET VA DANS `gradle.properties`, PAS DANS `build.gradle`.           │
 * │                                                                            │
 * │ Les deux fichiers sont engendres et gitignores (`/android`), donc ni l'un  │
 * │ ni l'autre n'entre dans un depot. Mais `build.gradle` se lit, se colle     │
 * │ dans un rapport de bug et s'envoie pour demander de l'aide : on n'y met    │
 * │ pas un mot de passe. `gradle.properties` est l'endroit que l'outillage     │
 * │ Android reserve a cela depuis toujours, et il se lit comme tel.            │
 * │                                                                            │
 * │ ⚠ LE CHEMIN DU KEYSTORE EST ABSOLU, et il le faut : `file()` dans          │
 * │ `app/build.gradle` resout relativement a `android/app/`, pas au projet.    │
 * │ Un chemin absolu dans un dossier regenere a chaque prebuild ne nuit pas a  │
 * │ la portabilite - il est recalcule sur chaque machine, par ce greffon.      │
 * └────────────────────────────────────────────────────────────────────────────┘
 */

/** Les proprietes Gradle que ce greffon pose, et que lui seul ecrit. */
const PROPRIETES = {
  fichier: "VF_RELEASE_STORE_FILE",
  motDePasseMagasin: "VF_RELEASE_STORE_PASSWORD",
  alias: "VF_RELEASE_KEY_ALIAS",
  motDePasseCle: "VF_RELEASE_KEY_PASSWORD",
};

/**
 * Lit `credentials.json`, ou rend `null` quand il n'y en a pas.
 *
 * ⚠ Un fichier PRESENT mais incomplet LEVE, la ou un fichier absent rend la
 * main : les deux situations n'ont rien a voir. L'absence est le chemin normal
 * d'EAS ; un fichier a moitie rempli est une erreur de configuration, et la
 * taire ferait sortir un binaire signe de la cle de debug.
 *
 * @param {string} racine Dossier du projet (celui qui porte `app.config.ts`).
 */
function lireIdentifiants(racine) {
  const chemin = path.join(racine, "credentials.json");
  if (!fs.existsSync(chemin)) {
    return null;
  }

  let brut;
  try {
    brut = JSON.parse(fs.readFileSync(chemin, "utf8"));
  } catch (cause) {
    throw new Error(
      `with-signature-release : credentials.json est present mais illisible ` +
        `(${cause.message}). Un fichier a moitie ecrit ferait signer la ` +
        `release de la cle de debug : on refuse plutot que de continuer.`,
    );
  }

  const magasin = brut?.android?.keystore;
  if (!magasin) {
    throw new Error(
      "with-signature-release : credentials.json ne porte pas " +
        "android.keystore. Attendu : { android: { keystore: { keystorePath, " +
        "keystorePassword, keyAlias, keyPassword } } }.",
    );
  }

  const manquants = [
    "keystorePath",
    "keystorePassword",
    "keyAlias",
    "keyPassword",
  ].filter((clef) => !magasin[clef]);
  if (manquants.length > 0) {
    throw new Error(
      `with-signature-release : credentials.json est incomplet, il manque ` +
        `${manquants.join(", ")}.`,
    );
  }

  // Le chemin est resolu depuis la RACINE DU PROJET, comme le fait le CLI
  // d'EAS (`getAbsolutePath(projectDir, keystorePath)`) : les deux chemins
  // doivent designer le meme fichier, sinon une machine signerait d'une cle et
  // le serveur d'une autre.
  const fichier = path.resolve(racine, magasin.keystorePath);
  if (!fs.existsSync(fichier)) {
    throw new Error(
      `with-signature-release : le keystore declare est introuvable.\n` +
        `  credentials.json dit : ${magasin.keystorePath}\n` +
        `  resolu en            : ${fichier}`,
    );
  }

  return {
    fichier,
    motDePasseMagasin: magasin.keystorePassword,
    alias: magasin.keyAlias,
    motDePasseCle: magasin.keyPassword,
  };
}

/**
 * Pose `signingConfigs.release` et y branche `buildTypes.release`.
 *
 * Exportee a part du greffon pour etre eprouvable sans rendre un projet natif :
 * cette fonction est toute la regle, le greffon n'est que son branchement.
 *
 * @param {string} gradle Contenu de `android/app/build.gradle`.
 */
function brancherSignature(gradle) {
  // Idempotent : un `expo prebuild` sans `--clean` repasse sur un fichier deja
  // traite, et poser la configuration deux fois ferait echouer Gradle.
  if (gradle.includes("signingConfigs.release")) {
    return gradle;
  }

  const bloc =
    `        release {\n` +
    `            // Pose par plugins/with-signature-release.js, depuis\n` +
    `            // credentials.json. Ne pas editer a la main : android/ est\n` +
    `            // regenere a chaque expo prebuild.\n` +
    `            storeFile file(project.property('${PROPRIETES.fichier}'))\n` +
    `            storePassword project.property('${PROPRIETES.motDePasseMagasin}')\n` +
    `            keyAlias project.property('${PROPRIETES.alias}')\n` +
    `            keyPassword project.property('${PROPRIETES.motDePasseCle}')\n` +
    `        }\n`;

  // 1. Declarer la configuration, juste apres l'ouverture de `signingConfigs`.
  const ouverture = /( {4}signingConfigs \{\n)/;
  if (!ouverture.test(gradle)) {
    throw new Error(
      "with-signature-release : bloc `signingConfigs {` introuvable dans " +
        "android/app/build.gradle. Le gabarit d'Expo a change : relire ce " +
        "greffon plutot que de livrer une release signee de la cle de debug.",
    );
  }
  let sortie = gradle.replace(ouverture, `$1${bloc}`);

  // 2. L'employer dans le type de construction `release`.
  //
  // ⚠ ON CIBLE L'OCCURRENCE DANS LE BLOC `release`, et pas la premiere du
  // fichier : `debug { signingConfig signingConfigs.debug }` la precede et
  // doit rester intacte. D'ou la capture du `release {` qui l'introduit.
  const emploi = /(release \{(?:[^{}]*?))signingConfig signingConfigs\.debug/;
  if (!emploi.test(sortie)) {
    throw new Error(
      "with-signature-release : `signingConfig signingConfigs.debug` " +
        "introuvable dans le bloc `release` d'android/app/build.gradle. On " +
        "refuse plutot que de laisser la release signee d'une cle inconnue.",
    );
  }
  sortie = sortie.replace(emploi, "$1signingConfig signingConfigs.release");

  return sortie;
}

/**
 * @type {import("expo/config-plugins").ConfigPlugin}
 *
 * ⚠ LA RACINE VIENT DE `modRequest.projectRoot`, PAS DE `_internal`.
 *
 * C'est le seul chemin que les mods d'Expo garantissent. Le lire en dehors
 * d'un mod obligerait a retomber sur le dossier courant, qui n'est la racine
 * du projet que lorsque la commande y a ete lancee - vrai pour un
 * `expo prebuild` a la main, faux des qu'un outil l'appelle d'ailleurs. Les
 * deux mods decident donc chacun, au moment ou ils tournent, et rendent la
 * main quand il n'y a pas d'identifiants : la garde « inerte sur EAS » est
 * ainsi posee la ou l'information est sure.
 */
const withSignatureRelease = (config) => {
  let sortie = withGradleProperties(config, (config) => {
    const identifiants = lireIdentifiants(config.modRequest.projectRoot);
    if (!identifiants) {
      return config;
    }
    for (const [clef, propriete] of Object.entries(PROPRIETES)) {
      config.modResults = config.modResults.filter(
        (ligne) => !(ligne.type === "property" && ligne.key === propriete),
      );
      config.modResults.push({
        type: "property",
        key: propriete,
        value: String(identifiants[clef]),
      });
    }
    return config;
  });

  sortie = withAppBuildGradle(sortie, (config) => {
    if (!lireIdentifiants(config.modRequest.projectRoot)) {
      return config;
    }
    config.modResults.contents = brancherSignature(config.modResults.contents);
    return config;
  });

  return sortie;
};

module.exports = withSignatureRelease;
module.exports.lireIdentifiants = lireIdentifiants;
module.exports.brancherSignature = brancherSignature;
module.exports.PROPRIETES = PROPRIETES;
