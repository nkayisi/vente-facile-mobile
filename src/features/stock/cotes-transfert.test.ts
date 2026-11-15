import { COTE_DE_LA_TRANSITION, transitionDuBonCote } from "./cotes-transfert";

const T = { sourceId: "src", destinationId: "dst" };

describe("chaque transition de transfert a son côté", () => {
  it("expédier, approuver et annuler se font depuis la SOURCE", () => {
    const source = new Set(["src"]);
    expect(transitionDuBonCote("ship", T, source)).toBe(true);
    expect(transitionDuBonCote("approve", T, source)).toBe(true);
    expect(transitionDuBonCote("cancel", T, source)).toBe(true);
    // Le magasinier de la source ne réceptionne pas ce qu'il expédie.
    expect(transitionDuBonCote("receive", T, source)).toBe(false);
  });

  it("réceptionner se fait depuis la DESTINATION, et rien d'autre", () => {
    // Le défaut fermé : le magasinier de destination voyait « Expédier » sur un
    // envoi qu'il attendait, et l'acte revenait en quarantaine.
    const destination = new Set(["dst"]);
    expect(transitionDuBonCote("receive", T, destination)).toBe(true);
    expect(transitionDuBonCote("ship", T, destination)).toBe(false);
    expect(transitionDuBonCote("cancel", T, destination)).toBe(false);
  });

  it("un membre des deux côtés fait les quatre", () => {
    const deux = new Set(["src", "dst"]);
    for (const t of Object.keys(COTE_DE_LA_TRANSITION) as (keyof typeof COTE_DE_LA_TRANSITION)[]) {
      expect(transitionDuBonCote(t, T, deux)).toBe(true);
    }
  });

  it("un côté DÉSACTIVÉ n'est pas actionnable : rien n'y est proposé", () => {
    // `actionnables` ne porte que des entrepôts actifs : le serveur refuserait
    // en `entrepot_inactif`.
    expect(transitionDuBonCote("ship", T, new Set())).toBe(false);
  });
});
