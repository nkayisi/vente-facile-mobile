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

/**
 * Une route dynamique ne se compare pas caractère par caractère.
 *
 * `/vente/[id]` déclaré et `/vente/${v.id}` écrit dans le code désignent la
 * même chose. On compare donc la FORME : même nombre de segments, et chaque
 * segment égal sauf là où la route en déclare un dynamique. Sans cela, le lot 6
 * aurait ajouté quatre routes que ce test ne regarderait pas.
 */
function correspond(cible: string, route: string): boolean {
  const a = cible.split("/").filter(Boolean);
  const b = route.split("/").filter(Boolean);
  if (a.length !== b.length) return false;
  return b.every((seg, i) => (seg.startsWith("[") && seg.endsWith("]")) || seg === a[i]);
}

function existe(routes: Set<string>, cible: string): boolean {
  if (routes.has(cible)) return true;
  return [...routes].some((r) => r.includes("[") && correspond(cible, r));
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
        if (!existe(routes, cible)) casses.push(`${relative(SRC, f)} -> ${m[1]}`);
      }
    }
    expect(casses).toEqual([]);
  });

  it("chaque gabarit `router.push(`/x/${id}`)` mène quelque part", () => {
    // Les routes dynamiques du lot 6 s'écrivent presque toutes ainsi, et
    // l'ancienne expression les ignorait toutes : elle excluait `$`.
    const casses: string[] = [];
    let vus = 0;
    for (const f of fichiers(SRC)) {
      const code = readFileSync(f, "utf8");
      for (const m of code.matchAll(/router\.(?:push|replace)\(\s*`([^`]+)`/g)) {
        // Chaque interpolation devient un segment dynamique.
        const cible = normaliser(m[1].replace(/\$\{[^}]*\}/g, "[x]"));
        vus += 1;
        if (!existe(routes, cible)) casses.push(`${relative(SRC, f)} -> ${m[1]}`);
      }
    }
    // Sans cette assertion, une expression qui ne trouve rien ferait passer le
    // test sans rien démontrer.
    expect(vus).toBeGreaterThan(0);
    expect(casses).toEqual([]);
  });

  it("chaque `pathname:` mène quelque part", () => {
    const casses: string[] = [];
    for (const f of fichiers(SRC)) {
      const code = readFileSync(f, "utf8");
      for (const m of code.matchAll(/pathname:\s*"([^"]+)"/g)) {
        const cible = normaliser(m[1]);
        if (!existe(routes, cible)) casses.push(`${relative(SRC, f)} -> ${m[1]}`);
      }
    }
    expect(casses).toEqual([]);
  });

  it("chaque entrée du menu mène quelque part", () => {
    const menu = readFileSync(join(SRC, "navigation/menu.ts"), "utf8");
    const casses: string[] = [];
    for (const m of menu.matchAll(/href:\s*"([^"]+)"/g)) {
      if (!existe(routes, normaliser(m[1]))) casses.push(m[1]);
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

/**
 * `src/app/` est le dossier de ROUTES, et rien d'autre.
 *
 * Un souligné de tête n'y protège de rien : expo-router enregistre quand même
 * le fichier et avertit qu'il n'exporte pas de composant par défaut. C'est le
 * même piège que le test rangé là au lot 5bis.7, et il se paie de la même
 * façon - un avertissement au démarrage que plus personne ne lit.
 */
describe("src/app ne contient que des routes", () => {
  it("chaque fichier exporte un composant par défaut", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(APP)) {
      const code = readFileSync(f, "utf8");
      if (!/export default\b/.test(code)) fautifs.push(relative(APP, f));
    }
    expect(fautifs).toEqual([]);
  });
});
