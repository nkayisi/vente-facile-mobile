/**
 * La page du ticket en points, et le contrat de son format.
 *
 * Ce que ces tests protègent : le format **1 bit par point, MSB d'abord,
 * 1 = noir, rangée alignée sur l'octet**. Ce n'est pas une convention interne,
 * c'est mot pour mot la charge utile de `GS v 0` : une inversion de bit, un
 * alignement raté, et l'imprimante sans fil rend une bouillie sans rien
 * signaler, pendant que l'imprimante intégrée, elle, continue de sortir juste.
 *
 * ⚠ Sans `jest.mock` explicite, le `require("expo")` paresseux lève, le module
 * se dégrade en `null`, et tout le chemin passant devient vert sans rien
 * démontrer. Le préfixe `mock` est obligatoire : jest hisse les `jest.mock()`
 * au-dessus des déclarations.
 */
import { Buffer } from "buffer";

import type { Block } from "@vente-facile/core/receipt";

const mockRasteriser = jest.fn();
const mockRequire = jest.fn<{ rasteriser: jest.Mock } | null, [string]>(() => ({
  rasteriser: mockRasteriser,
}));

jest.mock("expo", () => ({ requireOptionalNativeModule: mockRequire }));

const BLOCS: Block[] = [{ kind: "text", text: "Bonjour", role: "body" }];

/** Un module neuf : `charger()` mémoïse, donc l'absence se teste en isolation. */
function neuf() {
  let mod!: typeof import("./raster");
  jest.isolateModules(() => {
     
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("./raster") as typeof import("./raster");
  });
  return mod;
}

beforeEach(() => {
  mockRasteriser.mockReset();
  mockRequire.mockReset();
  mockRequire.mockReturnValue({ rasteriser: mockRasteriser });
});

describe("Points du papier", () => {
  it("compte la bande CHAUFFÉE, pas la largeur du rouleau", () => {
    const { pointsDuPapier } = neuf();
    // 58 mm de papier, 48 mm d'encre : les 5 mm de chaque bord sont mécaniques.
    expect(pointsDuPapier(58)).toBe(384);
    expect(pointsDuPapier(80)).toBe(576);
  });

  it("aligne la rangée sur l'octet, même quand la largeur ne l'est pas", () => {
    const { octetsParRangee } = neuf();
    expect(octetsParRangee(384)).toBe(48);
    expect(octetsParRangee(576)).toBe(72);
    // Une page mesurée peut tomber sur un nombre impair : la rangée se complète,
    // sinon les rangées suivantes glissent d'un bit et l'image part en biais.
    expect(octetsParRangee(385)).toBe(49);
    expect(octetsParRangee(1)).toBe(1);
  });
});

describe("Rastérisation", () => {
  it("rend null quand le module natif est absent, au lieu de lever", async () => {
    // Un ticket qui ne sort pas du tout est le seul échec inacceptable :
    // l'appelant doit pouvoir se replier sur le texte.
    mockRequire.mockReturnValue(null);
    const { rasterDuTicket, rasteriseurDisponible } = neuf();
    expect(rasteriseurDisponible()).toBe(false);
    await expect(rasterDuTicket(BLOCS, 58)).resolves.toBeNull();
  });

  it("dessine la page à la largeur du ROULEAU et la rend à celle de la TÊTE", async () => {
    mockRasteriser.mockResolvedValue({ width: 384, height: 2, data: "" });
    const { rasterDuTicket } = neuf();
    await rasterDuTicket(BLOCS, 58);

    const [html, widthPx, pageWidthMm] = mockRasteriser.mock.calls[0];
    expect(widthPx).toBe(384);
    expect(pageWidthMm).toBe(58);
    // La page est bien celle de `render-html.ts`, pas une approximation.
    expect(html).toContain("58mm");
    expect(html).toContain("Bonjour");
  });

  it("rend les octets tels quels : un bit retourné est une image fausse", async () => {
    const points = Uint8Array.from([0b10000001, 0x00, 0xff, 0x0f]);
    mockRasteriser.mockResolvedValue({
      width: 16,
      height: 2,
      data: Buffer.from(points).toString("base64"),
    });
    const { rasterDuTicket } = neuf();
    const raster = await rasterDuTicket(BLOCS, 58);

    expect(raster).not.toBeNull();
    expect(raster!.largeur).toBe(16);
    expect(raster!.hauteur).toBe(2);
    expect(Array.from(raster!.points)).toEqual(Array.from(points));
  });
});
