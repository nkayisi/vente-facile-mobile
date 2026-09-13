/**
 * L'encodage ESC/POS.
 *
 * Ce que ces tests protègent : qu'un ticket parti sur une imprimante Bluetooth
 * porte EXACTEMENT le texte que la mise en page a décidé. Un encodage qui
 * réaligne, retronque ou réordonne de son côté ferait diverger le papier du
 * terminal et le papier de l'imprimante sans fil, et rien ne le signalerait.
 */
import type { Block } from "@vente-facile/core/receipt";

import ReceiptPrinterEncoder from "@point-of-sale/receipt-printer-encoder";

import { rendreEscPos, rendreEscPosImage } from "./render-escpos";
import { rendreTexte, type LigneImprimee } from "./render-text";

const ESC = 0x1b;
const GS = 0x1d;

const octets = (lignes: LigneImprimee[]) => rendreEscPos(lignes);
const texte = (flux: Uint8Array) => String.fromCharCode(...flux);
/**
 * Nombre d'espaces du flux.
 *
 * Les octets de commande s'intercalent entre le remplissage et le texte
 * (`ESC t 0`, la sélection de page de code, tombe juste avant), si bien qu'une
 * comparaison de sous-chaîne échoue sur un flux pourtant correct. Sur un
 * document d'UNE ligne, compter les espaces mesure exactement la marge.
 */
const espaces = (flux: Uint8Array) => flux.filter((o) => o === 0x20).length;

const contient = (flux: Uint8Array, sequence: number[]) => {
  for (let i = 0; i <= flux.length - sequence.length; i += 1) {
    if (sequence.every((o, j) => flux[i + j] === o)) return true;
  }
  return false;
};

describe("Flux ESC/POS", () => {
  it("initialise l'imprimante, sinon elle hérite de l'état du ticket précédent", () => {
    // ESC @ : un ticket imprimé après un titre doublé sortirait sinon en double.
    expect(contient(octets([{ text: "Bonjour" }]), [ESC, 0x40])).toBe(true);
  });

  it("coupe le papier en fin de ticket, et sait ne pas le faire", () => {
    expect(contient(octets([{ text: "x" }]), [GS, 0x56])).toBe(true);
    expect(contient(rendreEscPos([{ text: "x" }], { cut: false }), [GS, 0x56])).toBe(false);
  });

  it("ouvre ET referme le gras : sans la fermeture, tout le ticket suivrait", () => {
    const flux = octets([{ text: "TOTAL", bold: true }, { text: "suite" }]);
    expect(contient(flux, [ESC, 0x45, 0x01])).toBe(true);
    expect(contient(flux, [ESC, 0x45, 0x00])).toBe(true);
  });

  it("revient à l'échelle simple après une ligne doublée", () => {
    const flux = octets([{ text: "RECU", scale: 2 }, { text: "suite" }]);
    expect(contient(flux, [GS, 0x21, 0x00])).toBe(true);
  });
});

describe("Fidélité à la mise en page", () => {
  const document: Block[] = [
    { kind: "text", text: "NEKASHOP INC", role: "orgName", align: "center" },
    { kind: "band", text: "Reçu de vente" },
    {
      kind: "items",
      rows: [
        {
          name: "AERIUS 0.5 MG/ SP 60ML",
          quantity: "2",
          unitPrice: "11 049.20",
          total: "22 098.40",
        },
      ],
    },
    { kind: "amounts", rows: [{ label: "Total", value: "22 098.40 CDF", strong: true }] },
  ];

  it("porte chaque ligne mise en page, dans l'ordre et sans la retoucher", () => {
    const lignes = rendreTexte(document);
    const sorti = texte(rendreEscPos(lignes));

    for (const ligne of lignes) {
      // Une ligne centrée ou doublée est complétée d'espaces à gauche : on
      // compare donc le contenu, pas le remplissage.
      expect(sorti).toContain(ligne.text.trimEnd());
    }
  });

  it("centre un titre DOUBLÉ sur la largeur réelle, pas sur la moitié", () => {
    // « RECU » doublé occupe 8 colonnes sur 42 : il reste 34, donc 17 de marge.
    // Un calcul naïf en « colonnes utiles » (21) n'en mettrait que 8 et
    // planterait le titre au quart du ticket. Le remplissage est en chasse
    // SIMPLE devant un texte en chasse double : les deux se mélangent dans le
    // flux, jamais dans une même chaîne, ce qu'on ne saurait pas faire ici.
    // « RECU » doublé occupe 8 colonnes sur 32 : il reste 24, donc 12 de marge.
    expect(espaces(rendreEscPos([{ text: "RECU", align: "center", scale: 2 }]))).toBe(12);
    // Le même titre en chasse simple occupe 4 colonnes : 14 de marge.
    expect(espaces(rendreEscPos([{ text: "RECU", align: "center" }]))).toBe(14);
  });

  it("aligne à droite sur la largeur réelle", () => {
    // « 9 000 » doublé occupe 10 colonnes sur 32 : 22 de marge, plus le 1
    // espace que porte le nombre lui-même.
    expect(espaces(rendreEscPos([{ text: "9 000", align: "right", scale: 2 }]))).toBe(23);
  });

  it("pose l'initialisation AVANT tout remplissage d'alignement", () => {
    // Mesuré : une première ligne centrée sans rien devant sort son
    // remplissage avant le `ESC @`, que l'imprimante traite comme une remise à
    // zéro. Le titre partait alors collé à gauche.
    const flux = rendreEscPos([{ text: "NEKASHOP", align: "center" }]);
    expect(flux[0]).toBe(ESC);
    expect(flux[1]).toBe(0x40);
  });
});


describe("Les deux largeurs de rouleau", () => {
  const DOCUMENT: Block[] = [
    { kind: "text", text: "NEKASHOP INC", role: "orgName", align: "center" },
    { kind: "band", text: "Reçu de vente" },
    { kind: "amounts", rows: [{ label: "Net à payer", value: "12 500 FC", strong: true }] },
  ];

  it("encode un ticket de 80 mm sans lever", () => {
    // Avant correctif, `colonnesPour(80)` rendait 57 et l'encodeur levait dès
    // son constructeur : plus AUCUN ticket ne sortait en Bluetooth ni en BLE,
    // et le caissier lisait le message anglais de la bibliothèque à chaque
    // vente. Le bouton « réessayer » ne pouvait jamais réussir.
    const lignes = rendreTexte(DOCUMENT, { paperWidth: 80 });
    expect(() => rendreEscPos(lignes, { paperWidth: 80 })).not.toThrow();
  });

  it("l'encodeur refuse bien 57 colonnes : c'est le fait que le garde-fou nomme", () => {
    // Contrôle POSITIF de l'hypothèse sur laquelle repose `colonnesPour` et le
    // garde-fou de `render-escpos`. Si une version future de la bibliothèque
    // élargissait sa liste, ce test tomberait et il faudrait rouvrir le choix
    // des colonnes plutôt que de continuer à s'interdire une valeur permise.
    expect(
      () => new ReceiptPrinterEncoder({ language: "esc-pos", columns: 57 })
    ).toThrow();
    expect(
      () => new ReceiptPrinterEncoder({ language: "esc-pos", columns: 48 })
    ).not.toThrow();
  });

  it("garde la police LARGE sur les deux rouleaux, celle qui se lit", () => {
    // ESC M n : 0 = police A (12 points de chasse, 32 colonnes sur 58 mm),
    // 1 = police B (9 points, 42 colonnes).
    //
    // La police B a servi tant que la mise en page tenait 42 colonnes. Le
    // premier ticket ESC/POS réellement imprimé - une T58_9345 en Bluetooth,
    // le 13 septembre 2026 - l'a écartée : ses glyphes font à peine plus d'un
    // millimètre, et le marchand ne pouvait pas lire son ticket.
    const en58 = rendreEscPos(rendreTexte(DOCUMENT, { paperWidth: 58 }), { paperWidth: 58 });
    const en80 = rendreEscPos(rendreTexte(DOCUMENT, { paperWidth: 80 }), { paperWidth: 80 });

    expect(contient(en58, [ESC, 0x4d, 0x01])).toBe(false);
    expect(contient(en80, [ESC, 0x4d, 0x01])).toBe(false);
  });

  it("n'élargit pas la mise en page en changeant de police", () => {
    // `encodeur.font("B")` change AUSSI la largeur que l'encodeur s'attribue :
    // mesuré, 42 colonnes devenaient 56 et le remplissage d'un titre centré
    // passait de 17 à 24 espaces, donc hors du papier. Si une police devait
    // revenir, elle passerait par ESC M brut. Ce test interdit l'autre chemin.
    expect(espaces(rendreEscPos([{ text: "RECU", align: "center", scale: 2 }]))).toBe(12);
  });

  it("une ligne VIDE coûte le même papier qu'une ligne de texte", () => {
    // `text("").newline()` avance le papier DEUX fois : l'encodeur ferme la
    // ligne courante dès qu'on lui donne une chaîne, fût-elle vide, et
    // `newline()` en ajoute une autre. Chaque respiration d'un ticket faisait
    // donc DOUBLE hauteur, sur toute sa longueur.
    const sauts = (o: Uint8Array) => [...o].filter((b) => b === 0x0a).length;
    const rendu = (lignes: { text: string }[]) =>
      sauts(rendreEscPos(lignes, { paperWidth: 58, cut: false, feedBeforeCut: 0 }));

    const base = rendu([{ text: "A" }]);
    expect(rendu([{ text: "A" }, { text: "B" }]) - base).toBe(1);
    expect(rendu([{ text: "A" }, { text: "" }]) - base).toBe(1);
  });

  it("n'ajoute AUCUNE avance sur une imprimante sans massicot", () => {
    // Mesuré à la règle sur une T58_9345 : le blanc de fin fait 2 à 3 cm alors
    // que notre flux n'en pose qu'un peu plus d'un. La machine déroule seule
    // jusqu'à sa barre de déchirure, et nos lignes s'y ajoutaient pour rien.
    const sauts = (o: Uint8Array) => [...o].filter((b) => b === 0x0a).length;
    const sansCoupe = rendreEscPos([{ text: "Total" }], { cut: false });
    const sansRien = rendreEscPos([{ text: "Total" }], { cut: false, feedBeforeCut: 0 });

    expect(sauts(sansCoupe)).toBe(sauts(sansRien));
    // Le réglage reste honoré si on le passe : c'est par là que se traiterait
    // une imprimante qui, elle, n'avancerait pas.
    const force = rendreEscPos([{ text: "Total" }], { cut: false, feedBeforeCut: 3 });
    expect(sauts(force) - sauts(sansRien)).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* La page dessinée                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Les commandes `GS v 0` du flux, lues DANS L'ORDRE.
 *
 * ⚠ On ne cherche PAS toutes les occurrences de `1D 76 30 00` : la charge utile
 * d'une image en contient par hasard, et un balayage naïf inventerait des
 * bandes. On lit donc la première, puis on saute exactement sa charge utile,
 * comme le ferait l'imprimante.
 */
function bandes(flux: Uint8Array) {
  const out: { parRangee: number; rangees: number; donnees: Uint8Array }[] = [];
  let i = flux.findIndex(
    (_, k) =>
      flux[k] === GS && flux[k + 1] === 0x76 && flux[k + 2] === 0x30 && flux[k + 3] === 0x00
  );
  while (
    i >= 0 &&
    flux[i] === GS &&
    flux[i + 1] === 0x76 &&
    flux[i + 2] === 0x30 &&
    flux[i + 3] === 0x00
  ) {
    const parRangee = flux[i + 4] | (flux[i + 5] << 8);
    const rangees = flux[i + 6] | (flux[i + 7] << 8);
    const debut = i + 8;
    out.push({ parRangee, rangees, donnees: flux.slice(debut, debut + parRangee * rangees) });
    i = debut + parRangee * rangees;
  }
  return out;
}

/** Un raster dont chaque octet est unique modulo 256 : un décalage se voit. */
function raster(largeur: number, hauteur: number) {
  const parRangee = Math.ceil(largeur / 8);
  const points = new Uint8Array(parRangee * hauteur);
  for (let i = 0; i < points.length; i += 1) points[i] = (i * 7 + 1) & 0xff;
  return { largeur, hauteur, points };
}

describe("Flux ESC/POS d'une page dessinée", () => {
  it("initialise avant tout, sinon l'image hérite de l'alignement du ticket précédent", () => {
    // `ESC @` remet aussi l'alignement à gauche, ce dont l'image dépend : la
    // page fait EXACTEMENT la largeur de la tête, un centrage la décalerait.
    const flux = rendreEscPosImage(raster(384, 8));
    expect(contient(flux, [ESC, 0x40])).toBe(true);
    const debutImage = flux.findIndex(
      (_, k) => flux[k] === GS && flux[k + 1] === 0x76 && flux[k + 2] === 0x30
    );
    const debutInit = flux.findIndex((_, k) => flux[k] === ESC && flux[k + 1] === 0x40);
    expect(debutInit).toBeLessThan(debutImage);
  });

  it("compte des OCTETS par rangée et des RANGÉES, jamais des points", () => {
    // Les confondre rend une image huit fois trop large, et l'imprimante n'en
    // dit rien : elle imprime ce qu'on lui donne.
    const [bande] = bandes(rendreEscPosImage(raster(384, 8)));
    expect(bande.parRangee).toBe(48);
    expect(bande.rangees).toBe(8);
  });

  it("découpe en bandes : une seule commande de 48 Ko se perd sur une 58 mm", () => {
    const bandesLues = bandes(rendreEscPosImage(raster(384, 300), { bande: 128 }));
    expect(bandesLues.map((b) => b.rangees)).toEqual([128, 128, 44]);
  });

  it("recolle EXACTEMENT le raster : un octet perdu est une ligne qui glisse", () => {
    const source = raster(384, 300);
    const lues = bandes(rendreEscPosImage(source, { bande: 128 }));
    const recolle = new Uint8Array(source.points.length);
    let offset = 0;
    for (const b of lues) {
      recolle.set(b.donnees, offset);
      offset += b.donnees.length;
    }
    expect(offset).toBe(source.points.length);
    expect(Array.from(recolle)).toEqual(Array.from(source.points));
  });

  it("coupe le papier, ou déroule, comme le chemin texte", () => {
    // GS V : le massicot. Le réglage vit dans la même clé pour les deux chemins,
    // une machine sans lame ne doit pas recevoir la commande d'un côté et pas
    // de l'autre.
    expect(contient(rendreEscPosImage(raster(384, 8)), [GS, 0x56])).toBe(true);
    expect(contient(rendreEscPosImage(raster(384, 8), { cut: false }), [GS, 0x56])).toBe(false);
  });

  it("refuse une largeur que l'encodeur n'admet pas, en la nommant", () => {
    expect(() =>
      rendreEscPosImage(raster(384, 8), { paperWidth: 99 as unknown as 58 })
    ).toThrow(/colonnes/);
  });
});
