import { libelleAilleurs } from "./ailleurs";

const ICI = (entrepot: string, disponible: number) => ({
  entrepotId: `w-${entrepot}`,
  entrepot,
  disponible,
});

describe("où l'article reste disponible", () => {
  it("ne dit rien quand rien n'a été demandé, ou quand il n'y a rien ailleurs", () => {
    expect(libelleAilleurs(null, "bouteille")).toBeNull();
    expect(libelleAilleurs([], "bouteille")).toBeNull();
  });

  it("nomme chaque entrepôt avec sa quantité, accordée", () => {
    expect(libelleAilleurs([ICI("Réserve", 12), ICI("Boutique Nord", 1)], "bouteille")).toBe(
      "Ailleurs : Réserve 12 bouteilles · Boutique Nord 1 bouteille"
    );
  });

  it("une demi-unité se lit à la virgule, comme partout au comptoir", () => {
    expect(libelleAilleurs([ICI("Réserve", 0.5)], "kg")).toBe("Ailleurs : Réserve 0,5 kg");
  });

  it("au-delà de trois entrepôts, dit combien d'autres", () => {
    const quatre = ["A", "B", "C", "D", "E"].map((n) => ICI(n, 2));
    expect(libelleAilleurs(quatre, "pièce")).toBe(
      "Ailleurs : A 2 pièces · B 2 pièces · C 2 pièces · et 2 autres"
    );
  });
});
