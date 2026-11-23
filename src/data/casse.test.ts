import { casseDeTitre } from "./casse";

describe("la casse d'un nom d'article", () => {
  it("met chaque mot en minuscules, première lettre en majuscule", () => {
    expect(casseDeTitre("ALDACTONE COMPRIME")).toBe("Aldactone Comprime");
    expect(casseDeTitre("savon de marseille")).toBe("Savon De Marseille");
  });

  it("laisse en minuscules un mot qui commence par un chiffre", () => {
    expect(casseDeTitre("ALDACTONE 25MG 5CES")).toBe("Aldactone 25mg 5ces");
  });

  it("garde les accents, et met en majuscule une initiale accentuée", () => {
    expect(casseDeTitre("ÉTÉ BRÛLANT")).toBe("Été Brûlant");
  });

  it("recommence un mot après un tiret, une barre ou une parenthèse", () => {
    expect(casseDeTitre("COCA-COLA")).toBe("Coca-Cola");
    expect(casseDeTitre("SUCRE/SEL")).toBe("Sucre/Sel");
    expect(casseDeTitre("HUILE (PALME)")).toBe("Huile (Palme)");
  });

  it("ne coupe pas le mot à l'apostrophe", () => {
    expect(casseDeTitre("EAU D'ARGENT")).toBe("Eau D'argent");
  });

  it("préserve les blancs tels qu'ils sont saisis", () => {
    expect(casseDeTitre("  LAIT   NIDO ")).toBe("  Lait   Nido ");
  });

  it("rend une chaîne vide telle quelle", () => {
    expect(casseDeTitre("")).toBe("");
  });
});
