#!/usr/bin/env node
/**
 * Refuse de lancer une compilation que la mauvaise cle signerait.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ UNE SIGNATURE FAUSSE NE SE RATTRAPE PAS, ET C'EST CE QUI REND CE SCRIPT   │
 * │ NECESSAIRE.                                                               │
 * │                                                                            │
 * │ Android refuse toute mise a jour dont la signature a change, et Google    │
 * │ Play de meme : un binaire publie sous une cle condamne toutes ses mises a │
 * │ jour a porter la MEME. Un keystore egare, un mot de passe oublie, un APK  │
 * │ signe par megarde de la cle de debug - et il n'y a plus de chemin de       │
 * │ retour : il faut republier sous un autre identifiant de paquet, donc       │
 * │ perdre les installations existantes.                                       │
 * │                                                                            │
 * │ Rien dans la chaine ne le signale a temps. Gradle compile, l'APK           │
 * │ s'installe, et le refus arrive a l'envoi - ou, pire, des mois plus tard,   │
 * │ a la premiere mise a jour.                                                 │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ SIX CONTROLES, ET CHACUN ATTRAPE UNE REGRESSION DIFFERENTE.               │
 * │                                                                            │
 * │ 1. LES IDENTIFIANTS SONT COMPLETS. `credentials.json` presente ses quatre  │
 * │    champs, et le keystore qu'il designe existe la ou il le dit.            │
 * │                                                                            │
 * │ 2. LE MOT DE PASSE OUVRE LE MAGASIN ET L'ALIAS EXISTE. C'est le seul       │
 * │    controle qui eprouve le SECRET et pas sa presence : un mot de passe     │
 * │    faux ne se voit qu'a la compilation, apres la file d'attente d'EAS.     │
 * │                                                                            │
 * │ 3. LE CERTIFICAT N'EST PAS PERIME. Play exige une validite tres longue, et │
 * │    un certificat expire ne signe plus rien.                                │
 * │                                                                            │
 * │ 4. TOUS LES PROFILS LISENT LA CLE LOCALE. Un profil laisse en `remote`     │
 * │    ferait ENGENDRER une cle par EAS, en silence : le binaire sortirait     │
 * │    signe d'une cle que personne ne detient sur cette machine.              │
 * │                                                                            │
 * │ 5. LE GREFFON EST DECLARE. Sans lui, un `assembleRelease` local repart sur │
 * │    `signingConfigs.debug`, que le gabarit de React Native pose.            │
 * │                                                                            │
 * │ 6. LE SECRET N'EST PAS SUIVI PAR GIT. Le keystore et son mot de passe ne   │
 * │    doivent entrer dans aucun depot, et c'est le seul de ces controles      │
 * │    dont l'echec ne se repare pas en changeant un fichier.                  │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ CE SCRIPT N'IMPRIME JAMAIS UN MOT DE PASSE, pas meme tronque, et pas meme
 * dans un message d'echec. Un refus qui cite le secret le publierait dans
 * stdout, dans les journaux d'integration et dans l'historique du shell -
 * c'est-a-dire exactement la fuite que le gitignore existe pour empecher. Il
 * nomme la SOURCE (« le mot de passe de credentials.json »), jamais la valeur.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const echecs = [];
const notes = [];

/** Lance une commande et rend sa sortie, ou `null` si elle echoue. */
function sortieDe(commande, args) {
  try {
    return execFileSync(commande, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

// --- 1. Les identifiants sont complets, et le keystore est la --------------
const { lireIdentifiants, PROPRIETES } = await import(
  path.join(RACINE, "plugins", "with-signature-release.js")
).then((m) => m.default ? m : m);

let identifiants = null;
try {
  identifiants = lireIdentifiants(RACINE);
} catch (cause) {
  echecs.push(cause.message);
}

if (identifiants === null && echecs.length === 0) {
  echecs.push(
    "credentials.json est absent a la racine du projet.\n" +
      "  Sans lui, EAS ENGENDRE une cle de signature et le binaire sort signe d'une\n" +
      "  cle que personne ne detient ici. Le fichier n'est pas versionne (il porte le\n" +
      "  mot de passe en clair) : il se recupere par `eas credentials` > `Download\n" +
      "  credentials from EAS to credentials.json`, ou se reecrit a la main.",
  );
}

// --- 2 et 3. Le mot de passe ouvre le magasin, et le certificat vit --------
if (identifiants) {
  // ⚠ LA LOCALE EST FORCEE EN ANGLAIS, et ce n'est pas une coquetterie :
  // `keytool` traduit ses etiquettes (« Valid from ... until », « Alias
  // name »). Sur un poste en francais, le balayage ne trouverait plus la date
  // et ce script refuserait une signature parfaitement valide - un garde-fou
  // qui crie sur du legitime finit desactive.
  const keytool = sortieDe("keytool", [
    "-J-Duser.language=en",
    "-J-Duser.country=US",
    "-list",
    "-v",
    "-keystore",
    identifiants.fichier,
    "-storepass",
    identifiants.motDePasseMagasin,
  ]);

  if (keytool === null) {
    if (sortieDe("keytool", ["-help"]) === null) {
      notes.push(
        "keytool est introuvable : le mot de passe et l'alias n'ont pas pu etre " +
          "eprouves.\n  Pour obtenir le controle : installer un JDK (celui d'Android " +
          "Studio convient).",
      );
    } else {
      echecs.push(
        "le mot de passe de credentials.json n'ouvre pas le keystore, ou le\n" +
          `  fichier n'est pas un magasin de cles : ${identifiants.fichier}\n` +
          "  C'est le defaut qui ne se voit qu'apres la file d'attente d'EAS.",
      );
    }
  } else {
    // L'alias, exactement : `keytool` liste « Alias name: <x> », et une
    // comparaison insensible a la casse serait un piege - Gradle, lui, exige
    // l'alias au caractere pres et echoue sur « Keystore file ... not found »
    // ou « No key with alias ... found ».
    const alias = [...keytool.matchAll(/^Alias name: (.+)$/gm)].map((m) =>
      m[1].trim(),
    );
    if (!alias.includes(identifiants.alias)) {
      echecs.push(
        `l'alias « ${identifiants.alias} » declare dans credentials.json n'existe\n` +
          `  pas dans le keystore, qui porte : ${alias.join(", ") || "(aucun)"}.`,
      );
    }

    const jusqua = /until: (.+)$/m.exec(keytool);
    // ⚠ `keytool` ecrit un fuseau en ABREVIATION (« WAT »), que JavaScript ne
    // sait pas lire : `new Date("... WAT 2052")` rend `Invalid Date`. On le
    // retire, donc la date est interpretee dans le fuseau LOCAL. Sur une
    // echeance a plusieurs annees, les quelques heures d'ecart ne changent
    // rien au verdict - et ce que ce controle juge, c'est une expiration, pas
    // une minute.
    const sansFuseau = jusqua?.[1].trim().replace(/\s+[A-Z]{2,5}(\s+\d{4})$/, "$1");
    if (!jusqua) {
      echecs.push(
        "la date de fin de validite du certificat n'a pas pu etre lue dans la\n" +
          "  sortie de keytool. Le format a change : relire ce script plutot que de\n" +
          "  laisser passer un certificat perime.",
      );
    } else {
      const fin = new Date(sansFuseau);
      const annees = (fin - Date.now()) / (365.25 * 24 * 3600 * 1000);
      if (Number.isNaN(fin.getTime())) {
        echecs.push(`date de fin de validite illisible : « ${jusqua[1]} ».`);
      } else if (annees <= 0) {
        echecs.push(
          `le certificat de signature a EXPIRE le ${fin.toISOString().slice(0, 10)}.\n` +
            "  Il ne signe plus rien, et une cle expiree ne se remplace pas sur une\n" +
            "  application deja publiee.",
        );
      } else {
        notes.push(
          `certificat valide jusqu'au ${fin.toISOString().slice(0, 10)} ` +
            `(${annees.toFixed(0)} ans).`,
        );
        // Google Play demande une cle d'envoi valable bien au-dela de la vie
        // de l'application. On avertit sans refuser : une cle qui expire dans
        // cinq ans signe parfaitement aujourd'hui, et refuser ferait echouer
        // une compilation pour un probleme qui n'est pas celui du jour.
        if (annees < 25) {
          notes.push(
            "⚠ Google Play recommande une validite d'au moins 25 ans pour une cle " +
              "d'envoi.",
          );
        }
      }
    }
  }
}

// --- 4. Tous les profils lisent la cle locale ------------------------------
const cheminEas = path.join(RACINE, "eas.json");
if (!existsSync(cheminEas)) {
  echecs.push("eas.json est introuvable.");
} else {
  let eas;
  try {
    eas = JSON.parse(readFileSync(cheminEas, "utf8"));
  } catch (cause) {
    echecs.push(`eas.json est illisible : ${cause.message}`);
  }
  const profils = Object.entries(eas?.build ?? {});
  if (profils.length === 0) {
    echecs.push(
      "aucun profil de compilation dans eas.json : ce balayage ne prouverait rien.",
    );
  }
  for (const [nom, profil] of profils) {
    if (profil?.credentialsSource !== "local") {
      echecs.push(
        `le profil « ${nom} » d'eas.json ne porte pas \`"credentialsSource": "local"\`.\n` +
          "  La valeur par defaut est `remote` : EAS ENGENDRERAIT une cle a notre place,\n" +
          "  et le binaire sortirait signe d'une cle que personne ne detient ici.",
      );
    }
  }
  if (profils.length > 0) {
    notes.push(`${profils.length} profil(s) d'eas.json lisent la cle locale.`);
  }
}

// --- 5. Le greffon est declare, et sa garde mord ---------------------------
const config = readFileSync(path.join(RACINE, "app.config.ts"), "utf8");
if (!config.includes("./plugins/with-signature-release")) {
  echecs.push(
    "le greffon `./plugins/with-signature-release` n'est plus declare dans\n" +
      "  app.config.ts. Un `assembleRelease` local repartirait sur\n" +
      "  `signingConfigs.debug`, que le gabarit de React Native pose - un APK qui\n" +
      "  s'installe, qui a l'air bon, et qu'aucune vraie release ne pourra mettre\n" +
      "  a jour.",
  );
}

// La garde « inerte sans credentials.json » est ce qui permet au meme arbre de
// servir EAS, ou le fichier n'existe pas. Un greffon qui leverait la-bas
// casserait toutes les compilations distantes : on l'eprouve ici, sur un
// dossier vide, plutot que de le decouvrir sur le serveur.
const vide = mkdtempSync(path.join(tmpdir(), "vf-signature-"));
try {
  if (lireIdentifiants(vide) !== null) {
    echecs.push(
      "la garde du greffon ne rend plus la main quand credentials.json est absent.\n" +
        "  Sur les serveurs d'EAS le fichier n'existe pas : le greffon y poserait une\n" +
        "  signature dont les proprietes Gradle n'existent pas, et toutes les\n" +
        "  compilations distantes echoueraient a la configuration.",
    );
  }
} finally {
  rmSync(vide, { recursive: true, force: true });
}

// --- 6. Le secret n'est pas suivi par git ----------------------------------
for (const relatif of ["credentials.json"]) {
  const suivi = sortieDe("git", ["ls-files", "--error-unmatch", relatif]);
  if (suivi !== null && suivi.trim() !== "") {
    echecs.push(
      `${relatif} est SUIVI PAR GIT. Il porte le mot de passe du keystore en\n` +
        "  clair : le retirer du suivi ne suffit pas, l'historique le garde.\n" +
        "  `git rm --cached` puis changer de mot de passe de magasin.",
    );
  }
}
if (identifiants) {
  const dansLeDepot = sortieDe("git", [
    "ls-files",
    "--error-unmatch",
    path.relative(RACINE, identifiants.fichier),
  ]);
  if (dansLeDepot !== null && dansLeDepot.trim() !== "") {
    echecs.push(
      "le keystore est SUIVI PAR GIT. Qui lit le depot peut signer a notre place,\n" +
        "  et l'historique le garde meme apres un retrait.",
    );
  }
}

// --- 7. Si android/ existe, la release emploie bien la cle -----------------
const buildGradle = path.join(RACINE, "android", "app", "build.gradle");
if (!existsSync(buildGradle)) {
  notes.push(
    "android/ est absent : la configuration de signature engendree n'a pas pu etre\n" +
      "  relue. Elle l'est au prochain `expo prebuild`, et sur EAS c'est le serveur\n" +
      "  qui l'ecrit.",
  );
} else if (identifiants) {
  const gradle = readFileSync(buildGradle, "utf8");
  const blocRelease = /release \{(?:[^{}]*?)signingConfig signingConfigs\.(\w+)/.exec(
    gradle,
  );
  if (blocRelease?.[1] !== "release") {
    echecs.push(
      `android/app/build.gradle fait signer la release par ` +
        `\`signingConfigs.${blocRelease?.[1] ?? "?"}\`.\n` +
        "  Le greffon n'a pas tourne sur cet arbre : relancer `expo prebuild`.",
    );
  }
  const proprietes = path.join(RACINE, "android", "gradle.properties");
  const posees = existsSync(proprietes) ? readFileSync(proprietes, "utf8") : "";
  const absentes = Object.values(PROPRIETES).filter(
    (clef) => !new RegExp(`^${clef}=`, "m").test(posees),
  );
  if (absentes.length > 0) {
    echecs.push(
      `android/gradle.properties ne porte pas ${absentes.join(", ")}.\n` +
        "  La signingConfig les lit par `project.property` : Gradle echouerait a la\n" +
        "  configuration, y compris pour un build de debug.",
    );
  }
}

// --- Verdict ---------------------------------------------------------------
for (const note of notes) console.log(`› ${note}`);
if (echecs.length > 0) {
  console.error(`\n✖ Signature de release refusee (${echecs.length}) :\n`);
  for (const e of echecs) console.error(`  - ${e}\n`);
  process.exit(1);
}
console.log(
  `✓ Signature de release conforme (keystore joignable, mot de passe eprouve, ` +
    `alias « ${identifiants.alias} », garde du greffon eprouvee, secrets hors de git).`,
);
