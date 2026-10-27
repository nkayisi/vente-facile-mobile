#!/usr/bin/env node
/**
 * Refuse un manifeste Android que Google Play refuserait.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI A MORDU, C'EST PLAY CONSOLE, APRES VINGT MINUTES DE COMPILATION.   │
 * │                                                                            │
 * │ « Declarations en double de l'element android.permission.ACCESS_FINE_      │
 * │ LOCATION <uses-permission> dans le fichier manifeste avec differentes      │
 * │ versions maxSdkVersions. »                                                 │
 * │                                                                            │
 * │ La cause est dans le NOM DES BALISES : le fusionneur de manifestes         │
 * │ identifie un element par sa balise ET son `android:name`, donc             │
 * │ `<uses-permission>` et `<uses-permission-sdk-23>` sont deux elements       │
 * │ DISTINCTS et il n'a aucun conflit a trancher. Play, elle, ramene les deux  │
 * │ a la meme permission. Rien dans Gradle ne le signale : la compilation      │
 * │ reussit, le bundle se signe, et le refus arrive a l'envoi.                 │
 * │                                                                            │
 * │ Ce script applique la regle de Play localement. Voir                       │
 * │ `plugins/with-localisation-unique.js` pour le correctif qu'il garde.       │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ DEUX CONTROLES, ET CHACUN ATTRAPE UNE REGRESSION DIFFERENTE.              │
 * │                                                                            │
 * │ 1. LE GREFFON A TOURNE. Chaque permission que le greffon declare traiter   │
 * │    doit porter son `tools:node="remove"` dans le manifeste SOURCE          │
 * │    engendre. Mord sans aucune compilation Gradle, et attrape le cas le     │
 * │    plus probable : le greffon retire d'`app.config.ts`, ou glisse dans la  │
 * │    liste au point de ne plus passer apres celui de `react-native-ble-plx`. │
 * │                                                                            │
 * │ 2. LA REGLE DE PLAY. Aucune permission du manifeste FUSIONNE ne porte      │
 * │    deux `maxSdkVersion` qui se contredisent. Exige qu'une compilation ait  │
 * │    eu lieu, et attrape ce que le premier ne peut pas voir : une            │
 * │    bibliotheque ajoutee demain qui ferait remonter le meme defaut sur une  │
 * │    autre permission.                                                       │
 * │                                                                            │
 * │ ⚠ LE CONTROLE 2 VISE `packaged_manifests`, L'ETAPE FINALE, ET PAS UNE      │
 * │ AUTRE. Expo fait tourner une tache `expo<Variante>OverrideMaxSdkConflicts` │
 * │ qui retire le plafond de certaines permissions en conflit - MESURE sur ce  │
 * │ projet : `BLUETOOTH` et `BLUETOOTH_ADMIN`. Un controle pose sur            │
 * │ `merged_manifest`, c'est-a-dire AVANT elle, crierait donc sur des          │
 * │ conflits que la suite de la chaine resout, et un garde-fou qui crie sur du │
 * │ legitime finit desactive.                                                  │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ UN DOSSIER `android/` ABSENT N'EST PAS UNE ERREUR, ET NE SE TAIT PAS.     │
 * │                                                                            │
 * │ `android/` n'est pas versionne : il se regenere par `expo prebuild`, et    │
 * │ sur EAS c'est le serveur qui le fabrique. Sur une machine fraiche il n'y a │
 * │ donc rien a controler, et refuser bloquerait une compilation parfaitement  │
 * │ saine. Le script NOMME alors ce qu'il n'a pas pu voir et la commande qui   │
 * │ le lui donnerait, plutot que de passer en silence.                         │
 * └────────────────────────────────────────────────────────────────────────────┘
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const racine = path.resolve(import.meta.dirname, "..");
const require_ = createRequire(import.meta.url);

/**
 * La liste vient DU GREFFON, elle n'est jamais recopiee : deux listes finissent
 * par diverger, et la divergence se verrait a l'envoi d'un bundle.
 */
const { LOCALISATION, retirerLocalisationNue } = require_(
  "../plugins/with-localisation-unique.js",
);

const ANDROID = "android:";
const MAX = `${ANDROID}maxSdkVersion`;

/** Toutes les balises de permission, une entree par declaration. */
function lirePermissions(xml) {
  const entrees = [];
  const motif = /<(uses-permission(?:-sdk-23)?)\b([^>]*?)\/?>/g;
  for (const [, balise, attributs] of xml.matchAll(motif)) {
    const nom = /android:name="([^"]+)"/.exec(attributs)?.[1];
    if (!nom) continue;
    entrees.push({
      balise,
      nom,
      max: new RegExp(`${MAX}="([^"]+)"`).exec(attributs)?.[1] ?? null,
      retire: /tools:node="remove"/.test(attributs),
    });
  }
  return entrees;
}

/** Le manifeste de l'etape FINALE de fusion, celui qui part dans l'AAB. */
function manifestesFusionnes() {
  const base = path.join(racine, "android/app/build/intermediates/packaged_manifests");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .flatMap((variante) => {
      const dossier = path.join(base, variante);
      return readdirSync(dossier).map((tache) =>
        path.join(dossier, tache, "AndroidManifest.xml"),
      );
    })
    .filter((f) => existsSync(f));
}

const echecs = [];
const notes = [];

// --- Controle 0 : la garde du greffon mord --------------------------------
//
// ┌────────────────────────────────────────────────────────────────────────────┐
// │ LA PIECE LA PLUS CRITIQUE DU GREFFON EST CELLE QUI REFUSE DE TRAVAILLER.  │
// │                                                                            │
// │ Si la declaration plafonnee disparaissait - `react-native-ble-plx` retire  │
// │ du projet, ou son greffon cessant de la poser - alors retirer la           │
// │ declaration nue retirerait `ACCESS_FINE_LOCATION` du binaire EN ENTIER, et │
// │ le Bluetooth classique cesserait de trouver une imprimante sur tout        │
// │ Android anterieur a la version 12. Le marchand lirait « Aucune imprimante  │
// │ trouvee » et conclurait a une panne de materiel.                           │
// │                                                                            │
// │ Jest ne peut pas figer cette garde : son `testMatch` est borne a `src/`,   │
// │ donc un test pose dans `plugins/` ne serait JAMAIS ramasse et passerait au │
// │ vert sans rien prouver. On l'eprouve donc ici, dans les deux sens - elle   │
// │ doit lever sans la plafonnee, et poser le retrait avec.                    │
// └────────────────────────────────────────────────────────────────────────────┘
const SANS_PLAFONNEE = { manifest: { $: { "xmlns:android": "x" } } };
let aLeve = false;
try {
  retirerLocalisationNue(structuredClone(SANS_PLAFONNEE));
} catch {
  aLeve = true;
}
if (!aLeve) {
  echecs.push(
    "La garde du greffon ne leve plus quand la declaration plafonnee est absente.\n" +
      "  En l'etat, un `prebuild` retirerait ACCESS_FINE_LOCATION du binaire en entier\n" +
      "  et l'impression Bluetooth cesserait sur tout Android anterieur a la version 12.\n" +
      "  Voir plugins/with-localisation-unique.js",
  );
}

const avecPlafonnee = {
  manifest: {
    $: { "xmlns:android": "x" },
    "uses-permission-sdk-23": LOCALISATION.map((nom) => ({
      $: { "android:name": nom, "android:maxSdkVersion": "30" },
    })),
  },
};
retirerLocalisationNue(avecPlafonnee);
const posees = (avecPlafonnee.manifest["uses-permission"] ?? []).filter(
  (e) => e.$?.["tools:node"] === "remove",
);
if (posees.length !== LOCALISATION.length) {
  echecs.push(
    `La regle du greffon ne pose plus ses ${LOCALISATION.length} retrait(s) : ` +
      `${posees.length} trouve(s).\n  Voir plugins/with-localisation-unique.js`,
  );
}

// --- Controle 1 : le greffon a tourne -------------------------------------
const source = path.join(racine, "android/app/src/main/AndroidManifest.xml");
if (!existsSync(source)) {
  notes.push(
    "Aucun manifeste source : `android/` n'a pas ete engendre sur cette machine.\n" +
      "  Pour obtenir le controle : npx expo prebuild --platform android",
  );
} else {
  const entrees = lirePermissions(readFileSync(source, "utf8"));
  if (entrees.length < 10) {
    echecs.push(
      `Le manifeste source ne porte que ${entrees.length} permission(s) : le balayage ` +
        "ne balaie rien, donc il ne prouve rien. Verifiez " +
        path.relative(racine, source),
    );
  }
  for (const nom of LOCALISATION) {
    const retiree = entrees.some(
      (e) => e.nom === nom && e.balise === "uses-permission" && e.retire,
    );
    if (!retiree) {
      echecs.push(
        `${nom} n'est pas retiree en <uses-permission tools:node="remove"> dans le\n` +
          "  manifeste source. Le greffon `with-localisation-unique` n'a pas tourne, ou il\n" +
          "  passe AVANT celui de `react-native-ble-plx`. Google Play refusera le bundle.",
      );
    }
  }
}

// --- Controle 2 : la regle de Play ----------------------------------------
const fusionnes = manifestesFusionnes();
if (fusionnes.length === 0) {
  notes.push(
    "Aucun manifeste fusionne : la regle de Play n'a pas pu etre eprouvee.\n" +
      "  Pour obtenir le controle : cd android && ./gradlew :app:processReleaseManifestForPackage",
  );
}
for (const fichier of fusionnes) {
  const parNom = new Map();
  for (const e of lirePermissions(readFileSync(fichier, "utf8"))) {
    if (!parNom.has(e.nom)) parNom.set(e.nom, []);
    parNom.get(e.nom).push(e);
  }
  for (const [nom, declarations] of parNom) {
    const plafonds = new Set(declarations.map((d) => d.max));
    if (plafonds.size > 1) {
      const detail = declarations
        .map((d) => `<${d.balise}> max=${d.max ?? "(aucun)"}`)
        .join(", ");
      echecs.push(
        `${nom} porte des maxSdkVersion contradictoires dans\n` +
          `  ${path.relative(racine, fichier)}\n` +
          `  ${detail}\n` +
          "  Google Play refuse ce bundle. Retirez la declaration non voulue par\n" +
          '  `tools:node="remove"` depuis un greffon, jamais a la main : `android/` se\n' +
          "  regenere a chaque prebuild.",
      );
    }
  }
}

// --- Controle 3 : toute permission a invite a un chemin de demande --------
//
// ┌────────────────────────────────────────────────────────────────────────────┐
// │ UNE PERMISSION DECLAREE ET JAMAIS DEMANDEE EST UNE FONCTION MORTE.        │
// │                                                                            │
// │ Depuis Android 6, une permission DANGEREUSE declaree au manifeste n'est    │
// │ PAS accordee a l'installation : sans invite a l'execution, l'appel qui en  │
// │ depend leve `SecurityException` ou rend vide. Le dépôt l'a déjà paye deux  │
// │ fois - les quatre permissions Bluetooth etaient a `granted=false` sur un   │
// │ terminal en service et rien ne les demandait, et le canal pousse est reste │
// │ inerte parce que `demanderPush` n'avait aucun appelant. Dans les deux cas  │
// │ le marchand lisait une panne de materiel.                                  │
// │                                                                            │
// │ Dans l'autre sens, une permission declaree SANS usage est un cout a        │
// │ l'envoi : elle s'affiche sur la fiche du magasin, et Google Play comme     │
// │ Apple demandent une justification pour le microphone, la position ou la    │
// │ surimpression. `RECORD_AUDIO` et `SYSTEM_ALERT_WINDOW` etaient dans ce     │
// │ cas, posees par le gabarit d'Expo et par le defaut d'`expo-camera`.        │
// │                                                                            │
// │ Toute permission a invite doit donc etre INSCRITE ici, et l'alternative    │
// │ est nommee : soit un symbole du code la demande, soit un motif dit         │
// │ pourquoi elle n'a pas a l'etre. C'est le motif de la sentinelle `DENY` du  │
// │ serveur : une fermeture voulue se distingue d'un oubli.                     │
// └────────────────────────────────────────────────────────────────────────────┘

/**
 * Les permissions qu'Android n'accorde pas a l'installation.
 *
 * ⚠ CETTE LISTE EST VOLONTAIREMENT LARGE : elle contient des permissions que ce
 * projet n'a jamais declarees. C'est son objet - le jour ou une bibliotheque
 * ajoutee ferait remonter `READ_CONTACTS` ou `ACCESS_BACKGROUND_LOCATION`, le
 * controle 3 le dirait au lieu de laisser la decouverte a Play.
 */
const A_INVITE = new Set([
  "CAMERA", "RECORD_AUDIO", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION",
  "ACCESS_BACKGROUND_LOCATION", "BLUETOOTH_SCAN", "BLUETOOTH_CONNECT",
  "BLUETOOTH_ADVERTISE", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE",
  "POST_NOTIFICATIONS", "READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO",
  "READ_MEDIA_AUDIO", "READ_MEDIA_VISUAL_USER_SELECTED", "READ_CONTACTS",
  "WRITE_CONTACTS", "READ_PHONE_STATE", "CALL_PHONE", "READ_CALL_LOG",
  "READ_CALENDAR", "WRITE_CALENDAR", "BODY_SENSORS", "ACTIVITY_RECOGNITION",
  "NEARBY_WIFI_DEVICES", "SEND_SMS", "READ_SMS",
  // Speciales : un reglage systeme, et Play les scrute de plus pres encore.
  "SYSTEM_ALERT_WINDOW", "MANAGE_EXTERNAL_STORAGE", "REQUEST_INSTALL_PACKAGES",
  "SCHEDULE_EXACT_ALARM", "USE_EXACT_ALARM", "PACKAGE_USAGE_STATS",
]);

/**
 * Pour chaque permission a invite que ce projet declare : QUI la demande.
 *
 * La valeur est soit un SYMBOLE que le controle cherche dans `src/` - ainsi la
 * table ne peut pas mentir, elle echoue si le demandeur disparait - soit un
 * motif ecrit disant pourquoi il n'y a rien a demander.
 */
const DEMANDEE_PAR = {
  // L'appareil photo sert au scan de codes-barres et a la photo d'un article.
  CAMERA: { symbole: "useCameraPermissions" },

  // Bluetooth, Android 12 et au-dela.
  BLUETOOTH_SCAN: { symbole: "demanderPermissionsBluetooth" },
  BLUETOOTH_CONNECT: { symbole: "demanderPermissionsBluetooth" },

  // Bluetooth, en dessous d'Android 12 : la decouverte y exigeait la position.
  // `permissionsRequises` ne la rend QUE sous l'API 31, et le manifeste la
  // plafonne a 30 : les deux bornes se correspondent exactement.
  ACCESS_FINE_LOCATION: { symbole: "permissionsRequises" },
  ACCESS_COARSE_LOCATION: {
    motif:
      "Declaree par le greffon de react-native-ble-plx et plafonnee a l'API 30. " +
      "Avant Android 12, FINE et COARSE sont dans le MEME groupe de permissions : " +
      "accorder FINE accorde le groupe, donc il n'y a rien de plus a demander.",
  },

  // La photothèque, pour illustrer un article.
  READ_EXTERNAL_STORAGE: { symbole: "requestMediaLibraryPermissionsAsync" },
  WRITE_EXTERNAL_STORAGE: {
    motif:
      "Posee par le gabarit d'Expo et par expo-file-system, plafonnee a l'API 32. " +
      "L'application n'ecrit que dans son propre stockage (Paths.document), ce qui " +
      "n'exige aucune permission : il n'y a donc rien a demander. Laissee en place " +
      "plutot que bloquee, le retrait d'une permission qu'expo-file-system declare " +
      "lui-meme risquant de casser la lecture sur un Android ancien.",
  },

  // Les alertes de stock et les demandes d'approbation.
  POST_NOTIFICATIONS: { symbole: "demanderPush" },
};

if (fusionnes.length > 0) {
  const sourcesSrc = [];
  const empiler = (dossier) => {
    for (const entree of readdirSync(dossier)) {
      const chemin = path.join(dossier, entree);
      if (statSync(chemin).isDirectory()) empiler(chemin);
      else if (/\.(ts|tsx)$/.test(entree) && !entree.includes(".test."))
        sourcesSrc.push(readFileSync(chemin, "utf8"));
    }
  };
  const src = path.join(racine, "src");
  if (existsSync(src)) empiler(src);
  if (sourcesSrc.length < 100) {
    echecs.push(
      `Le balayage de src/ n'a lu que ${sourcesSrc.length} fichier(s) : il ne prouve rien.`,
    );
  }
  const code = sourcesSrc.join("\n");

  const declarees = new Set();
  for (const fichier of fusionnes) {
    for (const e of lirePermissions(readFileSync(fichier, "utf8"))) {
      const court = e.nom.split(".").pop();
      if (A_INVITE.has(court)) declarees.add(court);
    }
  }

  for (const court of [...declarees].sort()) {
    const entree = DEMANDEE_PAR[court];
    if (!entree) {
      echecs.push(
        `android.permission.${court} exige une invite a l'execution et n'est inscrite\n` +
          "  nulle part. Sans demande, la fonction qui en depend echouera en silence ; et\n" +
          "  si rien ne s'en sert, elle s'affiche pour rien sur la fiche du magasin.\n" +
          "  Trois issues : la demander depuis un geste, la bloquer par\n" +
          "  `android.blockedPermissions`, ou l'inscrire avec son motif dans\n" +
          "  scripts/verifier-manifeste-android.mjs (DEMANDEE_PAR).",
      );
      continue;
    }
    if (entree.symbole && !code.includes(entree.symbole)) {
      echecs.push(
        `android.permission.${court} est declaree, et son demandeur \`${entree.symbole}\`\n` +
          "  n'existe plus dans src/. La permission ne sera jamais accordee, et l'appel qui\n" +
          "  en depend echouera en silence - le marchand lira une panne de materiel.",
      );
    }
  }
}

// --- Verdict ---------------------------------------------------------------
for (const note of notes) console.log(`› ${note}`);
if (echecs.length > 0) {
  console.error(`\n✖ Manifeste Android refuse (${echecs.length}) :\n`);
  for (const e of echecs) console.error(`  - ${e}\n`);
  process.exit(1);
}
const vus = fusionnes.length;
console.log(
  `✓ Manifeste Android conforme a la regle de Play ` +
    `(garde du greffon eprouvee, ${LOCALISATION.length} permission(s) gardee(s), ` +
    `${vus} manifeste(s) fusionne(s) balaye(s), ` +
    `${Object.keys(DEMANDEE_PAR).length} permission(s) a invite inscrite(s)).`,
);
