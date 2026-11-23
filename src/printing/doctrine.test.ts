/**
 * Garde-fous de doctrine de l'impression.
 *
 * Ce ne sont pas des tests de rendu mais des invariants de FICHIERS. Chacune de
 * ces règles a déjà été enfreinte, et aucune ne se voit à l'exécution : un
 * `catch { return [] }` a l'air prudent jusqu'à ce qu'on comprenne qu'il a
 * transformé un refus de permission en « Aucune imprimante trouvée », pendant
 * des mois, sur tous les terminaux à la fois.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(__dirname, "..");
const PRINTING = resolve(__dirname);

function fichiers(dir: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin));
    else if (
      (nom.endsWith(".ts") || nom.endsWith(".tsx")) &&
      !nom.endsWith(".test.ts") &&
      !nom.endsWith(".test.tsx")
    ) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

/** Le code, commentaires retirés : une règle citée dans un commentaire n'est pas une infraction. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("un seul fichier déclare les transports", () => {
  const union = /"embedded"\s*\|\s*"usb"\s*\|\s*"bluetooth"\s*\|\s*"reseau"\s*\|\s*"pdf"/;

  it("le balayage MORD : il voit bien des fichiers", () => {
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien. Le dépôt
    // a déjà payé ce piège trois fois.
    expect(fichiers(SRC).length).toBeGreaterThan(200);
  });

  it("l'union des transports n'est écrite qu'à UN endroit", () => {
    const porteurs = fichiers(SRC)
      .filter((f) => union.test(sansCommentaires(readFileSync(f, "utf8"))))
      .map((f) => relative(SRC, f));

    // `TransportId` et `Transport` étaient le MÊME ensemble écrit deux fois,
    // dans `driver.ts` et `preferences.ts` : c'est précisément ce qui permet à
    // deux listes de diverger. Surveiller la divergence serait plus faible que
    // n'avoir rien qui puisse diverger.
    expect(porteurs).toEqual(["printing/reglage.ts"]);
  });

  it("plus aucun transport `ble` : c'est devenu un lien, pas un moyen", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(PRINTING)) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      // On cherche la valeur de TRANSPORT, pas le mot : `lien: "gatt"` est sain.
      if (/transport\s*[=:!]==?\s*"ble"|id:\s*"ble"/.test(code)) {
        fautifs.push(relative(SRC, f));
      }
    }
    expect(fautifs).toEqual([]);
  });
});

describe("une panne se nomme, elle ne se rend pas en liste vide", () => {
  const BLUETOOTH = resolve(PRINTING, "drivers/bluetooth");
  const CABLE = resolve(PRINTING, "drivers/cable");
  const avale = /catch\s*(\([^)]*\))?\s*\{[^}]*(return\s*\[\]|resolve\(\s*\[\s*\]\s*\))/;

  it("le balayage MORD : il voit bien les fichiers du Bluetooth et du câble", () => {
    expect(fichiers(BLUETOOTH).length).toBeGreaterThanOrEqual(6);
    expect(fichiers(CABLE).length).toBeGreaterThanOrEqual(4);
  });

  it("aucun `catch` ne rend une liste vide sous les pilotes Bluetooth et câble", () => {
    const fautifs: string[] = [];
    for (const f of [...fichiers(BLUETOOTH), ...fichiers(CABLE)]) {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      if (avale.test(code)) fautifs.push(relative(SRC, f));
    }
    // C'EST LA CAUSE PREMIÈRE, prise par son symptôme. Sans permission,
    // `getBondedDevices()` lève ; un `catch { return [] }` rendait ce refus
    // système indiscernable d'une absence d'imprimante, et le marchand allait
    // chercher une panne de matériel.
    expect(fautifs).toEqual([]);
  });
});

describe("aucun nom de protocole n'atteint l'écran", () => {
  const ECRAN = resolve(SRC, "app/(app)/appareil/imprimante.tsx");
  // En capitales seulement : `lien === "spp"` est du code, « Bluetooth (BLE) »
  // est une phrase que personne ne devrait avoir à comprendre au comptoir.
  const jargon = /\b(SPP|GATT|BLE)\b/;

  it("l'écran Imprimante ne dit ni SPP, ni GATT, ni BLE", () => {
    const code = sansCommentaires(readFileSync(ECRAN, "utf8"));
    // Le marchand achète une imprimante, pas un protocole. Lui en faire
    // choisir un, c'est lui demander une information qu'il n'a pas.
    expect(jargon.test(code)).toBe(false);
  });
});

describe("toute imprimante reçoit LE MÊME document", () => {
  /**
   * Ce que cette règle protège, et elle a été payée : le Bluetooth recevait du
   * TEXTE de 32 colonnes quand l'imprimante intégrée recevait la page dessinée.
   * Pas de bandeau en vidéo inversée, pas de hiérarchie de police, accents
   * retirés, articles mis en page autrement. Chez un marchand qui a les deux
   * machines, la même vente sortait sur deux papiers différents - et c'est le
   * client qui les compare, un ticket dans chaque main.
   *
   * Rien ne le signalait : les deux tickets étaient corrects, chacun dans son
   * coin. Seul un garde-fou peut dire qu'ils doivent être LE MÊME.
   */
  const PILOTES = ["drivers/nyx.ts", "octets-escpos.ts"];
  /** Les pilotes ESC/POS passent tous par le même chemin d'octets. */
  const PILOTES_ESCPOS = [
    "drivers/bluetooth/index.ts",
    "drivers/cable/usb.ts",
    "drivers/cable/reseau.ts",
  ];

  it("le balayage MORD : il voit bien les pilotes", () => {
    for (const chemin of [...PILOTES, ...PILOTES_ESCPOS]) {
      expect(readFileSync(resolve(PRINTING, chemin), "utf8").length).toBeGreaterThan(500);
    }
  });

  it.each(PILOTES)("%s dessine la page plutôt que de la réécrire", (chemin) => {
    const code = sansCommentaires(readFileSync(resolve(PRINTING, chemin), "utf8"));
    expect(code).toContain("rasterDuTicket");
  });

  it.each(PILOTES_ESCPOS)("%s envoie les octets du chemin commun", (chemin) => {
    // Un pilote qui fabriquerait ses propres octets ferait un second ticket.
    const code = sansCommentaires(readFileSync(resolve(PRINTING, chemin), "utf8"));
    expect(code).toContain("octetsDuTicket");
    expect(code).not.toMatch(/rendreEscPos(Image)?\(/);
  });

  it("le module natif des imprimantes câblées n'est chargé que par UN module", () => {
    const appelants = fichiers(PRINTING)
      .filter((f) => sansCommentaires(readFileSync(f, "utf8")).includes('"ImprimanteCablee"'))
      .map((f) => relative(PRINTING, f));
    expect(appelants).toEqual(["drivers/cable/natif.ts"]);
  });

  it("le rastériseur natif n'est chargé que par UN module", () => {
    // Un second appelant, c'est une seconde façon de dessiner la page, donc
    // deux mises en page qui finissent par diverger.
    const appelants = fichiers(PRINTING)
      .filter((f) => sansCommentaires(readFileSync(f, "utf8")).includes('"TicketRaster"'))
      .map((f) => relative(PRINTING, f));
    expect(appelants).toEqual(["raster.ts"]);
  });
});

describe("le rastériseur ne dessine que la page", () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ UNE BARRE DE DÉFILEMENT S'IMPRIME.                                      │
   * │                                                                          │
   * │ `View.draw(Canvas)` n'appelle pas que le rendu du contenu : il appelle   │
   * │ aussi `onDrawScrollBars`. Une WebView a ses barres ACTIVES par défaut, et │
   * │ Chromium les réveille au chargement de la page ; elles restent visibles   │
   * │ 300 ms puis s'estompent sur 250 ms de plus, quand la capture a lieu 350   │
   * │ ms après `onPageFinished`. La barre verticale se retrouvait donc DANS le  │
   * │ bitmap, et le ticket sortait avec un trait noir continu sur tout son bord │
   * │ droit - relevé au comptoir, sur du papier.                                │
   * │                                                                          │
   * │ Rien ne pouvait le montrer autrement : le document, lui, est propre. Il a │
   * │ été rendu au navigateur et mesuré colonne par colonne - le plus long      │
   * │ trait vertical y fait 38 points, et c'est le bord du bandeau.             │
   * │                                                                          │
   * │ ⚠ CE GARDE-FOU LIT DU KOTLIN ET DU SWIFT DEPUIS JEST. C'est un pis-aller  │
   * │ assumé : aucune suite de ce dépôt n'exécute de code natif, et l'oubli ne  │
   * │ se verrait qu'au comptoir, sur un rouleau déjà consommé.                  │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const MODULES = resolve(SRC, "..", "modules", "ticket-raster");
  const ANDROID = join(
    MODULES,
    "android/src/main/java/expo/modules/ticketraster/TicketRasterModule.kt"
  );
  const IOS = join(MODULES, "ios/TicketRasterModule.swift");

  it("le balayage MORD : il voit bien les deux modules natifs", () => {
    for (const chemin of [ANDROID, IOS]) {
      expect(readFileSync(chemin, "utf8").length).toBeGreaterThan(2000);
    }
  });

  it("Android coupe ses deux barres de défilement avant de capturer", () => {
    const code = readFileSync(ANDROID, "utf8");
    expect(code).toContain("isVerticalScrollBarEnabled = false");
    expect(code).toContain("isHorizontalScrollBarEnabled = false");
  });

  it("iOS coupe ses deux indicateurs de défilement avant de capturer", () => {
    const code = readFileSync(IOS, "utf8");
    expect(code).toContain("showsVerticalScrollIndicator = false");
    expect(code).toContain("showsHorizontalScrollIndicator = false");
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SOCLE DU LOGO EXISTAIT DEPUIS LONGTEMPS, ET PERSONNE NE LE PASSAIT.  │
 * │                                                                          │
 * │ `core/receipt/identity.ts` émettait déjà un bloc `logo`, `render-html`   │
 * │ le rendait, `logoMaxHeight` suivait la largeur du papier, et le          │
 * │ back-office imprimait le sien. Seul `chromeDeLaSession` ne portait pas   │
 * │ le champ : une omission d'un mot, qu'aucun type ne signalait puisque     │
 * │ `logo` est facultatif. Le ticket sortait donc avec logo au bureau et     │
 * │ sans au comptoir, pour la même vente.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("le logo atteint bien le document", () => {
  const ticket = readFileSync(join(SRC, "features/pos/ticket.ts"), "utf8");

  it("le balayage MORD", () => {
    expect(ticket).toContain("export function chromeDeLaSession");
  });

  it("`chromeDeLaSession` porte le logo", () => {
    const corps = ticket.slice(ticket.indexOf("export function chromeDeLaSession"));
    const fin = corps.indexOf("\n}");
    expect(corps.slice(0, fin)).toMatch(/logo:/);
  });

  it("il est lu SANS attente, jamais chargé au moment d'imprimer", () => {
    // Un `await` ici ferait attendre le premier ticket devant un client.
    const corps = ticket.slice(ticket.indexOf("export function chromeDeLaSession"));
    const fin = corps.indexOf("\n}");
    expect(corps.slice(0, fin)).toMatch(/logoCourant\(\)/);
    expect(corps.slice(0, fin)).not.toMatch(/await/);
  });

  it("à défaut du logo de l'établissement, c'est celui de Vente Facile", () => {
    const corps = ticket.slice(ticket.indexOf("export function chromeDeLaSession"));
    const fin = corps.indexOf("\n}");
    expect(corps.slice(0, fin)).toMatch(/logoCourant\(\)\s*\?\?\s*LOGO_PLATEFORME/);
  });

  it("le logo de la plateforme est une constante PURE, engendrée", () => {
    // Il est importé par `ticket.ts`, que `ticket.test.ts` charge : un import de
    // la base ou de React y casserait deux suites, comme `logo-courant.ts` l'a
    // déjà fait.
    const constante = readFileSync(join(SRC, "printing/logo-plateforme.ts"), "utf8");
    const imports = [...constante.matchAll(/^\s*import[^;]*from\s+"([^"]+)"/gm)].map(
      (m) => m[1]
    );
    expect(imports).toEqual(["@vente-facile/core/receipt"]);
    expect(constante).toContain("FICHIER ENGENDRÉ");
    expect(constante).toMatch(/dataUrl:\s*\n?\s*"data:image\/png;base64,/);
  });

  it("l'état du logo reste PUR, et c'est une leçon payée", () => {
    // Première écriture : le hook vivait dans `logo-courant.ts`, donc ce
    // module importait `@/session/provider`, qui tire `@/db/client`, qui OUVRE
    // SQLite au chargement. `ticket.test.ts` et `proforma.test.ts` ont CESSÉ
    // de se lancer - deux suites entières, pour un import.
    //
    // ⚠ ON VISE L'IMPORT, PAS LE MOT. La docstring de ce module NOMME
    // `@/session/provider` pour expliquer pourquoi il l'exclut : un garde-fou
    // qui crie sur de la prose finit désactivé, et on perd le contrôle avec
    // lui. C'est la leçon déjà écrite sur le balayage des écritures en masse.
    const etat = readFileSync(join(SRC, "printing/logo-courant.ts"), "utf8");
    const imports = [...etat.matchAll(/^\s*import[^;]*from\s+"([^"]+)"/gm)].map(
      (m) => m[1]
    );
    expect(imports.filter((i) => /^@\/(session|db|data)\//.test(i))).toEqual([]);
    expect(imports).not.toContain("react");
  });

  it("il est chargé au démarrage du groupe applicatif", () => {
    // Sans cet appel, `logoCourant()` rendrait `null` pour toujours et le
    // socle resterait inerte - l'état exact d'avant ce lot.
    const layout = readFileSync(join(SRC, "app/(app)/_layout.tsx"), "utf8");
    expect(layout).toMatch(/useLogoDeLEtablissement\(\)/);
  });
});
