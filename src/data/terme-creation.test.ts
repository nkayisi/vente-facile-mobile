/**
 * Les MÊMES cas que `frontend/lib/products/terme-creation.test.ts`.
 */
import {
  creationDejaEnFile,
  parametresCreationArticle,
  preRemplissageDeCreation,
} from "./terme-creation";

describe("ce qu'une recherche vide pré-remplit", () => {
  it("un mot devient le NOM", () => {
    expect(preRemplissageDeCreation("  Savon Omo ")).toEqual({ champ: "nom", valeur: "Savon Omo" });
  });

  it("un EAN-13 tapé à la main devient le CODE-BARRES", () => {
    expect(preRemplissageDeCreation("6001087011234")).toEqual({
      champ: "code_barres",
      valeur: "6001087011234",
    });
  });

  it("un EAN-8 aussi", () => {
    expect(preRemplissageDeCreation("96385074")?.champ).toBe("code_barres");
  });

  it("un nombre court reste un nom : une référence, une taille", () => {
    expect(preRemplissageDeCreation("500")?.champ).toBe("nom");
  });

  it("ce qui sort d'un scanner est un code, même alphanumérique", () => {
    expect(preRemplissageDeCreation("ABC-123-X", true)).toEqual({
      champ: "code_barres",
      valeur: "ABC-123-X",
    });
  });

  it("un terme vide ne propose rien", () => {
    expect(preRemplissageDeCreation("   ")).toBeNull();
  });
});

describe("les paramètres de la création", () => {
  it("portent le nom, et le retour quand on vient d'un autre écran", () => {
    expect(parametresCreationArticle("Lait & Miel", { retour: true })).toEqual({
      nom: "Lait & Miel",
      retour: "1",
    });
  });

  it("portent le code-barres d'un scan", () => {
    expect(parametresCreationArticle("6001087011234")).toEqual({ codeBarres: "6001087011234" });
  });

  it("rien pour un terme vide", () => {
    expect(parametresCreationArticle("")).toBeNull();
  });
});

describe("une création déjà en file", () => {
  const enFile = [{ nom: "Savon Omo", sku: "SAVONO-1234", codeBarres: "6001087011234" }];

  it("se reconnaît par son nom, son SKU ou son code-barres", () => {
    expect(creationDejaEnFile("  savon omo ", enFile)).toBe("Savon Omo");
    expect(creationDejaEnFile("savono-1234", enFile)).toBe("Savon Omo");
    expect(creationDejaEnFile("6001087011234", enFile)).toBe("Savon Omo");
  });

  it("un autre terme n'est pas un doublon", () => {
    expect(creationDejaEnFile("Savon", enFile)).toBeNull();
    expect(creationDejaEnFile("", enFile)).toBeNull();
  });
});
