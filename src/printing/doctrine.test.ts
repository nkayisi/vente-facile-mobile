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
  const union = /"embedded"\s*\|\s*"bluetooth"\s*\|\s*"pdf"/;

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
  const avale = /catch\s*(\([^)]*\))?\s*\{[^}]*(return\s*\[\]|resolve\(\s*\[\s*\]\s*\))/;

  it("le balayage MORD : il voit bien les fichiers du Bluetooth", () => {
    expect(fichiers(BLUETOOTH).length).toBeGreaterThanOrEqual(6);
  });

  it("aucun `catch` ne rend une liste vide sous le pilote Bluetooth", () => {
    const fautifs: string[] = [];
    for (const f of fichiers(BLUETOOTH)) {
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
  const PILOTES = ["drivers/nyx.ts", "drivers/bluetooth/index.ts"];

  it("le balayage MORD : il voit bien les deux pilotes", () => {
    for (const chemin of PILOTES) {
      expect(readFileSync(resolve(PRINTING, chemin), "utf8").length).toBeGreaterThan(500);
    }
  });

  it.each(PILOTES)("%s dessine la page plutôt que de la réécrire", (chemin) => {
    const code = sansCommentaires(readFileSync(resolve(PRINTING, chemin), "utf8"));
    expect(code).toContain("rasterDuTicket");
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
