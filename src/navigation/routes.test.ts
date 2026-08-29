/**
 * Toute cible de navigation littérale correspond à une route qui existe.
 *
 * Ce test aurait attrapé en une seconde les trois liens cassés par le
 * déplacement des écrans du lot 5bis.2 - `/(app)/operations` devenu
 * `/(app)/appareil/operations`, `/pos` devenu `/vendre`. Les routes typées
 * d'expo-router les ont attrapés cette fois-là ; ce test le fait aussi pour les
 * chaînes que le typage ne voit pas, et il reste vrai si le typage est un jour
 * relâché.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * NE JAMAIS remettre ce fichier dans `src/app/` : c'est le dossier de routes
 * d'expo-router, et Metro tente d'empaqueter TOUT ce qui s'y trouve, y compris
 * un test. Celui-ci importe `node:fs`, qui n'existe pas en React Native :
 * l'application refusait de compiler alors que Jest, lui, passait au vert.
 * Le defaut ne se voit qu'en lancant l'application.
 */
const APP = resolve(__dirname, "../app");
const SRC = resolve(__dirname, "..");

function fichiers(dir: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin));
    else if (/\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

/** `(app)/(tabs)/stock.tsx` -> `/stock` ; les groupes entre parenthèses tombent. */
function cheminDeRoute(fichier: string): string | null {
  const rel = relative(APP, fichier).replace(/\\/g, "/");
  if (rel.endsWith("_layout.tsx")) return null;
  const sansExt = rel.replace(/\.tsx?$/, "");
  const segments = sansExt
    .split("/")
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  if (segments[segments.length - 1] === "index") segments.pop();
  return "/" + segments.join("/");
}

/** Même normalisation pour une cible écrite dans le code. */
function normaliser(cible: string): string {
  const sansQuery = cible.split("?")[0];
  const segments = sansQuery
    .split("/")
    .filter(Boolean)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

describe("cibles de navigation", () => {
  const routes = new Set(
    fichiers(APP).map(cheminDeRoute).filter((r): r is string => r !== null)
  );

  it("le tableau des routes n'est pas vide", () => {
    // Sans cette assertion, une erreur de chemin ferait passer le test suivant
    // sans rien démontrer.
    expect(routes.size).toBeGreaterThan(15);
  });

  it("chaque `router.push` / `router.replace` littéral mène quelque part", () => {
    const casses: string[] = [];
    for (const f of fichiers(SRC)) {
      const code = readFileSync(f, "utf8");
      for (const m of code.matchAll(/router\.(?:push|replace)\(\s*"([^"$]+)"/g)) {
        const cible = normaliser(m[1]);
        // Un segment dynamique (`[id]`) ne se compare pas littéralement.
        if (cible.includes("[")) continue;
        if (!routes.has(cible)) casses.push(`${relative(SRC, f)} -> ${m[1]}`);
      }
    }
    expect(casses).toEqual([]);
  });

  it("chaque entrée du menu mène quelque part", () => {
    const menu = readFileSync(join(SRC, "navigation/menu.ts"), "utf8");
    const casses: string[] = [];
    for (const m of menu.matchAll(/href:\s*"([^"]+)"/g)) {
      if (!routes.has(normaliser(m[1]))) casses.push(m[1]);
    }
    expect(casses).toEqual([]);
  });

  it("chaque onglet déclaré correspond à un fichier de route", () => {
    const onglets = readFileSync(join(SRC, "navigation/onglets.ts"), "utf8");
    const noms = [...onglets.matchAll(/nom:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(noms.length).toBeGreaterThan(0);
    for (const nom of noms) {
      const attendu = nom === "index" ? "/" : `/${nom}`;
      expect(routes.has(attendu)).toBe(true);
    }
  });
});
