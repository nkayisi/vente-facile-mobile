/**
 * Quelle largeur le document est dessiné, une fois le transport connu.
 *
 * Ce que ces tests protègent : qu'une cascade qui change de machine ne laisse
 * pas la mise en page d'une autre. Le réglage dit « Bluetooth, 80 mm », le
 * Bluetooth est éteint, on retombe sur l'intégrée : envoyer 80 à un rouleau de
 * 58 ampute les montants, toute la journée, et le seul indice est le nom du
 * transport dans un toast.
 */
import type { PiloteImpression } from "./driver";
import { largeurPour } from "./largeur";
import { REGLAGE_PAR_DEFAUT, type ReglageImprimante } from "./reglage";

const reglage = (patch: Partial<ReglageImprimante> = {}): ReglageImprimante => ({
  ...REGLAGE_PAR_DEFAUT,
  ...patch,
});

const pilote = (id: PiloteImpression["id"]): PiloteImpression => ({
  id,
  action: "Imprimer",
  disponible: async () => true,
  imprimer: async () => undefined,
});

describe("Largeur du transport", () => {
  it("suit le réglage quand le transport retenu est celui qu'on a choisi", () => {
    expect(largeurPour(pilote("embedded"), reglage({ paperWidth: 80 }))).toBe(80);
  });

  it("retombe à 58 quand la cascade a changé de machine", () => {
    // Le réglage dit « Bluetooth, 80 mm », le Bluetooth est éteint, on retombe
    // sur l'intégrée : une mise en page de 80 sur un rouleau de 58 ampute les
    // montants, l'inverse laisse une marge.
    expect(
      largeurPour(pilote("embedded"), reglage({ transport: "bluetooth", paperWidth: 80 }))
    ).toBe(58);
  });

  it("laisse le PDF à la largeur réglée : ce n'est pas une machine", () => {
    expect(
      largeurPour(pilote("pdf"), reglage({ transport: "bluetooth", paperWidth: 80 }))
    ).toBe(80);
  });
});
