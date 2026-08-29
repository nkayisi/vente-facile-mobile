/**
 * Garde-fous de doctrine.
 *
 * Ce ne sont pas des tests de rendu mais des invariants de FICHIERS. Ils sont
 * là parce que chacune de ces règles a déjà été enfreinte, et parce qu'aucune
 * ne se voit à l'exécution : un écran resté blanc en thème sombre ne se
 * découvre qu'à la nuit tombée, et une `Alert.alert` a l'air normale jusqu'à
 * ce qu'on la voie sur les deux plateformes.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const RACINE = resolve(__dirname, "..");

function fichiers(dir: string, ext = [".ts", ".tsx"]): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin, ext));
    else if (ext.some((e) => nom.endsWith(e)) && !nom.endsWith(".test.ts") && !nom.endsWith(".test.tsx")) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

/** Le code, commentaires retirés : une règle citée dans un commentaire n'est pas une infraction. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("aucune couleur en dur", () => {
  /**
   * Le viseur de la caméra est NOIR par nature : un scanner de code-barres qui
   * suivrait le thème clair serait illisible. C'est la seule exception, et elle
   * tient au matériel, pas à un oubli.
   */
  const EXCEPTIONS = ["app/(app)/pos/scan.tsx"];

  const interdits =
    /\b(?:bg|text|border)-(?:white|black|gray-\d+|orange-\d+|red-\d+|green-\d+|blue-\d+)\b/;

  it("aucun écran n'écrit une couleur Tailwind littérale", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const rel = relative(RACINE, f);
      if (EXCEPTIONS.some((e) => rel.endsWith(e))) continue;
      const code = sansCommentaires(readFileSync(f, "utf8"));
      const m = code.match(interdits);
      if (m) fautifs.push(`${rel} : ${m[0]}`);
    }
    // Les composants lisent `bg-card`, `text-muted-foreground` : c'est le
    // fournisseur de thème qui décide ce que ces noms valent. Une couleur
    // littérale resterait claire en thème sombre, en silence.
    expect(fautifs).toEqual([]);
  });

  it("aucune variante `dark:` : un seul endroit décide du thème", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      if (/\bdark:[a-z-]+/.test(sansCommentaires(readFileSync(f, "utf8")))) {
        fautifs.push(relative(RACINE, f));
      }
    }
    expect(fautifs).toEqual([]);
  });
});

describe("aucune graisse de police", () => {
  it("les écrans posent une FAMILLE, jamais un `font-weight`", () => {
    // Sur Android, une famille custom ne synthétise pas les graisses :
    // `font-semibold` sur Inter rend du regular, sans erreur ni avertissement.
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      const m = code.match(/\bfont-(?:thin|light|normal|medium|semibold|bold|extrabold|black)\b/);
      if (m) fautifs.push(`${relative(RACINE, f)} : ${m[0]}`);
    }
    expect(fautifs).toEqual([]);
  });
});

describe("aucun composant natif de dialogue", () => {
  it("`Alert` de react-native n'est importé nulle part", () => {
    // Il ignore le thème sombre, ignore la police, ne sait pas rendre un
    // montant en chiffres tabulaires, et son bouton destructif n'est rouge que
    // sur iOS. `AlertDialog` le remplace.
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      if (/import \{[^}]*\bAlert\b[^}]*\} from "react-native"/.test(code)) {
        fautifs.push(relative(RACINE, f));
      }
    }
    expect(fautifs).toEqual([]);
  });
});
