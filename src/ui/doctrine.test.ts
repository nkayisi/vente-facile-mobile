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

describe("aucune classe utilitaire inerte", () => {
  /**
   * Une classe que NativeWind ne sait pas traduire ne lève rien : elle est
   * simplement ignorée, et le défaut ne se voit qu'à l'œil, sur un écran qu'on
   * ne regarde pas de près.
   *
   * `tabular-nums` est le cas rencontré, et il n'est pas cosmétique : sans
   * chasse fixe, une colonne de montants ondule et devient pénible à balayer,
   * ce qui est exactement l'usage d'un écran de créances. La chasse fixe passe
   * par la prop `numeric` de `Text`, qui pose `fontVariant`.
   */
  const INERTES = [
    { classe: "tabular-nums", remplacer: "la prop `numeric` de `Text`" },
    { classe: "slashed-zero", remplacer: "la prop `numeric` de `Text`" },
    { classe: "antialiased", remplacer: "rien : le lissage n'est pas réglable ici" },
  ];

  /**
   * On ne regarde QUE le contenu des `className`. `tabular-nums` est aussi une
   * valeur légitime de `fontVariant` en React Native - c'est même la manière
   * correcte de l'obtenir, et `ui/text.tsx` l'emploie. Chercher la chaîne dans
   * tout le fichier condamnerait le remède avec le mal.
   */
  function classes(source: string): string[] {
    const sortie: string[] = [];
    for (const m of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      sortie.push(m[1] ?? m[2] ?? "");
    }
    return sortie;
  }

  it("aucun fichier n'écrit une classe que NativeWind ignore", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const listes = classes(sansCommentaires(readFileSync(f, "utf8")));
      for (const { classe, remplacer } of INERTES) {
        const motif = new RegExp(`\\b${classe}\\b`);
        if (listes.some((l) => motif.test(l))) {
          fautifs.push(`${relative(RACINE, f)} : ${classe} - employer ${remplacer}`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("le garde-fou VOIT une classe inerte dans un `className`", () => {
    // Sans cette vérification, resserrer l'analyse aux `className` pourrait la
    // rendre aveugle sans que rien ne le signale.
    expect(classes('<Text className="shrink-0 tabular-nums" />')).toEqual([
      "shrink-0 tabular-nums",
    ]);
    expect(classes('style={{ fontVariant: ["tabular-nums"] }}')).toEqual([]);
  });
});

describe("aucun montant sans devise", () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ `money(x, "")` REND UN MONTANT SANS SYMBOLE, EN SILENCE.                 │
   * │                                                                          │
   * │ `symbolOf` du noyau ne se replie sur la devise par défaut que si le code │
   * │ lui EST ÉGAL ; une chaîne vide ne l'est pas, donc le symbole vaut la     │
   * │ chaîne vide, et « 190 240,5 $ » sort « 190 240,5 ». Relevé sur           │
   * │ l'émulateur, sur les écrans de caisses, de retours et de devis à la      │
   * │ fois : un nombre nu, dans une application MULTI-DEVISE où le même chiffre│
   * │ vaut soit trois dollars, soit trois francs.                              │
   * │                                                                          │
   * │ La signature exige déjà une devise, ce qui n'a pas suffi : la chaîne     │
   * │ vide la satisfait. Écrire `money.primaryCode`, ou la devise de la pièce, │
   * │ est aussi court et dit ce qu'on a décidé.                                │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it("aucun appel ne passe une devise vide", () => {
    const fautifs: string[] = [];
    // `money(...)`, `money.money(...)`, `m.money(...)` : on cherche le second
    // argument littéralement vide, quelle que soit la forme de l'appel.
    const motif = /\bmoney\s*\([^;]*?,\s*(""|''|``)\s*\)/;
    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      const m = code.match(motif);
      if (m) fautifs.push(`${relative(RACINE, f)} : ${m[0].slice(0, 60)}`);
    }
    expect(fautifs).toEqual([]);
  });

  it("le garde-fou VOIT une devise vide", () => {
    // Sans cette vérification, une expression régulière trop étroite passerait
    // pour un dépôt propre.
    const motif = /\bmoney\s*\([^;]*?,\s*(""|''|``)\s*\)/;
    expect(motif.test('money.money(total, "")')).toBe(true);
    expect(motif.test("money(l.total, '')")).toBe(true);
    expect(motif.test("money.money(total, money.primaryCode)")).toBe(false);
    expect(motif.test('money.money(l.montant, devise)')).toBe(false);
  });
});

describe("un seul propriétaire par bord de zone sûre", () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ DEUX COMPOSANTS QUI AJOUTENT LE MÊME INSET DOUBLENT LA MARGE.           │
   * │                                                                          │
   * │ La règle est déjà écrite dans `AppBar` : « `AppBar` ne pose AUCUNE zone  │
   * │ sûre, c'est `Screen` qui s'en charge », parce que deux composants qui    │
   * │ ajoutent `insets.top` donnent une barre de quatre-vingt-dix points. Elle │
   * │ vaut pour le bas de la même façon, et `Fab` l'avait enfreinte - sa       │
   * │ docstring PROMETTAIT la zone sûre que son code n'appliquait pas, puis    │
   * │ l'a appliquée en double le temps d'un correctif.                         │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * `Screen` est le seul composant de `src/ui/` autorisé à lire les insets pour
   * poser une marge de contenu. Les exceptions sont NOMMÉES, et chacune tient à
   * ce qu'elle ne vit pas dans un `Screen` :
   *   - `sheet.tsx`   : une modale, rendue hors de l'arbre de l'écran
   *   - `top-bar.tsx` : la barre système, au-dessus du contenu
   *   - `toast.tsx`   : le fournisseur est monté AU-DESSUS du navigateur, pour
   *                     servir aussi les écrans plein écran du comptoir
   */
  const AUTORISES = ["screen.tsx", "sheet.tsx", "top-bar.tsx", "toast.tsx"];

  it("aucun composant d'interface n'ajoute une zone sûre en plus de `Screen`", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(join(RACINE, "ui"))) {
      const nom = relative(RACINE, f);
      if (AUTORISES.some((a) => nom.endsWith(a))) continue;
      const code = sansCommentaires(readFileSync(f, "utf8"));
      if (/useSafeAreaInsets/.test(code)) fautifs.push(nom);
    }
    expect(fautifs).toEqual([]);
  });

  it("`Screen` applique bien les quatre bords, le bas compris", () => {
    const code = readFileSync(join(RACINE, "ui", "screen.tsx"), "utf8");
    // Le défaut est ce qui compte : 95 écrans ne passent pas `edges`, et
    // c'est là que le bouton de formulaire se posait sur la barre gestuelle.
    expect(code).toMatch(/edges = \["top", "bottom"\]/);
    expect(code).toMatch(/paddingBottom: edges\.includes\("bottom"\)/);
  });
});
