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
