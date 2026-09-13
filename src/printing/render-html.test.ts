/**
 * La page HTML du ticket, et surtout SA TAILLE.
 *
 * Ce fichier sert deux chemins qu'aucun test ne peut regarder sortir : le PDF
 * partagé au client, et le bitmap que le module natif envoie à l'imprimante
 * intégrée. Une page mal dimensionnée n'échoue nulle part - elle sort du
 * matériel, fausse, et personne ne le voit avant le comptoir.
 */
import { FONTS, leading, tokensFor, type Block } from "@vente-facile/core/receipt";

import { FAMILLE, hauteurDuDocument, mmEnPoints, pageDuTicket, rendreHtml } from "./render-html";

const ENTETE: Block[] = [
  { kind: "text", text: "NEKASHOP INC", role: "orgName", align: "center" },
  { kind: "band", text: "Reçu de vente" },
];

describe("Largeur de page", () => {
  it("demande la largeur du rouleau, jamais le format de bureau", () => {
    // 612 × 792 points est le défaut d'`expo-print` : US Letter. Le voir ici
    // voudrait dire que les dimensions ne sont pas passées.
    expect(pageDuTicket(ENTETE, 58).largeurPt).not.toBe(612);
    expect(pageDuTicket(ENTETE, 80).largeurPt).not.toBe(612);
  });

  it("convertit les millimètres en points à 72 par pouce", () => {
    // Mesure indépendante : 1 pouce = 25,4 mm = 72 points.
    expect(pageDuTicket(ENTETE, 58).largeurPt).toBe(Math.round((58 * 72) / 25.4));
    expect(pageDuTicket(ENTETE, 80).largeurPt).toBe(Math.round((80 * 72) / 25.4));
  });

  it("rend une page plus large sur un rouleau plus large", () => {
    expect(pageDuTicket(ENTETE, 80).largeurPt).toBeGreaterThan(
      pageDuTicket(ENTETE, 58).largeurPt
    );
  });
});

describe("Hauteur de page", () => {
  it("n'est jamais celle d'une feuille de bureau", () => {
    expect(pageDuTicket(ENTETE, 58).hauteurPt).not.toBe(792);
  });

  it("couvre au moins le texte qu'elle porte", () => {
    // Borne BASSE calculée ici, sans lire l'implémentation : chaque bloc de
    // texte occupe au minimum une ligne de son rôle, et la page porte ses deux
    // blancs de découpe. Une page plus courte que cette somme paginerait.
    const t = tokensFor(58);
    const plancher =
      t.topPadding + t.bottomPadding + leading(FONTS.orgName.size) + leading(FONTS.band.size);

    expect(hauteurDuDocument(ENTETE, 58)).toBeGreaterThan(plancher);
  });

  it("croît avec le contenu", () => {
    const court = hauteurDuDocument(ENTETE, 58);
    const long = hauteurDuDocument(
      [...ENTETE, { kind: "text", text: "Ligne de plus", role: "body" }],
      58
    );
    expect(long).toBeGreaterThan(court);
  });

  it("compte les lignes d'un nom qui se replie, et pas une seule", () => {
    const bref: Block[] = [{ kind: "text", text: "Sel", role: "body" }];
    const bavard: Block[] = [
      {
        kind: "text",
        text: "Etablissement Kalume et Fils SARL, avenue de la Liberation, Kinshasa Gombe",
        role: "body",
      },
    ];
    // Le repli est ce qui distingue une mesure d'une devinette : sans lui, les
    // deux documents feraient la même hauteur et le long serait coupé.
    expect(hauteurDuDocument(bavard, 58)).toBeGreaterThan(hauteurDuDocument(bref, 58) + 3);
  });

  it("replie moins sur un rouleau plus large", () => {
    const blocks: Block[] = [
      {
        kind: "text",
        text: "Etablissement Kalume et Fils SARL, avenue de la Liberation, Kinshasa Gombe",
        role: "body",
      },
    ];
    expect(hauteurDuDocument(blocks, 80)).toBeLessThan(hauteurDuDocument(blocks, 58));
  });

  it("arrondit la hauteur au point SUPÉRIEUR", () => {
    // Vers le bas, la page paginerait : le client repartirait avec deux
    // morceaux de ticket.
    const page = pageDuTicket(ENTETE, 58);
    expect(page.hauteurPt).toBeGreaterThanOrEqual(mmEnPoints(hauteurDuDocument(ENTETE, 58)));
    expect(Number.isInteger(page.hauteurPt)).toBe(true);
  });
});

describe("Feuille de style", () => {
  const css = (w: 58 | 80) => rendreHtml(ENTETE, w);

  it("borne la boîte du corps à la largeur du papier", () => {
    // Sans `border-box`, la largeur plus les deux blancs latéraux déborde de
    // la page : la colonne des montants tombe hors du papier.
    expect(css(58)).toContain("box-sizing:border-box");
    expect(css(58)).toContain("width:58mm");
    expect(css(80)).toContain("width:80mm");
  });

  it("tire ses corps et ses interlignes des jetons partagés", () => {
    const html = css(58);
    for (const role of Object.keys(FONTS) as (keyof typeof FONTS)[]) {
      expect(html).toContain(`font-size:${FONTS[role].size}pt`);
      expect(html).toContain(`line-height:${leading(FONTS[role].size)}mm`);
    }
  });

  it("tire ses blancs verticaux des jetons partagés", () => {
    const t = tokensFor(58);
    const html = css(58);
    expect(html).toContain(`${t.topPadding}mm`);
    expect(html).toContain(`height:${t.space.lg}mm`);
  });
});

describe("Blanc latéral", () => {
  /**
   * La bande réellement chauffée, mesurée depuis le MATÉRIEL : 384 points sur
   * 58 mm et 576 sur 80, à 203 points par pouce. C'est contre elle qu'on juge
   * la marge, pas contre elle-même.
   */
  const bande = (papier: 58 | 80) => ((papier === 80 ? 576 : 384) / 203) * 25.4;

  for (const papier of [58, 80] as const) {
    it(`laisse au contenu l'essentiel de l'encre sur ${papier} mm`, () => {
      const html = rendreHtml(ENTETE, papier);
      const marge = Number(/padding:[\d.]+mm ([\d.]+)mm/.exec(html)?.[1]);
      expect(Number.isFinite(marge)).toBe(true);

      // La page est mise à l'échelle exacte de la bande : la part du contenu
      // dans la page EST sa part dans l'encre.
      const part = (papier - marge * 2) / papier;
      expect(part).toBeGreaterThan(0.97);

      // Le blanc TOTAL par côté, mécanique compris. Cinq millimètres sont
      // hors d'atteinte sur 58 mm, quatre sur 80 ; on vérifie qu'on n'ajoute
      // pas plus de trois quarts de millimètre d'encre perdue à ce plancher.
      const blancTotal = (papier - part * bande(papier)) / 2;
      const plancher = (papier - bande(papier)) / 2;
      expect(blancTotal - plancher).toBeLessThan(0.75);
    });

    it(`garde un blanc de sécurité non nul sur ${papier} mm`, () => {
      const marge = Number(
        /padding:[\d.]+mm ([\d.]+)mm/.exec(rendreHtml(ENTETE, papier))?.[1]
      );
      expect(marge).toBeGreaterThan(0);
    });
  }

  it("échappe ce que le marchand a saisi", () => {
    const html = rendreHtml([{ kind: "text", text: "Kalume & <Fils>", role: "body" }], 58);
    expect(html).toContain("Kalume &amp; &lt;Fils&gt;");
    expect(html).not.toContain("<Fils>");
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA POLICE EST UN RÉGLAGE DE LISIBILITÉ, PAS UN DÉTAIL DE STYLE.         │
 * │                                                                          │
 * │ La page de 58 mm est rastérisée sur les 48 mm que la tête chauffe, soit  │
 * │ 83 % : un corps de 9 pt sort à 7,4, une mention légale de 7 pt à 5,8. À  │
 * │ 203 points par pouce, le fût d'une police fine y vaut moins d'un point   │
 * │ de chauffe : la WebView le rend en gris d'anticrénelage et le seuillage  │
 * │ de `printBitmap` l'écarte. Courier New, dessiné pour la frappe au ruban, │
 * │ est le pire choix possible - et c'est celui qui était demandé.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("Police du ticket", () => {
  const style = rendreHtml([{ kind: "space", size: "sm" }], 58);

  it("ne demande plus Courier New, la plus fine des monospaces", () => {
    expect(style).not.toContain("Courier");
  });

  it("est FIGÉE, et chaque entrée tient l'avance de 0,6 cadratin", () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ CE TEST N'EST PAS UN TEST DE GOÛT.                                  │
    // │                                                                      │
    // │ `CHASSE = 0.6` est l'hypothèse dont dépendent le nombre de colonnes, │
    // │ le repli, les couples libellé / montant ET `hauteurDuDocument`. Une  │
    // │ proportionnelle glissée dans la pile rendrait la hauteur fausse EN   │
    // │ SILENCE, et une page sous-estimée ne tronque pas : elle PAGINE.      │
    // │                                                                      │
    // │ Les cinq familles retenues sont à 0,600 ou 0,602. On les fige donc   │
    // │ nommément, pour qu'une sixième ne s'y ajoute pas sans être vérifiée. │
    // └──────────────────────────────────────────────────────────────────────┘
    expect(FAMILLE).toBe('"Roboto Mono","Noto Sans Mono","DejaVu Sans Mono",Menlo,monospace');
    // `monospace` FERME la pile : c'est le seul nom garanti sur les deux
    // plateformes, et sans lui un terminal sans aucune des quatre premières
    // retomberait sur la police par défaut du système, qui est proportionnelle.
    expect(FAMILLE.endsWith("monospace")).toBe(true);
    expect(style).toContain(`font-family:${FAMILLE}`);
  });

  it("n'écrit aucun gris : une tête thermique n'a qu'un état par point", () => {
    // Un gris y est TRAMÉ, donc rendu en points espacés, ou écarté au
    // seuillage. Appliqué au pied de ticket en 7 pt, il donnait la ligne la
    // moins visible du document.
    const gris = style.match(/color:#(?!000\b)[0-9a-f]{3,6}/gi) ?? [];
    // Le blanc du bandeau en vidéo inversée est la seule couleur non noire, et
    // elle est posée sur du noir : elle ne se dilue pas.
    expect(gris.filter((c) => !/#fff/i.test(c))).toEqual([]);
  });
});
