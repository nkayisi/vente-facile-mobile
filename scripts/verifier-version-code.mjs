#!/usr/bin/env node
/**
 * Refuse de lancer une compilation de production dont le versionCode n'a pas
 * monté.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ LE VERSIONCODE EST TENU À LA MAIN, DONC IL PEUT ÊTRE OUBLIÉ.               │
 * │                                                                            │
 * │ Depuis le 2026-11-16, `eas.json` porte `"appVersionSource": "local"` :     │
 * │ EAS lit `VERSION_CODE` d'`app.config.ts` tel quel et ne l'augmente plus.   │
 * │ Oublier de le monter ne lève rien à la compilation : le bundle sort, il    │
 * │ est signé, il a l'air bon, et Google Play le refuse à l'envoi parce que    │
 * │ ce numéro a déjà servi. Vingt minutes de file d'attente pour rien.         │
 * │                                                                            │
 * │ Ce script compare donc le versionCode de la configuration de PRODUCTION   │
 * │ à la plus haute compilation de ce même identifiant connue d'EAS, et       │
 * │ refuse s'il n'est pas STRICTEMENT plus grand.                              │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ LA RÉFÉRENCE EST L'HISTORIQUE DES COMPILATIONS, PAS UN FICHIER TENU À LA  │
 * │ MAIN.                                                                      │
 * │                                                                            │
 * │ Un fichier « dernier numéro publié » serait un second compteur à tenir,    │
 * │ et on l'oublierait comme le premier. L'historique d'EAS dit ce qui a       │
 * │ réellement été compilé, et il est déjà là : `eas build` en a besoin de     │
 * │ toute façon.                                                               │
 * │                                                                            │
 * │ ⚠ UNE COMPILATION EN ÉCHEC OU ANNULÉE NE COMPTE PAS : elle n'a produit     │
 * │ aucun bundle, et relancer avec le même numéro après une panne est le cas   │
 * │ ordinaire. Une compilation EN COURS compte, elle : deux compilations du    │
 * │ même numéro donneraient deux bundles dont Play n'accepterait qu'un.        │
 * │                                                                            │
 * │ ⚠ L'HISTORIQUE EST FILTRÉ PAR IDENTIFIANT (`com.smizone.app`). Les         │
 * │ compilations de l'ancien identifiant portent leurs propres numéros, sur   │
 * │ une autre fiche du magasin, et ne disent rien de celle-ci.                 │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Contrôles, dans l'ordre :
 *
 * 1. `eas.json` porte `appVersionSource: "local"` et AUCUN `autoIncrement`.
 *    Remis à `remote`, EAS reprendrait son propre compteur et ce script
 *    vérifierait un nombre que personne n'emploie ; un `autoIncrement` voudrait
 *    réécrire `app.config.ts`, ce qu'EAS ne sait pas faire sur une
 *    configuration dynamique.
 * 2. La configuration se résout bien en PRODUCTION. Sinon on lirait
 *    l'identifiant `.dev`, qui n'a aucun historique, et le contrôle passerait
 *    au vert sans avoir rien comparé.
 * 3. Le versionCode est un entier valable pour Play, et le `buildNumber` iOS
 *    est le même compteur.
 * 4. Le versionCode est strictement supérieur à la dernière compilation.
 * 5. La version affichée ne redescend pas. La porte de mise à jour compare
 *    cette chaîne au seuil du serveur : une version plus basse ferait passer
 *    des terminaux à jour pour des terminaux en retard.
 *
 * Code de sortie : 0 conforme, 1 refus, 2 impossible de vérifier. Un contrôle
 * qui n'a pas pu lire l'historique ne laisse pas partir la compilation.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Les statuts d'une compilation qui n'a produit aucun bundle. */
const STATUTS_SANS_BINAIRE = new Set(["ERRORED", "CANCELED"]);

/** Le plus grand versionCode que Google Play accepte. */
const VERSION_CODE_MAX = 2_100_000_000;

/** Taille d'une page de `eas build:list` (le maximum qu'il accepte). */
const PAGE = 50;

const erreurs = [];
const avertissements = [];

function abandonner(message) {
  console.error(`\n✗ Version : impossible de vérifier.\n\n  ${message}\n`);
  process.exit(2);
}

/** « 3.0.0 » → [3, 0, 0], ou null si la chaîne n'a pas cette forme. */
function segments(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? ""));
  return m ? m.slice(1).map(Number) : null;
}

/** -1, 0 ou 1 ; null si l'une des deux est illisible. */
function comparer(a, b) {
  const x = segments(a);
  const y = segments(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

// 1. eas.json ---------------------------------------------------------------

let eas;
try {
  eas = JSON.parse(readFileSync(path.join(RACINE, "eas.json"), "utf8"));
} catch (e) {
  abandonner(`eas.json est illisible : ${e.message}`);
}

if (eas.cli?.appVersionSource !== "local") {
  erreurs.push(
    `eas.json : "appVersionSource" vaut ${JSON.stringify(eas.cli?.appVersionSource)}. ` +
      `Il doit valoir "local" : le versionCode est tenu dans app.config.ts.`,
  );
}
for (const [nom, profil] of Object.entries(eas.build ?? {})) {
  for (const [ou, cible] of [
    ["", profil],
    [".android", profil?.android],
    [".ios", profil?.ios],
  ]) {
    if (cible && Object.hasOwn(cible, "autoIncrement")) {
      erreurs.push(
        `eas.json : le profil "${nom}${ou}" porte "autoIncrement". Retirez-le : ` +
          `le versionCode se monte à la main dans app.config.ts.`,
      );
    }
  }
}
if (eas.build?.production?.env?.VF_PROFILE !== "production") {
  erreurs.push(`eas.json : le profil "production" ne pose pas VF_PROFILE=production.`);
}

// 2. et 3. La configuration de production ----------------------------------

let config;
try {
  const sortie = execFileSync("npx", ["expo", "config", "--type", "public", "--json"], {
    cwd: RACINE,
    env: { ...process.env, VF_PROFILE: "production" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
  });
  config = JSON.parse(sortie);
} catch (e) {
  abandonner(`La configuration de production ne se résout pas (npx expo config) : ${e.message}`);
}

const identifiant = config?.android?.package;
const versionCode = config?.android?.versionCode;
const version = config?.version;

if (config?.extra?.profile !== "production" || !identifiant || /\.(dev|preview)$/.test(identifiant)) {
  abandonner(
    `La configuration ne s'est pas résolue en production (profil ` +
      `${JSON.stringify(config?.extra?.profile)}, identifiant ${JSON.stringify(identifiant)}). ` +
      `Comparer l'historique d'un autre identifiant ne prouverait rien.`,
  );
}

if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > VERSION_CODE_MAX) {
  erreurs.push(
    `app.config.ts : android.versionCode vaut ${JSON.stringify(versionCode)}. ` +
      `Il doit être un entier entre 1 et ${VERSION_CODE_MAX}.`,
  );
}
if (config?.ios?.buildNumber !== String(versionCode)) {
  erreurs.push(
    `app.config.ts : ios.buildNumber vaut ${JSON.stringify(config?.ios?.buildNumber)}, ` +
      `différent du versionCode ${versionCode}. C'est un seul compteur (VERSION_CODE).`,
  );
}
if (!segments(version)) {
  erreurs.push(`app.config.ts : la version ${JSON.stringify(version)} n'a pas la forme X.Y.Z.`);
}

// 4. et 5. L'historique d'EAS ------------------------------------------------

/** Toutes les compilations Android de cet identifiant, toutes pages lues. */
function historique() {
  const builds = [];
  for (let offset = 0; ; offset += PAGE) {
    let sortie;
    try {
      sortie = execFileSync(
        "eas",
        [
          "build:list",
          "--platform",
          "android",
          "--app-identifier",
          identifiant,
          "--limit",
          String(PAGE),
          "--offset",
          String(offset),
          "--json",
          "--non-interactive",
        ],
        { cwd: RACINE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 },
      );
    } catch (e) {
      const detail = String(e.stderr ?? e.message).trim().split("\n").slice(-3).join(" ");
      abandonner(
        `L'historique des compilations d'EAS est illisible (${detail}). ` +
          `Vérifiez le réseau et la connexion au compte (eas whoami) : la compilation ` +
          `ne partirait pas non plus.`,
      );
    }
    let page;
    try {
      page = JSON.parse(sortie);
    } catch {
      abandonner(`eas build:list n'a pas rendu de JSON lisible.`);
    }
    if (!Array.isArray(page)) abandonner(`eas build:list n'a pas rendu une liste.`);
    builds.push(...page);
    if (page.length < PAGE) return builds;
  }
}

if (erreurs.length === 0) {
  const builds = historique();
  const comptees = builds.filter(
    (b) => !STATUTS_SANS_BINAIRE.has(b.status) && /^\d+$/.test(String(b.appBuildVersion ?? "")),
  );
  const derniere = comptees.reduce(
    (max, b) => (!max || Number(b.appBuildVersion) > Number(max.appBuildVersion) ? b : max),
    null,
  );

  if (!derniere) {
    avertissements.push(
      `Aucune compilation de ${identifiant} connue d'EAS (${builds.length} au total, ` +
        `toutes en échec ou annulées) : premier envoi, rien à comparer.`,
    );
  } else {
    const code = Number(derniere.appBuildVersion);
    const quand = String(derniere.createdAt ?? "").slice(0, 10);
    const decrit = `versionCode ${code}, version ${derniere.appVersion}, le ${quand}, ${String(derniere.status).toLowerCase()}`;

    if (versionCode <= code) {
      erreurs.push(
        `Le versionCode ${versionCode} n'a pas monté : la dernière compilation de ` +
          `${identifiant} porte déjà le ${code} (${decrit}). Google Play refuserait le ` +
          `bundle. Passez VERSION_CODE à ${code + 1} au moins dans app.config.ts.`,
      );
    }

    const ordre = comparer(version, derniere.appVersion);
    if (ordre === -1) {
      erreurs.push(
        `La version ${version} est plus basse que celle de la dernière compilation ` +
          `(${derniere.appVersion}). La porte de mise à jour compare cette chaîne : ` +
          `elle ne doit jamais redescendre.`,
      );
    } else if (ordre === 0) {
      avertissements.push(
        `La version ${version} est la même que celle de la dernière compilation. ` +
          `Play l'accepte, mais la porte de mise à jour ne pourra pas distinguer les ` +
          `deux binaires : montez-la si celui-ci doit pouvoir être imposé.`,
      );
    }

    if (erreurs.length === 0) {
      console.log(`  Dernière compilation de ${identifiant} : ${decrit}.`);
    }
  }
}

// Verdict --------------------------------------------------------------------

for (const a of avertissements) console.warn(`  ⚠ ${a}`);

if (erreurs.length > 0) {
  console.error(`\n✗ Version : la compilation de production ne part pas.\n`);
  for (const e of erreurs) console.error(`  - ${e}`);
  console.error("");
  process.exit(1);
}

console.log(`✓ Version : ${version}, versionCode ${versionCode} (${identifiant}).`);
