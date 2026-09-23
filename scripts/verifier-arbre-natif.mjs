#!/usr/bin/env node
/**
 * Contrôle que `node_modules` n'a pas été MUTÉ par une compilation locale.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ UNE COMPILATION ANDROID LOCALE RÉÉCRIT DES FICHIERS DANS `node_modules`.   │
 * │                                                                            │
 * │ AGP 8 interdit l'attribut `package=` dans un `AndroidManifest.xml` de      │
 * │ bibliothèque ; le greffon Gradle de React Native le RETIRE EN PLACE, dans  │
 * │ le paquet installé, laissant sa signature : « <manifest » suivi de DEUX    │
 * │ espaces. Le fichier cesse alors de correspondre à ce que le registre       │
 * │ publie.                                                                    │
 * │                                                                            │
 * │ Conséquence sur EAS, et elle est fatale : `runtimeVersion` est calculée    │
 * │ par EMPREINTE, une fois sur le poste avant l'envoi, une fois sur le        │
 * │ serveur qui part d'une installation neuve. Les deux divergent, et le build │
 * │ s'arrête sur « Runtime version mismatch » après la file d'attente.         │
 * │ Mesuré le 14/09/2026 sur `@react-native-masked-view/masked-view` : hash    │
 * │ local `4e9c4c5b…`, hash EAS `3b05f6e8…`, pour un seul attribut retiré.     │
 * │                                                                            │
 * │ ⚠ `pnpm install --force` NE RÉPARE PAS : pnpm voit le paquet présent et    │
 * │ ne vérifie pas le contenu des fichiers. Il faut RETIRER le dossier du      │
 * │ paquet, puis réinstaller.                                                  │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Ce script ne répare rien de lui-même : il NOMME les paquets et donne la
 * commande. Un script qui supprime sur la foi d'une signature textuelle
 * effacerait un jour un paquet sain.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Ce que le greffon laisse derrière lui : l'attribut retiré, l'espace resté. */
const SIGNATURE = "<manifest  ";

const RACINES = ["node_modules", "modules"];

function* manifestes(dossier, profondeur = 0) {
  // Les sorties de compilation portent leurs propres manifestes, fusionnés :
  // ils ne viennent pas du registre et n'ont rien à dire ici.
  if (profondeur > 6 || dossier.endsWith("/build") || dossier.endsWith("/.git")) return;
  let entrees;
  try {
    entrees = readdirSync(dossier, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entrees) {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) yield* manifestes(chemin, profondeur + 1);
    else if (e.name === "AndroidManifest.xml") yield chemin;
  }
}

const mutes = [];
let balayes = 0;

for (const racine of RACINES) {
  try {
    statSync(racine);
  } catch {
    continue;
  }
  for (const chemin of manifestes(racine)) {
    balayes += 1;
    let contenu;
    try {
      contenu = readFileSync(chemin, "utf8");
    } catch {
      continue;
    }
    if (contenu.includes(SIGNATURE)) mutes.push(chemin);
  }
}

// Un balayage qui ne balaie rien passe au vert et ne prouve rien : ce dépôt l'a
// déjà payé trois fois. On exige d'avoir vu des manifestes.
if (balayes < 20) {
  console.error(
    `✗ Seulement ${balayes} manifestes balayés : \`node_modules\` semble absent. ` +
      "Lancez `pnpm install` avant ce contrôle."
  );
  process.exit(2);
}

if (mutes.length === 0) {
  console.log(`✓ Arbre natif intact (${balayes} manifestes balayés).`);
  process.exit(0);
}

const paquets = [
  ...new Set(
    mutes.map((c) => c.replace(/\/android\/src\/main\/AndroidManifest\.xml$/, ""))
  ),
];

console.error(
  `✗ ${paquets.length} paquet(s) réécrit(s) par une compilation locale. L'empreinte\n` +
    "  calculée ici ne correspondra PAS à celle du serveur, et `eas build` échouera\n" +
    "  sur « Runtime version mismatch ».\n"
);
for (const p of paquets) console.error("   - " + p);
console.error("\n  Réparer :\n    rm -rf " + paquets.join(" ") + " \\\n      && pnpm install --frozen-lockfile\n");
process.exit(1);
