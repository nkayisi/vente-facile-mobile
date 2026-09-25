import { perimetreAChange } from "./jeton-perimetre";

describe("perimetreAChange", () => {
  it("un serveur qui ne connaît pas le jeton n'est pas un changement", () => {
    // Sinon : effacer et re-tirer les trente-huit tables à CHAQUE
    // synchronisation, indéfiniment, sur tout un parc.
    expect(perimetreAChange(null, undefined)).toBe(false);
    expect(perimetreAChange("abc", undefined)).toBe(false);
  });

  it("l'apprendre pour la première fois n'est pas un changement", () => {
    // À la mise à jour, aucun terminal n'a de jeton. Le périmètre, lui, n'a
    // pas bougé : re-tirer tout le parc serait un coût pour rien.
    expect(perimetreAChange(null, "abc")).toBe(false);
  });

  it("un jeton différent EST un changement", () => {
    expect(perimetreAChange("abc", "def")).toBe(true);
  });

  it("le même jeton ne l'est pas", () => {
    expect(perimetreAChange("abc", "abc")).toBe(false);
  });

  it("la chaîne vide est un jeton comme un autre", () => {
    // `""` est falsy : une comparaison écrite à la légère le lirait comme
    // « absent » et laisserait passer un vrai changement.
    expect(perimetreAChange("abc", "")).toBe(true);
    expect(perimetreAChange("", "abc")).toBe(true);
  });
});
