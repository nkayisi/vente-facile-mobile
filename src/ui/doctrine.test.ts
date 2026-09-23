/**
 * Garde-fous de doctrine.
 *
 * Ce ne sont pas des tests de rendu mais des invariants de FICHIERS. Ils sont
 * là parce que chacune de ces règles a déjà été enfreinte, et parce qu'aucune
 * ne se voit à l'exécution : un écran resté blanc en thème sombre ne se
 * découvre qu'à la nuit tombée, et une `Alert.alert` a l'air normale jusqu'à
 * ce qu'on la voie sur les deux plateformes.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { tablesTirees } from "@/db/tables";
import { PALETTES } from "./tokens";

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

describe("aucun formatage par `Intl`", () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ UNE LOCALE INCONNUE NE LÈVE PAS, ELLE SE REPLIE SUR L'ANGLAIS.          │
   * │                                                                          │
   * │ C'est la raison d'être d'`intl-fr.ts` dans `@vente-facile/core`, et      │
   * │ cette règle n'était tenue que dans le noyau : sept écrans appelaient     │
   * │ encore `toLocaleDateString("fr-CD")`. « lundi 31 août » sortirait        │
   * │ « Monday, August 31 » sur un terminal dont le moteur n'embarque pas la   │
   * │ donnée de locale - et JAMAIS sur l'émulateur qui a servi à écrire        │
   * │ l'écran, ni sur la machine du développeur. Le défaut ne se découvrirait  │
   * │ donc qu'en production, sur un parc qu'on ne voit pas.                    │
   * │                                                                          │
   * │ Le noyau rend « 31 août 2026 », « 31 août, 14:07 » et « 14:07 » ;        │
   * │ `data/dates.ts` porte les deux formes numériques qui lui manquent.       │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it("aucun fichier n'appelle `toLocale*String` ni `Intl`", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      const m = code.match(/\btoLocale[A-Za-z]*String\s*\(|\bIntl\./);
      if (m) fautifs.push(`${relative(RACINE, f)} : ${m[0]}`);
    }
    expect(fautifs).toEqual([]);
  });

  it("le garde-fou VOIT un appel, et laisse passer un commentaire", () => {
    const motif = /\btoLocale[A-Za-z]*String\s*\(|\bIntl\./;
    expect(motif.test('d.toLocaleDateString("fr-CD")')).toBe(true);
    expect(motif.test("new Intl.NumberFormat()")).toBe(true);
    expect(motif.test(sansCommentaires("// voir toLocaleDateString"))).toBe(false);
    expect(motif.test("formatDateFr(d)")).toBe(false);
  });
});

describe("aucun montant sans devise", () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ `money(x, "")` REND UN MONTANT SANS SYMBOLE, EN SILENCE.                 │
   * │                                                                          │
   * │ `symbolOf` du noyau ne se replie sur la devise par défaut que si le code │
   * │ lui EST ÉGAL ; une chaîne vide ne l'est pas, donc le symbole vaut la     │
   * │ chaîne vide, et « 190 240,5 $ » sort « 190 240,5 » - suivi d'une espace, │
   * │ le gabarit interpolant toujours le séparateur. Dans une application      │
   * │ MULTI-DEVISE, le même chiffre vaut soit trois dollars, soit trois        │
   * │ francs, et le nombre nu a l'air parfaitement correct.                    │
   * │                                                                          │
   * │ Ce n'est même pas qu'un défaut d'affichage : `observabilite/rature.ts`   │
   * │ ANCRE les montants sur leur devise pour les raturer avant Sentry. Un     │
   * │ montant sans symbole n'est donc pas raturé et part EN CLAIR.             │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LA PREMIÈRE VERSION NE VOYAIT QUE LE LITTÉRAL, ET C'EST LA FORME LA      │
   * │ PLUS RARE.                                                               │
   * │                                                                          │
   * │ Elle cherchait `money(…, "")`, ce qui exige une virgule immédiatement    │
   * │ avant les guillemets. Elle manquait donc :                               │
   * │                                                                          │
   * │  - `money.money(f.solde, f.devise ?? "")` - le repli écrit DANS l'appel, │
   * │    trouvé sur deux écrans (contacts, fiche fournisseur) ;                │
   * │  - la classe TYPÉE, de loin la plus large : vingt lectures de `data/`    │
   * │    posaient `devise: l.currency ?? ""`, et l'écran écrivait plus loin un │
   * │    innocent `money.money(v.total, v.devise)`. Rien ne relie              │
   * │    textuellement les deux, et aucune expression régulière ne le pourra.  │
   * │                                                                          │
   * │ On interdit donc la FABRICATION plutôt que l'usage : une devise vide ne  │
   * │ doit naître nulle part. `deviseOuPrincipale` de `data/devise-principale` │
   * │ est le point de passage unique, et le serveur applique la même règle à   │
   * │ l'écriture (`CurrencyService.resolve` dans chaque `save()`).             │
   * └──────────────────────────────────────────────────────────────────────────┘
   */

  /** Une devise vide passée à un formateur de montant. */
  const APPEL_VIDE = /\b(?:money|amountOnly|formatMoney)\s*\([^;]*?,\s*(?:""|''|``)\s*\)/;

  /**
   * Une devise vide FABRIQUÉE : `x ?? ""`, `x || ""`, `devise: ""`, sur un
   * identifiant qui parle de devise. C'est la forme qui a réellement produit
   * le défaut, et celle que la première version manquait entièrement.
   */
  //: L'identifiant doit être un CODE de devise, pas n'importe quel champ qui
  //: commence par « currency » : `currency_symbol ?? ""` est légitime dans un
  //: titre, où l'absence de symbole laisse simplement lire « USD ». D'où la
  //: frontière de mot, que le souligné de `currency_symbol` ne satisfait pas.
  const CODE_DEVISE = String.raw`(?:\bdevise(?:[A-Z]\w*)?|\bcurrency(?:Code)?)\b`;
  const FABRIQUE = new RegExp(
    `${CODE_DEVISE}\\s*(?:\\?\\?|\\|\\|)\\s*(?:""|''|\`\`)` +
      `|${CODE_DEVISE}\\s*:\\s*(?:""|''|\`\`)`
  );

  //: Le module qui PORTE le repli, et le seul qui ait le droit d'écrire la
  //: forme interdite - dans sa propre implémentation comme dans sa docstring.
  const EXCEPTIONS = ["data/devise-principale.ts"];

  it("aucun appel ne passe une devise vide", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      const m = code.match(APPEL_VIDE);
      if (m) fautifs.push(`${relative(RACINE, f)} : ${m[0].slice(0, 60)}`);
    }
    expect(fautifs).toEqual([]);
  });

  it("aucune lecture ne FABRIQUE une devise vide", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const rel = relative(RACINE, f);
      if (EXCEPTIONS.some((e) => rel.endsWith(e))) continue;
      const code = sansCommentaires(readFileSync(f, "utf8"));
      const m = code.match(FABRIQUE);
      if (m) fautifs.push(`${rel} : ${m[0].slice(0, 60)}`);
    }
    // Le repli est la devise PRINCIPALE, jamais la chaîne vide : les lignes
    // d'avant le multi-devise n'ont pas perdu leur devise, l'établissement
    // n'en avait qu'une. Employer `deviseOuPrincipale`, ou `money.primaryCode`.
    expect(fautifs).toEqual([]);
  });

  it("les deux garde-fous VOIENT ce qu'ils interdisent", () => {
    // Sans cette vérification, une expression trop étroite passerait pour un
    // dépôt propre - ce qui est exactement arrivé à la version précédente.
    expect(APPEL_VIDE.test('money.money(total, "")')).toBe(true);
    expect(APPEL_VIDE.test("money(l.total, '')")).toBe(true);
    expect(APPEL_VIDE.test("money.amountOnly(reste, '')")).toBe(true);
    expect(APPEL_VIDE.test("money.money(total, money.primaryCode)")).toBe(false);

    // Les trois formes de fabrication réellement trouvées dans le dépôt.
    expect(FABRIQUE.test('money.money(f.solde, f.devise ?? "")')).toBe(true);
    expect(FABRIQUE.test('devise: l.currency ?? "",')).toBe(true);
    expect(FABRIQUE.test('const code = l.devise || "";')).toBe(true);
    expect(FABRIQUE.test('devise: "",')).toBe(true);

    // Et ce qu'il ne doit PAS attraper : un repli honnête, ou un tout autre champ.
    expect(FABRIQUE.test("devise: deviseOuPrincipale(l.currency),")).toBe(false);
    expect(FABRIQUE.test('devise: s.currency ?? ctx.devisePrincipale,')).toBe(false);
    expect(FABRIQUE.test('email: s.email?.trim() || "",')).toBe(false);
    // Le SYMBOLE d'une devise n'est pas son code : absent, il laisse lire
    // « USD » dans un titre, ce qui est juste.
    expect(FABRIQUE.test('`${d.currency_symbol ?? ""} ${d.currency_code ?? \'\'}`')).toBe(false);
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
   *   - `dialog.tsx`  : une modale aussi, et pour la MÊME raison. Un dialogue
   *                     assez haut pour remplir l'écran touchait les deux
   *                     bords, et son action principale passait sous la barre
   *                     gestuelle.
   *   - `top-bar.tsx` : la barre système, au-dessus du contenu
   *   - `toast.tsx`   : le fournisseur est monté AU-DESSUS du navigateur, pour
   *                     servir aussi les écrans plein écran du comptoir
   */
  const AUTORISES = ["screen.tsx", "sheet.tsx", "dialog.tsx", "top-bar.tsx", "toast.tsx"];

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

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CADRAN ET UNE RANGÉE N'ONT PAS LA MÊME ÉCHELLE.                      │
 * │                                                                          │
 * │ `StatValue` part de `text-2xl` en gras, parce que dans une cellule de    │
 * │ `StatStrip` le nombre EST le contenu. Repris dans une rangée, il écrit   │
 * │ « 84 $ » à vingt-quatre points à côté d'une référence à quatorze : le    │
 * │ montant crie, l'identité disparaît, et une liste de vingt ventes devient │
 * │ une colonne de chiffres qu'on ne peut plus relier à rien.                │
 * │                                                                          │
 * │ Relevé à l'écran sur SIX écrans-listes à la fois. Rien ne le signalait : │
 * │ le composant est légitime, il n'était simplement pas chez lui. D'où      │
 * │ `Mesure`, qui porte la même doctrine à l'échelle d'une rangée.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE PREMIÈRE VERSION DE CE GARDE-FOU EST PASSÉE AU VERT SUR LE DÉFAUT.  │
 * │                                                                          │
 * │ Elle cherchait `valeur={<StatValue`. Or la valeur d'une rangée est       │
 * │ souvent une TERNAIRE - « montant inconnu » d'un côté, le montant de      │
 * │ l'autre - et le composant s'y trouve trois lignes plus bas. Le balayage  │
 * │ ne voyait rien et déclarait l'écran conforme, sur celui-là même dont le  │
 * │ défaut venait d'être mesuré.                                             │
 * │                                                                          │
 * │ On compte donc les ACCOLADES pour délimiter la valeur du prop, et le     │
 * │ test qui suit vérifie que le balayage MORD sur les deux formes. C'est le │
 * │ même piège que le garde-fou des écritures en masse, où `\bqueryset\b`    │
 * │ ne mordait pas sur `self.get_queryset()`.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("l'échelle du cadran ne descend pas dans les rangées", () => {
  /**
   * Le contenu de chaque prop `valeur={...}` d'une rangée, accolades
   * équilibrées. Une ternaire, un fragment ou un appel y sont donc inclus.
   */
  function valeursDeRangee(code: string): string[] {
    const sortie: string[] = [];
    const marque = /\bvaleur=\{/g;
    let m: RegExpExecArray | null;
    while ((m = marque.exec(code)) !== null) {
      let profondeur = 1;
      let i = m.index + m[0].length;
      const debut = i;
      while (i < code.length && profondeur > 0) {
        if (code[i] === "{") profondeur += 1;
        else if (code[i] === "}") profondeur -= 1;
        i += 1;
      }
      sortie.push(code.slice(debut, i - 1));
    }
    return sortie;
  }

  /**
   * `MultiCurrencyTotal` mène au MÊME défaut par un autre chemin : il rend un
   * `StatValue` par défaut. Un balayage qui ne cherche que le nom du composant
   * le manque, et c'est ce qui est arrivé - il restait un solde client à
   * l'échelle du cadran dans la liste des contacts.
   */
  const aLEchelleDuCadran = (valeur: string): boolean =>
    valeur.includes("StatValue") ||
    (valeur.includes("MultiCurrencyTotal") && !valeur.includes('taille="mesure"'));

  it("le balayage MORD, sur la forme directe COMME sur la ternaire", () => {
    const directe = "<DataRow valeur={<StatValue value={x} />} />";
    const ternaire = [
      "<DataRow",
      "  valeur={",
      "    inconnu ? (",
      "      <Text>Montant inconnu</Text>",
      "    ) : (",
      "      <StatValue value={money.money(v.total, v.devise)} />",
      "    )",
      "  }",
      "/>",
    ].join("\n");
    expect(valeursDeRangee(directe).some(aLEchelleDuCadran)).toBe(true);
    // C'est CETTE forme que la première version manquait.
    expect(valeursDeRangee(ternaire).some(aLEchelleDuCadran)).toBe(true);
    expect(
      valeursDeRangee("<DataRow valeur={<Mesure value={x} />} />").some(aLEchelleDuCadran)
    ).toBe(false);
    // Et le second chemin, par le total multi-devises.
    expect(
      valeursDeRangee("<DataRow valeur={<MultiCurrencyTotal lignes={l} />} />").some(
        aLEchelleDuCadran
      )
    ).toBe(true);
    expect(
      valeursDeRangee('<DataRow valeur={<MultiCurrencyTotal lignes={l} taille="mesure" />} />').some(
        aLEchelleDuCadran
      )
    ).toBe(false);
    // Un `StatValue` hors d'une rangée reste légitime : c'est sa place.
    expect(valeursDeRangee("<CarteReleve><StatValue value={r.valeur} /></CarteReleve>")).toEqual([]);
  });

  it("aucune rangée ne rend un montant à l'échelle du cadran", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      if (valeursDeRangee(code).some(aLEchelleDuCadran)) {
        fautifs.push(relative(RACINE, f));
      }
    }
    // La mesure d'une rangée passe par `Mesure`, ou par un `Text` explicite.
    expect(fautifs).toEqual([]);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN RELEVÉ VIDE VAUT ZÉRO, ET ZÉRO EST UN MONTANT.                       │
 * │                                                                          │
 * │ Les cadrans écrivaient des PHRASES à la place du chiffre : « Aucune     │
 * │ vente », « Tout est réglé », « Rien en retard ». Un cadran se lit d'un   │
 * │ coup d'oeil, en balayant une colonne de montants ; une phrase casse ce   │
 * │ balayage, et deux cellules voisines ne se comparent plus. Elle occupe en │
 * │ outre la largeur d'un long montant, ce qui fait tomber la valeur d'un    │
 * │ palier de `statValueSize` dès qu'il y en a un.                          │
 * │                                                                          │
 * │ `MultiCurrencyTotal` rend donc « 0 $ » ou « 0 FC » par défaut, dans la   │
 * │ devise de l'établissement. Sept écrans l'écrivaient déjà à la main et    │
 * │ quatre non : c'est cette divergence que le défaut supprime.              │
 * │                                                                          │
 * │ `vide` reste permis pour le seul cas où l'absence ne veut PAS dire zéro  │
 * │ - le sous-total d'une journée dont toutes les ventes ont un montant      │
 * │ inconnu, où « 0 $ » affirmerait une recette nulle qu'on ignore.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("aucune phrase à la place d'un montant", () => {
  /** `vide="Aucune vente"` : un littéral qui contient des lettres. */
  const PHRASE = /\bvide=("|')[^"']*\p{L}[^"']*\1/u;

  it("aucun relevé n'écrit une phrase au lieu de zéro", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      const m = code.match(PHRASE);
      if (m) fautifs.push(`${relative(RACINE, f)} : ${m[0].slice(0, 50)}`);
    }
    // `MultiCurrencyTotal` rend le zéro dans la devise de l'établissement :
    // retirer le prop suffit. Voir sa docstring pour la seule exception.
    expect(fautifs).toEqual([]);
  });

  it("le garde-fou VOIT une phrase, et laisse passer le cas légitime", () => {
    expect(PHRASE.test('vide="Aucune vente"')).toBe(true);
    expect(PHRASE.test("vide='Tout est réglé'")).toBe(true);
    // Le sous-total d'une journée sans montant connu : rien ne s'écrit, et
    // surtout pas un zéro qui affirmerait une recette nulle.
    expect(PHRASE.test('vide=""')).toBe(false);
    // Un état vide de LISTE n'est pas un relevé : il a le droit de parler.
    expect(PHRASE.test("vide={{ icon: 'Receipt', titre: 'Aucune vente' }}")).toBe(false);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE DATE SE CHOISIT, ELLE NE SE TAPE PAS.                               │
 * │                                                                          │
 * │ Dix caractères dont deux tirets, sur un clavier où le tiret n'est pas    │
 * │ sous le doigt, pour une valeur que l'appareil connaît déjà. Et une faute │
 * │ de frappe ne se voit pas : « 2026-09-32 » a la bonne FORME, le contrôle  │
 * │ d'expression régulière la laisse passer, et c'est le serveur qui refuse  │
 * │ - après le voyage, avec un message de champ que l'écran doit retraduire. │
 * │                                                                          │
 * │ `ChampDate` ouvre le sélecteur du système, qui ne peut PAS produire de   │
 * │ date invalide, connaît les mois courts et les années bissextiles, et     │
 * │ accepte des bornes. C'est aussi ce que `<input type="date">` du          │
 * │ back-office fait sur un téléphone : la parité est dans le sélecteur.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("aucun jour fabriqué en UTC", () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ `new Date().toISOString().split("T")[0]` N'EST PAS LE JOUR D'ICI.    │
   * │                                                                      │
   * │ Kinshasa est à UTC+1 : à 23h30, le jour universel a déjà changé. Un  │
   * │ mouvement saisi à cette heure se rangerait au LENDEMAIN, et sortirait│
   * │ du rapport du jour où il a été fait. Ce dépôt a déjà payé ce piège   │
   * │ trois fois - sur les bornes des rapports, sur l'arrêté des créances, │
   * │ et sur une vingtaine de sites serveur en septembre.                  │
   * │                                                                      │
   * │ `jourISO` de `data/dates` construit le jour sur les composantes      │
   * │ LOCALES, et `dateDepuisJourISO` le relit de même.                    │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * ⚠ Un `toISOString()` ENTIER reste légitime : c'est ainsi qu'un horodatage
   * voyage vers le serveur. Seul son DÉCOUPAGE en jour est interdit.
   */
  const JOUR_EN_UTC = /\.toISOString\(\)\s*\.\s*(?:split|slice|substring|substr)\s*\(/;

  it("aucun fichier ne découpe un `toISOString()` pour en tirer un jour", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      const m = code.match(JOUR_EN_UTC);
      if (m) fautifs.push(`${relative(RACINE, f)} : ${m[0]}`);
    }
    // Employer `jourISO(d)`, qui lit les composantes locales.
    expect(fautifs).toEqual([]);
  });

  it("le garde-fou VOIT le découpage, et laisse passer l'horodatage entier", () => {
    // Sans cette vérification, un motif trop étroit passerait au vert sur le
    // défaut même qu'il existe pour attraper - ce dépôt s'est fait prendre
    // trois fois par un balayage qui ne balayait rien.
    expect(JOUR_EN_UTC.test('d.toISOString().split("T")[0]')).toBe(true);
    expect(JOUR_EN_UTC.test("d.toISOString().slice(0, 10)")).toBe(true);
    expect(JOUR_EN_UTC.test("new Date().toISOString().substring(0, 10)")).toBe(true);
    // Ce qui voyage entier n'est pas concerné.
    expect(JOUR_EN_UTC.test("occurred_at: o.occurredAt.toISOString()")).toBe(false);
    expect(JOUR_EN_UTC.test("jourISO(new Date())")).toBe(false);
  });
});

describe("aucune date saisie au clavier", () => {
  /** Un `placeholder` qui annonce un format de date : « AAAA-MM-JJ », « 2026-12-31 ». */
  const GABARIT_DATE = /placeholder=("|')\s*(AAAA-MM-JJ|JJ\/MM\/AAAA|\d{4}-\d{2}-\d{2})\s*\1/;

  it("aucun champ de texte ne demande une date", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      const m = code.match(GABARIT_DATE);
      if (m) fautifs.push(`${relative(RACINE, f)} : ${m[0]}`);
    }
    // Employer `ChampDate`, qui ouvre le sélecteur du système.
    expect(fautifs).toEqual([]);
  });

  it("le garde-fou VOIT un champ de date déguisé en texte", () => {
    // Sans cette vérification, resserrer le motif pourrait le rendre aveugle
    // sans que rien ne le signale.
    expect(GABARIT_DATE.test('<Input placeholder="AAAA-MM-JJ" />')).toBe(true);
    expect(GABARIT_DATE.test('<Input placeholder="2026-12-31" />')).toBe(true);
    // Un placeholder ordinaire n'est pas concerné.
    expect(GABARIT_DATE.test('<Input placeholder="Rechercher un client" />')).toBe(false);
    expect(GABARIT_DATE.test('<Input placeholder="0,00" />')).toBe(false);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE FEUILLE NE S'EMPILE PAS SUR UNE FEUILLE.                            │
 * │                                                                          │
 * │ `Sheet` est un `Modal` de React Native : en ouvrir un second par-dessus  │
 * │ donne un voile sur un voile, deux `onRequestClose` qui se disputent le   │
 * │ bouton retour d'Android, et sur certaines versions rien qui monte du     │
 * │ tout. La règle est écrite dans `sheet.tsx` depuis le lot 6 ; ce qui      │
 * │ manquait, c'est ce qui l'empêche de se reperdre.                         │
 * │                                                                          │
 * │ Car `ChampSelect` ouvre SA feuille. Il est donc juste sur un écran plein │
 * │ et faux dans un formulaire en feuille - les trois du stock -, où l'on    │
 * │ pose `DeclencheurSelect` et où l'on échange le panneau. Rien ne          │
 * │ distinguait les deux situations à la relecture, et le défaut ne se voit  │
 * │ pas au type-check : c'est du JSX parfaitement valide.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("aucune feuille dans une feuille", () => {
  /** Le fichier rend-il lui-même une feuille ? */
  function rendUneFeuille(code: string): boolean {
    return /<Sheet[\s>]/.test(code);
  }

  /** Le fichier pose-t-il un champ de choix qui ouvre SA propre feuille ? */
  function poseUnChampSelect(code: string): boolean {
    return /<ChampSelect[\s>]/.test(code);
  }

  it("aucun fichier ne pose un `ChampSelect` dans sa propre feuille", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      if (rendUneFeuille(code) && poseUnChampSelect(code)) {
        fautifs.push(relative(RACINE, f));
      }
    }
    // Le remède : `DeclencheurSelect` plus un panneau `ListeChoix` dans la
    // feuille déjà ouverte. Voir `features/stock/feuille-mouvement.tsx`.
    expect(fautifs).toEqual([]);
  });

  it("le garde-fou VOIT les deux ensemble, et laisse passer chacun seul", () => {
    // Sans cette vérification, une expression trop stricte passerait au vert
    // sur le défaut même qu'elle doit attraper - ce que ce dépôt a déjà payé
    // sur le balayage des écritures en masse.
    expect(rendUneFeuille("<Sheet ouvert onFermer={f}>")).toBe(true);
    expect(poseUnChampSelect("<ChampSelect valeur={v} />")).toBe(true);
    // `champ-select.tsx` lui-même rend la feuille SANS poser le champ : c'est
    // lui qui le définit, et il doit rester conforme.
    expect(poseUnChampSelect("export function ChampSelect({ valeur }) {")).toBe(false);
    // Un déclencheur n'ouvre rien : il est légitime dans une feuille.
    expect(poseUnChampSelect("<DeclencheurSelect libelle={l} />")).toBe(false);
  });
});

describe("aucun bandeau d'envoi sans issue", () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ANNONCER UNE ATTENTE SANS OFFRIR D'EN SORTIR EST UN CUL-DE-SAC.      │
   * │                                                                      │
   * │ Une vingtaine d'écrans écrivaient qu'une opération attendait son     │
   * │ envoi, et pas un ne proposait de l'envoyer : le marchand devait      │
   * │ deviner qu'il existe un écran « Synchronisation », le trouver dans   │
   * │ le tiroir, y aller, et revenir. Sur une feuille de comptage, revenir │
   * │ voulait dire perdre son filtre et sa position dans deux cents        │
   * │ lignes.                                                              │
   * │                                                                      │
   * │ Le remède est `BandeauEnvoi` de `features/sync/`, qui décide du      │
   * │ bouton depuis l'`EtatEnvoi` - et ne le pose JAMAIS sur un blocage,   │
   * │ où synchroniser ne sert à rien. Cette moitié-là de la règle est      │
   * │ tenue par `features/sync/bandeau.test.ts`.                           │
   * └──────────────────────────────────────────────────────────────────────┘
   */

  /** Le contenu de chaque `<Banner … />`, chevrons équilibrés. */
  function bandeaux(code: string): string[] {
    const sortie: string[] = [];
    let i = code.indexOf("<Banner");
    while (i !== -1) {
      let profondeur = 0;
      let j = i;
      for (; j < code.length; j++) {
        const c = code[j];
        if (c === "{") profondeur++;
        else if (c === "}") profondeur--;
        else if (c === ">" && profondeur === 0) break;
      }
      sortie.push(code.slice(i, j + 1));
      i = code.indexOf("<Banner", j + 1);
    }
    return sortie;
  }

  const ANNONCE_UN_ENVOI =
    /attend(?:ent)? (?:son|leur|un) envoi|en attente d(?:'|&apos;)envoi|pas encore envoy/i;
  const OFFRE_UNE_ISSUE = /\baction=\{/;

  it("aucun `Banner` littéral n'annonce une attente d'envoi sans action", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      for (const b of bandeaux(code)) {
        if (ANNONCE_UN_ENVOI.test(b) && !OFFRE_UNE_ISSUE.test(b)) {
          fautifs.push(relative(RACINE, f));
          break;
        }
      }
    }
    // Employer `<BandeauEnvoi envoi titre consequence />`, qui décide seul.
    expect(fautifs).toEqual([]);
  });

  it("le garde-fou VOIT le défaut, et laisse passer le remède", () => {
    // Sans cette vérification, un motif trop étroit passerait au vert sur le
    // défaut même qu'il existe pour attraper - ce dépôt s'est fait prendre
    // trois fois par un balayage qui ne balayait rien.
    const fautif = '<Banner tone="warning" title="Une opération attend son envoi" />';
    expect(bandeaux(fautif)).toHaveLength(1);
    expect(ANNONCE_UN_ENVOI.test(fautif)).toBe(true);
    expect(OFFRE_UNE_ISSUE.test(fautif)).toBe(false);

    expect(ANNONCE_UN_ENVOI.test('title="Ce retour attend son envoi"')).toBe(true);
    expect(ANNONCE_UN_ENVOI.test('title="Session créée, pas encore envoyée"')).toBe(true);

    // Un `BandeauEnvoi` n'est pas un `Banner` littéral : il décide seul.
    expect(bandeaux('<BandeauEnvoi envoi={e} titre="attend son envoi" />')).toEqual([]);
    // Un bandeau qui parle d'autre chose n'est pas concerné.
    expect(ANNONCE_UN_ENVOI.test('<Banner title="Le Z sort tout de suite" />')).toBe(false);
    // Et un bandeau qui offre son issue passe.
    expect(
      OFFRE_UNE_ISSUE.test(
        '<Banner title="attend son envoi" action={{ label: "x", onPress: f }} />'
      )
    ).toBe(true);
  });
});

describe("aucun détour par l'écran Synchronisation pour synchroniser", () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ON SYNCHRONISE SUR PLACE, DEPUIS L'ÉCRAN QUI L'ANNONCE.              │
   * │                                                                      │
   * │ `useSynchronisation().lancer("bandeau")` fait le cycle sans quitter  │
   * │ la page, et l'écran se relit tout seul. Y renvoyer par navigation    │
   * │ coûte un aller-retour, et sur une liste filtrée le retour ne ramène  │
   * │ ni le filtre ni la position.                                         │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * ⚠ L'écran reste une DESTINATION légitime : on y va pour VOIR l'état par
   * table et la file d'attente. C'est `navigation/menu.ts` qui porte cette
   * entrée de tiroir, et lui seul.
   */
  // ⚠ Pas `[^)]*` : le chemin porte lui-même une parenthèse (`/(app)/…`), et
  // la classe s'y arrête. Le test de morsure ci-dessous l'a attrapé.
  const NAVIGUE_VERS_LA_SYNC =
    /router\.(?:push|replace)\([^;]{0,160}appareil\/synchronisation/;

  it("aucun écran n'y navigue pour lancer un cycle", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const chemin = relative(RACINE, f);
      if (chemin === "navigation/menu.ts") continue;
      const code = sansCommentaires(readFileSync(f, "utf8"));
      if (NAVIGUE_VERS_LA_SYNC.test(code)) fautifs.push(chemin);
    }
    expect(fautifs).toEqual([]);
  });

  it("le garde-fou VOIT la navigation, et laisse passer l'entrée de menu", () => {
    expect(
      NAVIGUE_VERS_LA_SYNC.test('onPress: () => router.push("/appareil/synchronisation")')
    ).toBe(true);
    expect(
      NAVIGUE_VERS_LA_SYNC.test('router.replace("/(app)/appareil/synchronisation")')
    ).toBe(true);
    // Une entrée de menu déclare un `href`, elle ne navigue pas.
    expect(
      NAVIGUE_VERS_LA_SYNC.test('{ href: "/(app)/appareil/synchronisation" }')
    ).toBe(false);
  });
});

/**
 * Le registre d'icônes est DÉRIVÉ, et il doit le rester.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `Table` VIVAIT DANS LE FICHIER ENGENDRÉ, ET NULLE PART AILLEURS.        │
 * │                                                                          │
 * │ Il avait été ajouté à la main dans `icons/registre.ts`, contre la        │
 * │ consigne écrite en tête de ce fichier. La première régénération l'a      │
 * │ donc effacé, et `features/export/feuille-format` a cessé de compiler -   │
 * │ dans une commande dont l'auteur n'avait aucune raison de soupçonner      │
 * │ qu'elle RETIRAIT quelque chose.                                          │
 * │                                                                          │
 * │ Ce test compare les deux listes. Il n'exige pas de lancer le             │
 * │ générateur : il lit sa table de demandes et l'export du registre, ce qui │
 * │ suffit à voir une entrée qui n'existe que d'un côté.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("le registre d'icônes ne diverge pas de son générateur", () => {
  const registre = readFileSync(join(RACINE, "ui/icons/registre.ts"), "utf8");
  const generateur = readFileSync(
    resolve(RACINE, "../scripts/generer-registre-icones.mjs"),
    "utf8"
  );

  const demandes = new Set(
    (sansCommentaires(
      generateur.slice(
        generateur.indexOf("const DEMANDES"),
        generateur.indexOf("];", generateur.indexOf("const DEMANDES"))
      )
    ).match(/"([A-Za-z0-9]+)"/g) ?? []).map((m) => m.replaceAll('"', ""))
  );

  const importes = new Set(
    (registre.match(/^import (\w+) from "lucide-react-native\/icons\//gm) ?? []).map(
      (l) => l.replace(/^import (\w+).*/, "$1")
    )
  );

  it("le balayage MORD", () => {
    // Un balayage qui ne trouve rien passe et ne prouve rien : ce dépôt l'a
    // déjà payé sur `test_bulk_write_visibility` et `test_users_scope`.
    expect(demandes.size).toBeGreaterThan(50);
    expect(importes.size).toBeGreaterThan(50);
  });

  it("chaque icône du registre est DEMANDÉE par le générateur", () => {
    const orphelines = [...importes].filter((n) => !demandes.has(n));
    expect(orphelines).toEqual([]);
  });

  it("chaque icône demandée est bien dans le registre", () => {
    const manquantes = [...demandes].filter((n) => !importes.has(n));
    expect(manquantes).toEqual([]);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN FORMULAIRE D'AUTHENTIFICATION SE CENTRE, IL NE SE COLLE PAS EN HAUT. │
 * │                                                                          │
 * │ Ces écrans n'ont RIEN d'autre à l'écran : quatre champs de connexion sur │
 * │ un téléphone haut laissaient les deux tiers du bas vides, et le bloc     │
 * │ paraissait tombé là plutôt que posé. Le remède qui vient à l'esprit est  │
 * │ une marge de tête (`mt-10`, `pt-8`) : elle centre à l'oeil sur le        │
 * │ terminal de celui qui l'écrit, et décale tous les autres - c'est         │
 * │ exactement ce que les quatre écrans portaient.                           │
 * │                                                                          │
 * │ Le centrage appartient donc à `Screen`, qui connaît la hauteur réelle,   │
 * │ et non à l'écran, qui ne la connaît pas.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("le parcours d'authentification centre son contenu", () => {
  /** L'ouverture de chaque `<Screen …>`, attributs compris. */
  function balisesEcran(code: string): string[] {
    return [...code.matchAll(/<Screen\b[^>]*>/g)].map((m) => m[0]);
  }

  /**
   * `HorsLigneBloquant` porte son propre centrage (`flex-1 items-center
   * justify-center`), et c'est écrit dans son fichier : ajouter `centre` sur le
   * `Screen` qui l'enveloppe serait une redondance posée pour faire passer un
   * test. Les écrans de code PIN, eux, centrent à la main dans un `Screen` non
   * défilant, la pavé numérique ayant besoin de sa hauteur.
   */
  const centreAutrement = (code: string): boolean =>
    code.includes("justify-center") || code.includes("HorsLigneBloquant");

  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LA PRÉSENTATION N'EST PAS UN FORMULAIRE.                              │
   * │                                                                        │
   * │ Ce garde-fou vise les écrans dont le CONTENU EST LA PAGE : quatre      │
   * │ champs de connexion sur un téléphone haut, qui paraissent tombés là    │
   * │ plutôt que posés. `app/(auth)/bienvenue.tsx` est l'inverse - un pager  │
   * │ horizontal pleine hauteur, surmonté d'une barre et suivi d'un pied     │
   * │ fixe. Le centrer empêcherait son corps de remplir la fenêtre, donc de  │
   * │ paginer sur une page entière : le balayage s'arrêterait entre deux     │
   * │ vues. C'est chaque VUE qui centre son contenu, dans `carrousel.tsx`.   │
   * │                                                                        │
   * │ ⚠ L'EXCEPTION EST NOMMÉE PLUTÔT QU'IMPLICITE. Sans elle, le test       │
   * │ passerait quand même - les vues contiennent `justify-center`, que      │
   * │ `centreAutrement` accepte - mais il passerait PAR ACCIDENT, et le      │
   * │ jour où ce mot disparaîtrait du fichier voisin, un écran sans rapport  │
   * │ se retrouverait fautif. Ce dépôt a déjà payé trois fois le prix d'un   │
   * │ balayage vert pour une raison qui n'était pas la sienne.               │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const EXCEPTIONS = ["app/(auth)/bienvenue.tsx"];
  const exempte = (f: string): boolean =>
    EXCEPTIONS.some((e) => relative(RACINE, f).endsWith(e));

  it("l'exception nommée désigne un fichier qui existe", () => {
    // Une exception posée sur un chemin faux n'exempte rien et ne se voit
    // pas : elle laisse simplement le garde-fou crier ailleurs.
    for (const e of EXCEPTIONS) {
      expect(existsSync(join(RACINE, e))).toBe(true);
    }
  });

  it("aucun écran de connexion ou d'inscription ne laisse son contenu en haut", () => {
    const fautifs: string[] = [];
    let balayees = 0;

    for (const groupe of ["(auth)", "(locked)"]) {
      for (const f of fichiers(join(RACINE, "app", groupe))) {
        if (exempte(f)) continue;
        const code = sansCommentaires(readFileSync(f, "utf8"));
        for (const balise of balisesEcran(code)) {
          balayees += 1;
          if (!/\bcentre\b/.test(balise) && !centreAutrement(code)) {
            fautifs.push(`${relative(RACINE, f)} : ${balise}`);
          }
        }
      }
    }

    // Un balayage qui ne balaie rien passe au vert et ne prouve rien : c'est le
    // piège que ce dépôt a déjà payé trois fois.
    expect(balayees).toBeGreaterThan(4);
    expect(fautifs).toEqual([]);
  });

  it("aucune marge de tête ne rattrape le centrage à la main", () => {
    // `mt-10` sur le titre de la connexion et `pt-8` sur la reprise
    // d'enrôlement : les deux décalaient le bloc SOUS l'axe une fois le
    // centrage posé, et c'est la première chose qu'on remet par réflexe.
    const fautifs: string[] = [];
    for (const groupe of ["(auth)", "(locked)"]) {
      for (const f of fichiers(join(RACINE, "app", groupe))) {
        if (exempte(f)) continue;
        const code = sansCommentaires(readFileSync(f, "utf8"));
        const m = code.match(/\b(?:mt|pt|my|py)-(?:8|10|12|16|20|24)\b/);
        if (m) fautifs.push(`${relative(RACINE, f)} : ${m[0]}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("le balayage MORD sur un `Screen` non centré", () => {
    const nu = "<Screen scroll>";
    const centre = "<Screen scroll centre>";
    expect(balisesEcran(`${nu}<Text />`)).toEqual([nu]);
    expect(/\bcentre\b/.test(nu)).toBe(false);
    expect(/\bcentre\b/.test(centre)).toBe(true);
    // `centered`, `centre-ville` ou un `className` qui contient le mot ne
    // doivent pas être pris pour le prop : la frontière de mot les écarte, et
    // c'est un souligné qui avait fait passer le garde-fou des écritures en
    // masse sur le site même qu'il devait attraper.
    expect(/\bcentre\b/.test('<Screen className="items-center">')).toBe(false);
  });

  it("`Screen` apparie `flexGrow` et `justifyContent`, et il le faut", () => {
    const code = readFileSync(join(RACINE, "ui", "screen.tsx"), "utf8");
    // `justifyContent` SEUL, sur un conteneur dimensionné par son contenu, ne
    // centre jamais rien. Et sans `flexGrow`, un contenu plus haut que l'écran
    // n'aurait pas de quoi remplir son conteneur : la répartition d'espace
    // libre le décalerait hors du défilement, donc le haut du formulaire
    // deviendrait inatteignable.
    expect(code).toMatch(/flexGrow: 1, justifyContent: "center"/);
  });
});

describe("la synchronisation automatique ne s'impose pas", () => {
  const SYNC = join(RACINE, "features", "sync");
  const sources = fichiers(SYNC);

  it("le balayage balaie bien quelque chose", () => {
    // Un balayage qui ne trouve rien passe au vert et ne prouve rien : le
    // dépôt s'est déjà fait prendre trois fois.
    expect(sources.length).toBeGreaterThan(5);
  });

  it("aucun toast n'échappe à `doitNotifier`", () => {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ UNE ORIGINE AUTOMATIQUE NE PARLE JAMAIS.                        │
    // │                                                                  │
    // │ Cinq déclencheurs partent tout seuls. Si l'un d'eux annonçait    │
    // │ son résultat, un marchand en zone morte recevrait un bandeau     │
    // │ toutes les minutes, et un marchand connecté un « Synchronisation │
    // │ terminée » après chaque vente. À ce rythme on cesse de lire les  │
    // │ toasts, y compris celui qui comptait.                            │
    // └──────────────────────────────────────────────────────────────────┘
    // Le contrôle est à la LIGNE et non au fichier : un fichier qui garde un
    // toast et en laisse un autre nu passerait un contrôle par fichier, et
    // c'est exactement la forme que prendrait l'oubli.
    const fautifs: string[] = [];
    for (const f of sources) {
      const lignes = sansCommentaires(readFileSync(f, "utf8")).split("\n");
      lignes.forEach((ligne, i) => {
        if (!/toast\.(succes|erreur|info)\s*\(/.test(ligne)) return;
        if (!/doitNotifier\s*\(/.test(ligne)) fautifs.push(`${relative(RACINE, f)}:${i + 1}`);
      });
    }
    expect(fautifs).toEqual([]);
  });

  it("le balayage MORD sur un toast non gardé", () => {
    const garde = 'if (doitNotifier(depuis)) toast.succes("fini");';
    const nu = 'toast.succes("fini");';
    const appel = /toast\.(succes|erreur|info)\s*\(/;
    expect(appel.test(nu)).toBe(true);
    expect(/doitNotifier\s*\(/.test(nu)).toBe(false);
    expect(/doitNotifier\s*\(/.test(garde)).toBe(true);
  });

  it("aucune cadence par `setInterval`", () => {
    // Un intervalle qui dérive pendant qu'un cycle tourne empile les réveils,
    // et rien ne le signale : la cadence passe par un `setTimeout`
    // reprogrammé après chaque cycle, dont on connaît toujours le seul
    // exemplaire vivant.
    const fautifs = sources
      .filter((f) => /\bsetInterval\s*\(/.test(sansCommentaires(readFileSync(f, "utf8"))))
      .map((f) => relative(RACINE, f));
    expect(fautifs).toEqual([]);
  });

  it("le balayage MORD sur un `setInterval`", () => {
    expect(/\bsetInterval\s*\(/.test("const t = setInterval(tic, 1000);")).toBe(true);
    expect(/\bsetInterval\s*\(/.test("const t = setTimeout(tic, 1000);")).toBe(false);
  });

  it("aucun fichier ne pose un minuteur sans jamais en nettoyer aucun", () => {
    // Un `setTimeout` sans aucun `clearTimeout` dans le même fichier survit au
    // démontage : le fournisseur est démonté à CHAQUE verrouillage, et un
    // réveil orphelin solliciterait un contexte qui n'existe plus.
    //
    // ⚠ La portée de ce contrôle est le FICHIER, et il faut le dire : il
    // attrape un module qui ne nettoie jamais rien, pas un nettoyage oublié
    // parmi plusieurs. Mesuré : retirer UN `clearTimeout` sur trois le laisse
    // au vert. C'est le test du fournisseur qui juge le démontage réel.
    const fautifs: string[] = [];
    for (const f of sources) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      if (!/\bsetTimeout\s*\(/.test(code)) continue;
      if (!/\bclearTimeout\s*\(/.test(code)) fautifs.push(relative(RACINE, f));
    }
    expect(fautifs).toEqual([]);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CHAMP FACULTATIF QUE PERSONNE NE PASSE NE LÈVE RIEN.                  │
 * │                                                                          │
 * │ `ContexteTicket` déclarait `pointsGagnes` et `pointsRestants` depuis     │
 * │ l'origine, et aucun appelant ne les fournissait : le bloc fidélité du    │
 * │ ticket ne sortait QUE lorsque des points étaient dépensés, et le client  │
 * │ rattaché qui venait lire son cumul ne le trouvait nulle part.            │
 * │                                                                          │
 * │ Le type-check ne peut pas le voir - les deux champs sont facultatifs -   │
 * │ et la relecture du ticket non plus : il les lit correctement. Le défaut  │
 * │ est chez l'APPELANT, et il s'y voit par une absence.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("le ticket de vente annonce le cumul du client", () => {
  /** Le fichier compose-t-il le document d'une vente ? */
  function decritUnTicket(code: string): boolean {
    return /donneesTicketVente\(/.test(code);
  }

  /** Y passe-t-il le solde de points ? */
  function passeLeSolde(code: string): boolean {
    return /pointsRestants\s*:/.test(code);
  }

  it("tout appelant de `donneesTicketVente` passe `pointsRestants`", () => {
    const fautifs: string[] = [];
    let balayes = 0;
    for (const f of fichiers(RACINE)) {
      const chemin = relative(RACINE, f);
      // Le module qui DÉFINIT le contexte n'est pas un appelant.
      if (chemin.endsWith("features/pos/ticket.ts")) continue;
      if (chemin.includes(".test.")) continue;
      const code = sansCommentaires(readFileSync(f, "utf8"));
      if (!decritUnTicket(code)) continue;
      balayes += 1;
      if (!passeLeSolde(code)) fautifs.push(chemin);
    }
    // ⚠ Un balayage qui ne balaie RIEN passe au vert et ne prouve rien : ce
    // dépôt l'a déjà payé trois fois.
    expect(balayes).toBeGreaterThan(0);
    expect(fautifs).toEqual([]);
  });

  it("le garde-fou MORD sur un appelant muet, et laisse passer le bavard", () => {
    expect(decritUnTicket("donnees: donneesTicketVente({ reference, etat })")).toBe(true);
    expect(passeLeSolde("donnees: donneesTicketVente({ reference, etat })")).toBe(false);
    expect(passeLeSolde("pointsRestants: soldeApresVente(a, b, c),")).toBe(true);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA DÉCONNEXION N'A QU'UN SEUL CHEMIN, ET UNE SEULE MAIN EFFACE.         │
 * │                                                                          │
 * │ Se déconnecter d'un compte X puis se connecter avec un compte Y          │
 * │ FUSIONNAIT les deux établissements dans la même base : aucune table      │
 * │ tirée ne porte de colonne de locataire, et les curseurs de tirage de X   │
 * │ faisaient répondre « rien de neuf » sur des tables que Y n'avait jamais  │
 * │ tirées - son catalogue ne descendait donc jamais, sans le moindre        │
 * │ message.                                                                 │
 * │                                                                          │
 * │ Rien de tout cela ne se voit à l'exécution. Un `logout()` direct remis   │
 * │ dans un écran ne lève pas : il court-circuite simplement l'envoi et le   │
 * │ nettoyage, et le défaut revient sur le terminal d'un marchand.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("la déconnexion passe par un seul chemin", () => {
  /**
   * Deux exceptions, chacune pour une raison NOMMÉE.
   *
   * `session/provider.tsx` DÉFINIT `logout` : il n'en est pas un appelant.
   *
   * `app/(locked)/reprise.tsx` appelle `logout` à dessein, et passer par la
   * modale y serait un DÉFAUT : à cet instant la session est celle du nouveau
   * compte, et la file d'attente appartient à l'ancien. Synchroniser pousserait
   * les opérations de X sous le jeton de Y, c'est-à-dire exactement la fusion
   * qu'on ferme. On abandonne la session sans rien envoyer et sans rien
   * effacer, pour que l'ancien propriétaire puisse revenir.
   */
  const EXCEPTIONS = ["session/provider.tsx", "app/(locked)/reprise.tsx"];

  it("aucun écran ne prend `logout` de `useSession()`", () => {
    const fautifs: string[] = [];
    let balayes = 0;

    for (const f of fichiers(RACINE)) {
      const chemin = relative(RACINE, f);
      if (chemin.endsWith("session/deconnexion.tsx")) continue;
      if (EXCEPTIONS.some((e) => chemin.endsWith(e))) continue;
      const code = sansCommentaires(readFileSync(f, "utf8"));
      balayes += 1;
      // `const { …, logout } = useSession()` : la déstructuration est la seule
      // façon d'obtenir la fonction, et elle se reconnaît à son accolade.
      if (/\{[^}]*\blogout\b[^}]*\}\s*=\s*useSession\(\)/.test(code)) {
        fautifs.push(chemin);
      }
    }

    expect(balayes).toBeGreaterThan(50);
    expect(fautifs).toEqual([]);
  });

  it("une seule main efface la base locale", () => {
    const autorises = ["session/deconnexion.tsx", "session/provider.tsx"];
    const fautifs: string[] = [];
    let balayes = 0;

    for (const f of fichiers(RACINE)) {
      const chemin = relative(RACINE, f);
      // Le module qui la DÉFINIT n'est pas un appelant.
      if (chemin.endsWith("db/purge.ts")) continue;
      const code = sansCommentaires(readFileSync(f, "utf8"));
      balayes += 1;
      if (!/\bpurgerBaseLocale\b/.test(code)) continue;
      if (!autorises.some((a) => chemin.endsWith(a))) fautifs.push(chemin);
    }

    expect(balayes).toBeGreaterThan(50);
    expect(fautifs).toEqual([]);
  });

  /**
   * ⚠ LE VERDICT SUR LA BASE DOIT ÊTRE INÉVITABLE, PAS SEULEMENT HABITUEL.
   *
   * `enrollDevice` écrit l'instantané de session. Appelée en dehors du
   * fournisseur, elle le pose sans que `appliquerVerdictBase` ait rien dit : au
   * démarrage suivant, cet instantané se fait adopter par les données du compte
   * précédent, et les deux établissements fusionnent. Rien ne lève, rien ne
   * s'affiche - le catalogue du nouveau compte ne descend simplement jamais.
   *
   * `app/(auth)/inscription/etablissement.tsx` l'appelait ainsi, et c'est
   * pourquoi ce garde-fou existe plutôt qu'un commentaire.
   */
  it("`enrollDevice` n'est appelée que par le fournisseur de session", () => {
    const autorises = ["session/provider.tsx", "session/session.ts"];
    const fautifs: string[] = [];
    let balayes = 0;

    for (const f of fichiers(RACINE)) {
      const chemin = relative(RACINE, f);
      const code = sansCommentaires(readFileSync(f, "utf8"));
      balayes += 1;
      if (!/\benrollDevice\b/.test(code)) continue;
      if (!autorises.some((a) => chemin.endsWith(a))) fautifs.push(chemin);
    }

    expect(balayes).toBeGreaterThan(50);
    expect(fautifs).toEqual([]);
  });

  /**
   * ⚠ LA SESSION D'ABORD, LA BASE ENSUITE.
   *
   * Purger sous un comptoir monté réveille une cinquantaine de `useLecture` au
   * commit ; ils avalent leurs erreurs, donc les écrans ne plantent pas, ils se
   * VIDENT sous les yeux du marchand. Et la dissymétrie des pannes tranche :
   * tué entre les deux, on rouvre `anonymous` sur une base périmée que le filet
   * d'entrée rattrape ; dans l'ordre inverse, on rouvrirait `ready` sur une base
   * VIDE, sans rien pour le signaler.
   */
  it("le nettoyage abandonne la session AVANT de vider la base", () => {
    const code = sansCommentaires(
      readFileSync(join(RACINE, "session/deconnexion.tsx"), "utf8")
    );
    const session = code.indexOf("await logout()");
    const purge = code.indexOf("purgerBaseLocale()");
    expect(session).toBeGreaterThan(-1);
    expect(purge).toBeGreaterThan(-1);
    expect(session).toBeLessThan(purge);
  });
});

/**
 * Les noms de tables se DÉRIVENT du schéma, jamais recopiés.
 *
 * `db/schema/pulled.ts` est ENGENDRÉ par `pnpm db:pull-schema` depuis le
 * manifeste du serveur. Une liste tenue à la main dériverait à la prochaine
 * régénération, en silence, et une table oubliée par une purge referait
 * exactement le défaut que la purge existe pour corriger.
 */
describe("aucun nom de table écrit à la main", () => {
  it("hors du schéma, `src/db/` ne cite aucune table tirée", () => {
    // `db/tables` est PUR : il lit les modules de schéma, qui ne déclarent que
    // des tables. `db/client`, lui, ouvre SQLite au chargement ; il n'entre pas
    // dans ce fichier, et c'est ce qui permet de l'importer en tête.
    const noms = tablesTirees();
    expect(noms.length).toBeGreaterThan(30);

    const fautifs: string[] = [];
    let balayes = 0;
    for (const f of fichiers(join(RACINE, "db"))) {
      const chemin = relative(RACINE, f);
      if (chemin.includes("db/schema/")) continue;
      balayes += 1;
      const code = sansCommentaires(readFileSync(f, "utf8"));
      for (const n of noms) {
        if (new RegExp(`["'\`]${n}["'\`]`).test(code)) fautifs.push(`${chemin} : ${n}`);
      }
    }

    expect(balayes).toBeGreaterThan(2);
    expect(fautifs).toEqual([]);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PLAFOND D'ENCAISSEMENT RECOIT UNE CONVERSION BRUTE, JAMAIS ARRONDIE. │
 * │                                                                          │
 * │ `montantExigible` cherche le plus petit montant qui SOLDE la facture     │
 * │ dans la devise encaissee. Lui passer `convertMoney` detruit l'information│
 * │ dont il a besoin : 26 681 FC / 2300 vaut 11,60043..., et `convertMoney`  │
 * │ rend deja 11,60. Plafonner 11,60 rend 11,60, et le bouton « Encaisser »  │
 * │ se referme sur une vente qu'aucun montant en dollars ne peut solder.     │
 * │                                                                          │
 * │ Les deux fonctions ont la MEME signature : TypeScript ne voit rien, et   │
 * │ le defaut ne se decouvre qu'au comptoir, face a un client qui attend.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("le recalage du montant recu", () => {
  it("ne cable jamais une conversion ARRONDISSANTE sur `convertirBrut`", () => {
    const fautifs: string[] = [];
    let balayes = 0;

    for (const f of fichiers(RACINE)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      if (!/\bconvertirBrut\s*:/.test(code)) continue;
      balayes += 1;
      for (const m of code.matchAll(/\bconvertirBrut\s*:\s*([A-Za-z_$][\w$.]*)/g)) {
        if (/convertMoney$|convMoney$/.test(m[1])) {
          fautifs.push(`${relative(RACINE, f)} : ${m[1]}`);
        }
      }
    }

    // Un balayage qui ne balaie rien passe au vert et ne prouve rien.
    expect(balayes).toBeGreaterThan(0);
    expect(fautifs).toEqual([]);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PRÉSENTATION A DEUX SORTIES, ET UNE SEULE RANGE LE DRAPEAU.          │
 * │                                                                          │
 * │ « Passer » et « Commencer » mènent tous deux à la connexion. Si l'un des │
 * │ deux y naviguait sans écrire `accueil.vu`, la présentation reviendrait à │
 * │ CHAQUE lancement - et rien ne le signalerait : l'écran s'affiche         │
 * │ correctement, il est simplement de trop. Le défaut ne se voit qu'en      │
 * │ relançant l'application, ce qu'on ne fait pas en développement, où le    │
 * │ rechargement à chaud garde l'état.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("la présentation ne se montre qu'une fois", () => {
  const ECRAN = join(RACINE, "app/(auth)/bienvenue.tsx");

  /** Le corps d'une fonction, accolades équilibrées à partir de `marque`. */
  function corpsApres(code: string, marque: string): string {
    const debut = code.indexOf(marque);
    if (debut < 0) return "";
    let i = code.indexOf("{", debut + marque.length);
    if (i < 0) return "";
    let profondeur = 0;
    const ouverture = i;
    for (; i < code.length; i++) {
      if (code[i] === "{") profondeur += 1;
      else if (code[i] === "}") {
        profondeur -= 1;
        if (profondeur === 0) return code.slice(ouverture, i + 1);
      }
    }
    return "";
  }

  const NAV_CONNEXION = /router\.(?:push|replace)\(\s*["'`][^"'`]*\(auth\)\/login/g;

  it("le balayage MORD, et l'écran qu'il vise existe", () => {
    // Un balayage qui ne trouve rien passe au vert et ne prouve rien : ce
    // dépôt s'est déjà fait prendre trois fois.
    expect(existsSync(ECRAN)).toBe(true);
    expect(
      'router.replace("/(auth)/login");'.match(NAV_CONNEXION)
    ).toHaveLength(1);
    expect(corpsApres("const f = () => { a; };", "const f =")).toBe("{ a; }");
  });

  it("un seul chemin mène à la connexion, et il range le drapeau", () => {
    const code = sansCommentaires(readFileSync(ECRAN, "utf8"));

    // Deux navigations, c'est deux sorties à tenir en phase : la seconde
    // oubliera le drapeau, et ce sera celle que le marchand empruntera.
    expect(code.match(NAV_CONNEXION) ?? []).toHaveLength(1);

    const terminer = corpsApres(code, "const terminer =");
    expect(terminer).not.toBe("");
    expect(terminer).toMatch(/marquerAccueilVu\(\)/);
    expect(terminer.match(NAV_CONNEXION) ?? []).toHaveLength(1);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCRAN DE DÉMARRAGE PROLONGE LE SPLASH, IL NE LUI SUCCÈDE PAS.         │
 * │                                                                          │
 * │ Le splash natif se dimensionne par `imageWidth` dans `app.config.ts`,    │
 * │ que l'écran de démarrage recopie. Les laisser diverger rend un saut de   │
 * │ taille au moment précis où le splash se lève : l'œil le voit sans        │
 * │ pouvoir le nommer, et aucun type ne relie les deux fichiers.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("le raccord du splash", () => {
  const CONFIG = resolve(RACINE, "../app.config.ts");
  const DEMARRAGE = join(RACINE, "app/index.tsx");

  it("l'écran de démarrage rend le logo à la largeur du splash", () => {
    const splash = /imageWidth:\s*(\d+)/.exec(readFileSync(CONFIG, "utf8"));
    const ecran = /LARGEUR_DU_SPLASH\s*=\s*(\d+)/.exec(readFileSync(DEMARRAGE, "utf8"));
    // Sans ces deux assertions, un renommage ferait passer le test en
    // comparant `null` à `null`.
    expect(splash).not.toBeNull();
    expect(ecran).not.toBeNull();
    expect(ecran![1]).toBe(splash![1]);
  });

  it("les deux montrent le MÊME dessin", () => {
    // `logo.png` est un carré dont plus de la moitié est transparente :
    // l'employer d'un côté et l'encre recadrée de l'autre donnerait deux
    // tailles pour un même nombre.
    expect(readFileSync(CONFIG, "utf8")).toMatch(/images\/logo-trim\.png/);
  });

  it("l'écran de démarrage ne suit pas le thème", () => {
    // ⚠ `bg-splash` et non `bg-background`. Le fond du splash est clair dans
    // les DEUX thèmes, parce que le bleu du logo tombe à 1,6:1 sur `#0f0f11` :
    // suivre le thème rendrait un logo amputé en soirée, et ferait deux
    // ruptures au lieu d'une.
    expect(sansCommentaires(readFileSync(DEMARRAGE, "utf8"))).toMatch(/\bbg-splash\b/);
  });

  /**
   * ⚠ LE FOND DERRIÈRE LE LOGO EST TOUJOURS CELUI DE LA PAGE.
   *
   * `Logo` posait une plaque `bg-splash` - blanche dans les deux thèmes -
   * pour sauver sa lisibilité de nuit. Elle dessinait un carré blanc sur le
   * `#f3f4f6` de la page en thème clair et sur le `#0f0f11` en sombre : deux
   * couleurs qui ne sont celles d'aucune des deux pages.
   *
   * Le problème qu'elle réglait reste vrai et mesuré (bleu à 1,61:1, contour
   * noir à 1,01:1 sur `#0f0f11`), et la sortie est dans `ui/logo.tsx` : le
   * dessin ne se pose que sur un fond CLAIR, et le thème sombre reçoit le
   * mot-symbole en typographie. Ni plaque rapportée, ni logo amputé.
   *
   * ⚠ Ce test remplace un garde-fou qui exigeait l'inverse. Le laisser en
   * place l'aurait fait passer À VIDE : `plaque={false}` ayant disparu, sa
   * liste de fautifs restait vide sans plus rien démontrer.
   */
  it("aucune plaque d'une autre couleur ne se glisse sous le logo", () => {
    const fautifs: string[] = [];
    let balayes = 0;
    for (const f of fichiers(RACINE)) {
      const chemin = relative(RACINE, f);
      if (chemin.endsWith("ui/logo.tsx")) continue;
      const code = sansCommentaires(readFileSync(f, "utf8"));
      if (!/<Logo\b/.test(code)) continue;
      balayes += 1;
      // La prop a disparu : la revoir signerait le retour de la plaque.
      if (/\bplaque\b/.test(code)) fautifs.push(`${chemin} : prop \`plaque\``);
      // `fondClair` dit « cet écran est clair quel que soit le thème ». Le
      // seul dans ce cas est le démarrage, dont le fond EST `bg-splash`.
      if (/\bfondClair\b/.test(code) && !chemin.endsWith("app/index.tsx")) {
        fautifs.push(`${chemin} : \`fondClair\` hors de l'écran de démarrage`);
      }
      // Un `bg-splash` ailleurs que sur le fond du démarrage serait
      // précisément la plaque, sous un autre nom.
      if (/\bbg-splash\b/.test(code) && !chemin.endsWith("app/index.tsx")) {
        fautifs.push(`${chemin} : \`bg-splash\` employé comme plaque`);
      }
    }
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien.
    expect(balayes).toBeGreaterThan(1);
    expect(fautifs).toEqual([]);
  });

  it("le jeton `splash` vaut la même chose dans les deux thèmes", () => {
    // C'est tout son intérêt : un jeton qui suivrait le thème ne servirait à
    // rien ici, et `bg-white` est interdit par le garde-fou des couleurs.
    expect(PALETTES.light.splash).toBe(PALETTES.dark.splash);
  });
});

describe("la zone sûre du bas a un propriétaire, et un seul", () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ `edges={[]}` EST JUSTE DANS UN ONGLET ET FAUX PARTOUT AILLEURS.         │
   * │                                                                          │
   * │ Un écran d'ONGLET vit dans une scène que le navigateur dimensionne       │
   * │ AU-DESSUS de sa barre, et cette barre porte déjà `insets.bottom`         │
   * │ (`BottomTabBar`, l. 252). Un `Screen` qui y ajouterait sa propre marge    │
   * │ compterait la zone sûre deux fois : une bande vide au-dessus de la       │
   * │ barre.                                                                   │
   * │                                                                          │
   * │ Un écran de PILE n'a rien sous lui. `edges={[]}` y retire la SEULE       │
   * │ marge qui tienne son contenu au-dessus de la barre gestuelle, et sa      │
   * │ dernière ligne - le bouton « Enregistrer » de tous les formulaires -     │
   * │ devient inatteignable. C'est la classe de défaut rapportée par un        │
   * │ marchand, et elle ne se voit pas sur un émulateur à boutons logiciels.   │
   * │                                                                          │
   * │ Les deux erreurs sont SILENCIEUSES : l'écran s'affiche dans les deux     │
   * │ cas. D'où ce balayage.                                                   │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const ECRANS = join(RACINE, "app");

  /**
   * Les balises `<Screen …>` d'un fichier, une chaîne par balise.
   *
   * ⚠ ON NE PEUT PAS S'ARRÊTER AU PREMIER `>`. Un prop porte souvent une
   * fonction fléchée (`onPress={() => …}`) ou une comparaison, donc un `>`
   * qui n'est pas la fin de la balise. On suit la profondeur des accolades,
   * sinon le balayage coupe la balise en deux et ne voit plus `edges`.
   */
  function balisesScreen(code: string): string[] {
    const sortie: string[] = [];
    for (let i = code.indexOf("<Screen"); i !== -1; i = code.indexOf("<Screen", i + 1)) {
      // `<ScreenAutreChose` n'est pas notre composant.
      if (/[A-Za-z0-9]/.test(code[i + 7] ?? "")) continue;
      let profondeur = 0;
      for (let j = i; j < code.length; j++) {
        const c = code[j];
        if (c === "{") profondeur++;
        else if (c === "}") profondeur--;
        else if (c === ">" && profondeur === 0) {
          sortie.push(code.slice(i, j + 1));
          break;
        }
      }
    }
    return sortie;
  }

  const SANS_ZONE_SURE = /\bedges=\{\[\]\}/;

  it("le balayage trouve bien des `Screen` des deux côtés", () => {
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien : ce
    // dépôt l'a déjà payé trois fois.
    let onglets = 0;
    let piles = 0;
    for (const f of fichiers(ECRANS)) {
      const n = balisesScreen(readFileSync(f, "utf8")).length;
      if (relative(ECRANS, f).includes("(tabs)")) onglets += n;
      else piles += n;
    }
    expect(onglets).toBeGreaterThan(5);
    expect(piles).toBeGreaterThan(20);
  });

  it("tout écran d'onglet renonce à la zone sûre, que la barre porte déjà", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(ECRANS)) {
      const rel = relative(RACINE, f);
      if (!rel.includes("(tabs)")) continue;
      for (const b of balisesScreen(readFileSync(f, "utf8"))) {
        if (!SANS_ZONE_SURE.test(b)) fautifs.push(`${rel} : il manque edges={[]}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("aucun écran de pile ne renonce à sa zone sûre", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(ECRANS)) {
      const rel = relative(RACINE, f);
      if (rel.includes("(tabs)")) continue;
      for (const b of balisesScreen(readFileSync(f, "utf8"))) {
        if (SANS_ZONE_SURE.test(b)) {
          fautifs.push(`${rel} : edges={[]} hors d'un onglet, le bas passe sous la barre gestuelle`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("le balayage VOIT `edges` malgré une fonction fléchée dans la balise", () => {
    // Le piège : `=>` contient un `>`. En s'arrêtant au premier, la balise
    // serait coupée avant `edges` et le garde-fou deviendrait aveugle.
    const avecFleche = '<Screen onRefresh={() => void f()} edges={[]} padded={false}>';
    expect(balisesScreen(avecFleche)).toHaveLength(1);
    expect(SANS_ZONE_SURE.test(balisesScreen(avecFleche)[0])).toBe(true);
    expect(SANS_ZONE_SURE.test('<Screen scroll padded={false}>')).toBe(false);
  });
});

/**
 * L'abonnement se règle DANS l'application.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA DOCTRINE QUI JUSTIFIAIT LE NAVIGATEUR DÉCRIVAIT UN MÉCANISME QUI     │
 * │ N'EXISTE PAS.                                                            │
 * │                                                                          │
 * │ Elle affirmait que « le tunnel Moko est une page web hébergée », donc    │
 * │ qu'il fallait sortir vers le navigateur du système sous peine du motif   │
 * │ de refus 4.2 de l'App Store. Vérification faite, le checkout du          │
 * │ back-office est un formulaire REST suivi d'une confirmation USSD : il    │
 * │ n'y a aucune page à embarquer, donc aucun motif 4.2.                     │
 * │                                                                          │
 * │ Sortir coûtait cher : le marchand quittait l'application, devait s'y     │
 * │ reconnecter, et ne pouvait rien régler du tout si `EXPO_PUBLIC_WEB_URL`  │
 * │ manquait sur sa version - c'est-à-dire précisément quand sa caisse       │
 * │ venait de se bloquer.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("le paiement de l'abonnement ne sort pas de l'application", () => {
  const OUVERTURE_NAVIGATEUR = /openBrowserAsync|openAuthSessionAsync|Linking\.openURL/;

  it("le balayage voit bien les écrans d'abonnement", () => {
    // Un balayage qui ne balaie rien passe au vert sans rien démontrer.
    const vus = fichiers(RACINE).filter((f) => /abonnement|paiement/.test(f));
    expect(vus.length).toBeGreaterThan(2);
  });

  it("aucun écran d'abonnement n'ouvre un navigateur pour payer", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      if (!/abonnement|paiement/.test(f)) continue;
      const code = sansCommentaires(readFileSync(f, "utf8"));
      const m = code.match(OUVERTURE_NAVIGATEUR);
      if (m) fautifs.push(`${relative(RACINE, f)} : ${m[0]}`);
    }
    expect(fautifs).toEqual([]);
  });
});
