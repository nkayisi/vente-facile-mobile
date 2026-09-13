/**
 * Le repli PDF, et la seule chose qu'aucune relecture ne peut vérifier :
 * LA TAILLE DE LA PAGE QU'IL DEMANDE.
 *
 * `expo-print` ne lit pas `@page { size: … }`. Sans `width` / `height`, il rend
 * du US Letter, 612 × 792 points - une feuille de bureau presque vide, avec le
 * ticket tassé dans un coin, envoyée au client par message. Rien ne lève, rien
 * ne se journalise : c'est exactement le genre de défaut qui vit des mois.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { Block } from "@vente-facile/core/receipt";

import { pilotePdf } from "./pdf";

jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn(async () => ({ uri: "file:///cache/abcdef.pdf" })),
  printAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    exists = false;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    delete() {}
    copy() {}
  }
  return { File, Paths: { cache: "file:///cache" } };
});

const BLOCS: Block[] = [
  { kind: "text", text: "NEKASHOP INC", role: "orgName", align: "center" },
  { kind: "band", text: "Reçu de vente" },
  { kind: "total", label: "Net à payer", value: "12 500 FC" },
];

const options = () => (Print.printToFileAsync as jest.Mock).mock.calls[0][0];

beforeEach(() => jest.clearAllMocks());

describe("Taille de la page demandée", () => {
  it("passe une largeur et une hauteur, jamais le défaut US Letter", async () => {
    await pilotePdf.imprimer(BLOCS, { paperWidth: 58, densite: 110, nom: "Recu" });

    const o = options();
    expect(o.width).toBeDefined();
    expect(o.height).toBeDefined();
    expect(o.width).not.toBe(612);
    expect(o.height).not.toBe(792);
  });

  it("demande la largeur du rouleau, en points", async () => {
    await pilotePdf.imprimer(BLOCS, { paperWidth: 58, densite: 110, nom: "Recu" });
    // Mesure indépendante : 1 pouce = 25,4 mm = 72 points.
    expect(options().width).toBe(Math.round((58 * 72) / 25.4));
  });

  it("suit le réglage du marchand quand il passe en 80 mm", async () => {
    await pilotePdf.imprimer(BLOCS, { paperWidth: 80, densite: 110, nom: "Recu" });
    expect(options().width).toBe(Math.round((80 * 72) / 25.4));
  });

  it("donne à un ticket plus long une page plus haute", async () => {
    await pilotePdf.imprimer(BLOCS, { paperWidth: 58, densite: 110, nom: "Recu" });
    const court = options().height;

    jest.clearAllMocks();
    await pilotePdf.imprimer(
      [...BLOCS, ...Array(20).fill({ kind: "text", text: "Article", role: "body" })],
      { paperWidth: 58, densite: 110, nom: "Recu" }
    );
    expect(options().height).toBeGreaterThan(court);
  });

  it("envoie bien la page décrite par le moteur, accents compris", async () => {
    await pilotePdf.imprimer(BLOCS, { paperWidth: 58, densite: 110, nom: "Recu" });
    expect(options().html).toContain("Reçu de vente");
    expect(options().html).toContain("box-sizing:border-box");
  });
});

describe("Sortie du document", () => {
  it("ouvre la feuille d'impression quand rien ne sait recevoir le fichier", async () => {
    await pilotePdf.imprimer(BLOCS, { paperWidth: 58, densite: 110, nom: "Recu" });
    expect(Print.printAsync).toHaveBeenCalledWith({ uri: "file:///cache/abcdef.pdf" });
  });

  it("partage sous le NOM du document, pas sous l'UUID d'expo-print", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    await pilotePdf.imprimer(BLOCS, { paperWidth: 58, densite: 110, nom: "Recu VT-20260911-0001" });

    const [uri] = (Sharing.shareAsync as jest.Mock).mock.calls[0];
    expect(uri).toContain("Recu VT-20260911-0001.pdf");
    expect(uri).not.toContain("abcdef");
  });
});
