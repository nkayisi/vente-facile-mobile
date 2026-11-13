import { bornerRemiseLigne, paliersRemise, plafondRemiseLigne } from "./remise-ligne";

describe("le plafond de remise d'une ligne", () => {
  it("se lit de l'instantané de session, borné à cent", () => {
    expect(plafondRemiseLigne("20.00")).toBe(20);
    expect(plafondRemiseLigne(150)).toBe(100);
  });

  it("inconnu, il vaut ZÉRO, jamais « sans limite »", () => {
    // ⚠ Un instantané qui ne porte pas le champ fermerait la remise plutôt que
    //   de laisser passer ce que le serveur refusera.
    expect(plafondRemiseLigne(undefined)).toBe(0);
    expect(plafondRemiseLigne(null)).toBe(0);
    expect(plafondRemiseLigne("")).toBe(0);
    expect(plafondRemiseLigne("abc")).toBe(0);
  });
});

describe("une remise saisie", () => {
  it("est ramenée au plafond et au centième", () => {
    expect(bornerRemiseLigne(45, 20)).toBe(20);
    expect(bornerRemiseLigne(12.345, 20)).toBe(12.35);
  });

  it("n'est jamais négative", () => {
    expect(bornerRemiseLigne(-5, 20)).toBe(0);
    expect(bornerRemiseLigne(Number.NaN, 20)).toBe(0);
  });
});

describe("les paliers proposés", () => {
  it("finissent toujours par le plafond, même hors palier", () => {
    expect(paliersRemise(12)).toEqual([5, 10, 12]);
    expect(paliersRemise(20)).toEqual([5, 10, 15, 20]);
  });

  it("un plafond nul ne propose rien", () => {
    expect(paliersRemise(0)).toEqual([]);
  });
});
