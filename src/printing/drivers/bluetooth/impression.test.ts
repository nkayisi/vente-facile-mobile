/**
 * Ce qui part RÉELLEMENT sur le fil d'une imprimante sans fil.
 *
 * Ce que ces tests protègent : qu'une imprimante Bluetooth reçoive LE MÊME
 * document que l'imprimante intégrée et que le PDF. Elle recevait du texte de
 * 32 colonnes - pas de bandeau en vidéo inversée, pas de hiérarchie de police,
 * accents retirés - si bien que la même vente sortait sur deux papiers
 * différents chez un marchand qui a les deux machines. Rien ne le signalait :
 * les deux tickets étaient corrects, chacun dans son coin.
 *
 * ⚠ Le préfixe `mock` est obligatoire : jest hisse les `jest.mock()` au-dessus
 * des déclarations, et refuse toute autre variable hors de leur portée.
 */
import type { Block } from "@vente-facile/core/receipt";

import type { ReglageImprimante } from "../../reglage";

const mockEnvoyes: Uint8Array[] = [];

const mockReglage: ReglageImprimante = {
  transport: "bluetooth",
  lien: "spp",
  adresse: "AA:BB:CC:DD:EE:FF",
  paperWidth: 58,
  cut: false,
  densite: 110,
};

const mockRaster = jest.fn();

jest.mock("../../preferences", () => ({
  lireReglage: jest.fn(async () => mockReglage),
}));
jest.mock("../../raster", () => ({
  ...(jest.requireActual("../../raster") as object),
  rasterDuTicket: mockRaster,
}));
jest.mock("./permissions-android", () => ({
  permissionsAccordees: jest.fn(async () => true),
  demanderPermissionsBluetooth: jest.fn(),
}));
jest.mock("./spp", () => ({
  disponibleSurCettePlateforme: () => true,
  allume: jest.fn(async () => true),
  appairees: jest.fn(async () => []),
  decouvrir: jest.fn(async () => []),
  appairer: jest.fn(async () => true),
  annulerDecouverte: jest.fn(async () => undefined),
  activer: jest.fn(async () => true),
  ouvrirReglagesBluetooth: jest.fn(),
  envoyer: jest.fn(async (_adresse: string, octets: Uint8Array) => {
    mockEnvoyes.push(octets);
  }),
}));
jest.mock("./gatt", () => ({
  disponibleSurCettePlateforme: () => false,
  etat: jest.fn(async () => "PoweredOn"),
  chercher: jest.fn(async () => []),
  envoyer: jest.fn(async () => undefined),
}));

 
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { piloteBluetooth } = require("./index") as typeof import("./index");

const GS = 0x1d;
const BLOCS: Block[] = [
  { kind: "band", text: "Reçu de vente" },
  { kind: "text", text: "Bonjour", role: "body" },
];

const CONTEXTE = { paperWidth: 58 as const, nom: "ticket", densite: 110 };

/** Un raster minuscule, mais reconnaissable : deux rangées d'une largeur de tête. */
const RASTER = {
  largeur: 384,
  hauteur: 2,
  points: Uint8Array.from({ length: 96 }, (_, i) => (i * 5 + 3) & 0xff),
};

const porteUneImage = (flux: Uint8Array) => {
  for (let i = 0; i <= flux.length - 3; i += 1) {
    if (flux[i] === GS && flux[i + 1] === 0x76 && flux[i + 2] === 0x30) return true;
  }
  return false;
};

beforeEach(() => {
  mockEnvoyes.length = 0;
  mockRaster.mockReset();
  delete mockReglage.texteSimple;
});

describe("Ce qu'une imprimante sans fil reçoit", () => {
  it("envoie la PAGE DESSINÉE, la même que le PDF et que l'imprimante intégrée", async () => {
    mockRaster.mockResolvedValue(RASTER);
    await piloteBluetooth.imprimer(BLOCS, CONTEXTE);

    expect(mockRaster).toHaveBeenCalledWith(BLOCS, 58);
    expect(mockEnvoyes).toHaveLength(1);
    expect(porteUneImage(mockEnvoyes[0])).toBe(true);
  });

  it("se replie sur le texte quand le rastériseur manque, plutôt que d'échouer", async () => {
    // Un ticket qui ne sort pas du tout est le seul échec inacceptable.
    mockRaster.mockResolvedValue(null);
    await piloteBluetooth.imprimer(BLOCS, CONTEXTE);

    expect(mockEnvoyes).toHaveLength(1);
    expect(porteUneImage(mockEnvoyes[0])).toBe(false);
    // Le repli porte bien le document, en toutes lettres et désaccentué.
    expect(String.fromCharCode(...mockEnvoyes[0])).toContain("Bonjour");
  });

  it("respecte le mode de secours : le marchand a vu du charabia sur son papier", async () => {
    mockReglage.texteSimple = true;
    mockRaster.mockResolvedValue(RASTER);
    await piloteBluetooth.imprimer(BLOCS, CONTEXTE);

    // On ne rastérise même pas : inutile de dessiner une page qu'on n'enverra pas.
    expect(mockRaster).not.toHaveBeenCalled();
    expect(porteUneImage(mockEnvoyes[0])).toBe(false);
  });
});
