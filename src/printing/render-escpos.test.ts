/**
 * L'encodage ESC/POS.
 *
 * Ce que ces tests protègent : qu'un ticket parti sur une imprimante Bluetooth
 * porte EXACTEMENT le texte que la mise en page a décidé. Un encodage qui
 * réaligne, retronque ou réordonne de son côté ferait diverger le papier du
 * terminal et le papier de l'imprimante sans fil, et rien ne le signalerait.
 */
import type { Block } from "@vente-facile/core/receipt";

import { rendreEscPos } from "./render-escpos";
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
    expect(espaces(rendreEscPos([{ text: "RECU", align: "center", scale: 2 }]))).toBe(17);
    // Le même titre en chasse simple occupe 4 colonnes : 19 de marge.
    expect(espaces(rendreEscPos([{ text: "RECU", align: "center" }]))).toBe(19);
  });

  it("aligne à droite sur la largeur réelle", () => {
    // « 9 000 » porte un espace : 32 de marge + 1 dans le nombre.
    expect(espaces(rendreEscPos([{ text: "9 000", align: "right", scale: 2 }]))).toBe(33);
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
