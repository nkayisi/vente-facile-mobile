import { proposerDepuisRayons, type RayonProposable } from "./proposition-requisition";

const rayon = (p: Partial<RayonProposable> = {}): RayonProposable => ({
  produitId: "p1",
  produit: "Savon",
  sku: "SAV-1",
  unite: "pièce",
  total: 3,
  quantiteAffichee: "3 pièces",
  seuilReassort: 10,
  suitLeStock: true,
  ...p,
});

describe("la proposition reprend le critère du serveur, les trois conditions", () => {
  it("retient un rayon sous son seuil", () => {
    expect(proposerDepuisRayons([rayon()])).toHaveLength(1);
  });

  it("retient un rayon EXACTEMENT à son seuil : le serveur compare avec <=", () => {
    expect(proposerDepuisRayons([rayon({ total: 10 })])).toHaveLength(1);
  });

  it("écarte un rayon au-dessus de son seuil", () => {
    expect(proposerDepuisRayons([rayon({ total: 11 })])).toEqual([]);
  });

  /**
   * ⚠ LE CAS QUI MOTIVE LE FILTRE. `etatDuRayon` range ce rayon en
   * « rupture » - il est vide - alors que `lignes_proposees` l'écarte, faute de
   * suivi. Sans la condition, le terminal proposerait un article que le
   * back-office ne propose pas.
   */
  it("écarte un rayon VIDE dont le stock n'est pas suivi", () => {
    expect(proposerDepuisRayons([rayon({ total: 0, suitLeStock: false })])).toEqual([]);
  });

  it("écarte un rayon vide SANS seuil posé : rien à quoi comparer", () => {
    expect(proposerDepuisRayons([rayon({ total: 0, seuilReassort: 0 })])).toEqual([]);
  });

  it("écarte un rayon suivi, sous le seuil, mais sans seuil réel", () => {
    expect(proposerDepuisRayons([rayon({ total: 2, seuilReassort: 0 })])).toEqual([]);
  });
});

describe("la quantité suggérée remonte AU seuil", () => {
  it("propose la différence", () => {
    expect(proposerDepuisRayons([rayon({ total: 3, seuilReassort: 10 })])[0].suggere).toBe(7);
  });

  it("ne propose jamais une quantité négative", () => {
    expect(proposerDepuisRayons([rayon({ total: 10, seuilReassort: 10 })])[0].suggere).toBe(0);
  });

  it("propose le seuil entier sur un rayon vide", () => {
    expect(proposerDepuisRayons([rayon({ total: 0, seuilReassort: 24 })])[0].suggere).toBe(24);
  });
});

describe("l'ordre est celui des courses", () => {
  it("un rayon VIDE passe devant un rayon bas, quel que soit son nom", () => {
    const lignes = proposerDepuisRayons([
      rayon({ produitId: "a", produit: "Allumettes", total: 2 }),
      rayon({ produitId: "z", produit: "Zébu", total: 0 }),
    ]);
    expect(lignes.map((l) => l.produitId)).toEqual(["z", "a"]);
  });

  it("à égale urgence, l'ordre est alphabétique", () => {
    const lignes = proposerDepuisRayons([
      rayon({ produitId: "b", produit: "Beurre", total: 1 }),
      rayon({ produitId: "a", produit: "Ail", total: 1 }),
    ]);
    expect(lignes.map((l) => l.produitId)).toEqual(["a", "b"]);
  });
});

describe("un article ne figure qu'une fois", () => {
  /**
   * Les deux lectures du terminal (« bas » et « rupture ») sont concaténées :
   * sans dédoublonnage, un même article pourrait porter deux instantanés de
   * stock contradictoires sur le même document.
   */
  it("dédoublonne par article", () => {
    const lignes = proposerDepuisRayons([rayon(), rayon({ total: 1 })]);
    expect(lignes).toHaveLength(1);
  });
});

describe("les ruptures seules", () => {
  it("ne garde que les rayons vides", () => {
    const lignes = proposerDepuisRayons(
      [
        rayon({ produitId: "bas", total: 3 }),
        rayon({ produitId: "vide", total: 0 }),
      ],
      { rupturesSeules: true }
    );
    expect(lignes.map((l) => l.produitId)).toEqual(["vide"]);
  });

  it("garde les trois conditions : un rayon vide non suivi reste écarté", () => {
    expect(
      proposerDepuisRayons([rayon({ total: 0, suitLeStock: false })], {
        rupturesSeules: true,
      })
    ).toEqual([]);
  });
});
