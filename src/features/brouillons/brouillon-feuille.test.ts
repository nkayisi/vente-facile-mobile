import { garderBrouillon, oublierBrouillon, reprendreBrouillon } from "./brouillon-feuille";

describe("le brouillon d'une feuille", () => {
  it("se reprend tel qu'il a été gardé", () => {
    garderBrouillon("requisition", { notes: "marché", lignes: [1, 2] });
    expect(reprendreBrouillon("requisition")).toEqual({ notes: "marché", lignes: [1, 2] });
  });

  it("ne se reprend qu'une fois : une saisie périmée ne resurgit pas", () => {
    garderBrouillon("devis", { a: 1 });
    reprendreBrouillon("devis");
    expect(reprendreBrouillon("devis")).toBeNull();
  });

  it("une ouverture manuelle l'oublie", () => {
    garderBrouillon("mouvement", { a: 1 });
    oublierBrouillon("mouvement");
    expect(reprendreBrouillon("mouvement")).toBeNull();
  });

  it("deux feuilles ne se mélangent pas", () => {
    garderBrouillon("a", 1);
    garderBrouillon("b", 2);
    expect(reprendreBrouillon("a")).toBe(1);
    expect(reprendreBrouillon("b")).toBe(2);
  });
});
