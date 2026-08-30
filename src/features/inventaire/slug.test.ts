import { slugifier } from "./slug";

/**
 * Le serveur EXIGE un `slug` sur une catégorie et une marque, et ne le dérive
 * pas. Le fabriquer mal produit un refus DÉTERMINISTE, donc une quarantaine -
 * et le magasinier a saisi hors ligne, il ne verra le refus que bien plus tard.
 */
describe("slugifier", () => {
  it("retire les accents, qui n'ont rien à faire dans une URL", () => {
    expect(slugifier("Boissons gazeuses")).toBe("boissons-gazeuses");
    expect(slugifier("Épicerie salée")).toBe("epicerie-salee");
  });

  it("réduit toute ponctuation à un seul tiret", () => {
    expect(slugifier("Riz & Pâtes / 5kg")).toBe("riz-pates-5kg");
  });

  it("ne laisse jamais de tiret au bord", () => {
    expect(slugifier("  Café  ")).toBe("cafe");
    expect(slugifier("--Test--")).toBe("test");
  });

  it("borne la longueur : le champ serveur est un SlugField", () => {
    expect(slugifier("a".repeat(200)).length).toBeLessThanOrEqual(50);
  });

  it("un nom sans lettre ni chiffre donne une chaîne vide, pas un tiret", () => {
    // Le serveur refusera, et c'est ce qu'il faut : mieux vaut un refus clair
    // qu'une marque nommée « - ».
    expect(slugifier("!!!")).toBe("");
  });
});
