/**
 * Ce que l'imprimante USB reçoit, et quand Android est sollicité.
 *
 * Ce que ces tests protègent :
 * - le ticket USB est LA PAGE DESSINÉE, celle de toutes les autres imprimantes ;
 * - la boîte d'autorisation d'Android s'ouvre au PREMIER ticket, et un refus
 *   n'est pas redemandé à chaque vente (elle tiendrait le comptoir en otage) ;
 * - sur un terminal réglé « intégrée » sans imprimante intégrée, la seule
 *   imprimante USB branchée sert d'elle-même.
 *
 * ⚠ Le préfixe `mock` est obligatoire : jest hisse les `jest.mock()`.
 */
import type { Block } from "@vente-facile/core/receipt";
import { Buffer } from "buffer";

import type { ReglageImprimante } from "../../reglage";
import type { ImprimanteUsb } from "./regles";

const mockReglage: ReglageImprimante = {
  transport: "embedded",
  paperWidth: 80,
  cut: true,
  densite: 110,
};
const mockListe: ImprimanteUsb[] = [];
const mockEnvoyes: { cle: string; base64: string }[] = [];
const mockDemander = jest.fn(async (_cle: string) => true);
const mockRaster = jest.fn();

jest.mock("../../preferences", () => ({
  lireReglage: jest.fn(async () => mockReglage),
}));
jest.mock("../../raster", () => ({
  ...(jest.requireActual("../../raster") as object),
  rasterDuTicket: mockRaster,
}));
jest.mock("./natif", () => ({
  moduleCable: () => ({
    listerUsb: async () => mockListe,
    demanderPermissionUsb: (cle: string) => mockDemander(cle),
    envoyerUsb: async (cle: string, base64: string) => {
      mockEnvoyes.push({ cle, base64 });
    },
    envoyerTcp: async () => undefined,
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { piloteUsb, autoriserImprimanteUsb } = require("./usb") as typeof import("./usb");

const BLOCS: Block[] = [{ kind: "band", text: "Reçu de vente" }];
const CONTEXTE = { paperWidth: 80 as const, nom: "ticket", densite: 110 };
const RASTER = { largeur: 576, hauteur: 2, points: new Uint8Array(144) };
const SDL: ImprimanteUsb = { cle: "1fc9:2016", nom: "USB Printer Port", classeImprimante: true, autorisee: false };

const porteUneImage = (flux: Uint8Array) => {
  for (let i = 0; i <= flux.length - 3; i += 1) {
    if (flux[i] === 0x1d && flux[i + 1] === 0x76 && flux[i + 2] === 0x30) return true;
  }
  return false;
};

beforeEach(() => {
  mockListe.length = 0;
  mockEnvoyes.length = 0;
  mockDemander.mockReset();
  mockDemander.mockResolvedValue(true);
  mockRaster.mockReset();
  mockRaster.mockResolvedValue(RASTER);
  mockReglage.transport = "embedded";
  delete mockReglage.adresse;
});

describe("l'imprimante USB", () => {
  it("sert d'elle-même sur un terminal sans imprimante intégrée", async () => {
    mockListe.push(SDL);
    expect(await piloteUsb.disponible()).toBe(true);
  });

  it("n'est pas disponible quand rien n'est branché", async () => {
    expect(await piloteUsb.disponible()).toBe(false);
  });

  it("envoie la page dessinée, après avoir demandé l'accès au premier ticket", async () => {
    mockListe.push(SDL);
    await piloteUsb.imprimer(BLOCS, CONTEXTE);
    expect(mockDemander).toHaveBeenCalledWith("1fc9:2016");
    expect(mockEnvoyes).toHaveLength(1);
    expect(mockEnvoyes[0].cle).toBe("1fc9:2016");
    expect(porteUneImage(new Uint8Array(Buffer.from(mockEnvoyes[0].base64, "base64")))).toBe(true);
  });

  it("ne redemande pas l'accès quand Android l'a déjà accordé", async () => {
    mockListe.push({ ...SDL, autorisee: true });
    await piloteUsb.imprimer(BLOCS, CONTEXTE);
    expect(mockDemander).not.toHaveBeenCalled();
    expect(mockEnvoyes).toHaveLength(1);
  });

  it("ne redemande pas un accès refusé à chaque vente, mais le redemande sur un geste", async () => {
    mockListe.push({ ...SDL, cle: "0416:5011" });
    mockDemander.mockResolvedValue(false);
    await expect(piloteUsb.imprimer(BLOCS, CONTEXTE)).rejects.toMatchObject({ raison: "permission" });
    await expect(piloteUsb.imprimer(BLOCS, CONTEXTE)).rejects.toMatchObject({ raison: "permission" });
    expect(mockDemander).toHaveBeenCalledTimes(1);
    expect(mockEnvoyes).toHaveLength(0);

    // L'écran Imprimante redemande, sur un geste du marchand.
    mockDemander.mockResolvedValue(true);
    expect(await autoriserImprimanteUsb("0416:5011")).toBe(true);
    await piloteUsb.imprimer(BLOCS, CONTEXTE);
    expect(mockEnvoyes).toHaveLength(1);
  });

  it("dit qu'elle n'est pas branchée plutôt que d'écrire dans le vide", async () => {
    mockReglage.transport = "usb";
    mockReglage.adresse = "1fc9:2016";
    await expect(piloteUsb.imprimer(BLOCS, CONTEXTE)).rejects.toMatchObject({
      raison: "aucune_imprimante",
    });
  });
});
