import {
  cadreDuViseur,
  colonnesDeLaGrille,
  completerRangee,
  destinationDuPanier,
  largeurDeLaGrille,
  panneauDuComptoir,
} from "./disposition-comptoir";

/**
 * Les largeurs de PAGE des appareils de référence : la fenêtre moins la
 * navigation (au comptoir, le rail de 80 points sur une tablette).
 */
const PAGE = {
  telephone: 448,
  tablette10Portrait: 800 - 80,
  tablette10Paysage: 1280 - 80,
  rk3568: 1920 - 80,
};

describe("le panier à côté de la grille", () => {
  it("reste sur son propre écran d'un téléphone et d'une tablette portrait", () => {
    expect(panneauDuComptoir(PAGE.telephone)).toBe(false);
    expect(panneauDuComptoir(PAGE.tablette10Portrait)).toBe(false);
  });

  it("vit à côté de la grille sur une tablette paysage et sur le rk3568", () => {
    expect(panneauDuComptoir(PAGE.tablette10Paysage)).toBe(true);
    expect(panneauDuComptoir(PAGE.rk3568)).toBe(true);
  });

  it("mène « voir le panier » là où il est", () => {
    expect(destinationDuPanier(PAGE.telephone)).toBe("/pos/panier");
    expect(destinationDuPanier(PAGE.rk3568)).toBe("/vendre");
  });
});

describe("les colonnes de la grille", () => {
  it("garde deux colonnes sur un téléphone, comme avant", () => {
    expect(colonnesDeLaGrille(PAGE.telephone)).toBe(2);
    expect(colonnesDeLaGrille(360)).toBe(2);
  });

  it("élargit la grille avec l'écran, sans jamais dépasser six", () => {
    expect(colonnesDeLaGrille(PAGE.tablette10Portrait)).toBe(3);
    expect(colonnesDeLaGrille(PAGE.tablette10Paysage)).toBe(4);
    expect(colonnesDeLaGrille(PAGE.rk3568)).toBe(6);
    expect(colonnesDeLaGrille(4000)).toBe(6);
  });

  it("retire le panneau de la largeur de la grille", () => {
    // Sans ce retrait, la grille se croirait large de 1 840 points et poserait
    // ses colonnes sous le panneau.
    expect(largeurDeLaGrille(PAGE.rk3568)).toBe(1840 - 400 - 32);
    expect(largeurDeLaGrille(PAGE.telephone)).toBe(448 - 32);
  });
});

describe("la dernière rangée", () => {
  it("est complétée de cellules vides, pour qu'une carte isolée ne s'étire pas", () => {
    expect(completerRangee(["a", "b", "c", "d", "e"], 4)).toEqual(["a", "b", "c", "d", "e", null, null, null]);
    expect(completerRangee(["a", "b"], 2)).toEqual(["a", "b"]);
    expect(completerRangee([], 3)).toEqual([]);
  });
});

describe("le viseur du scanner", () => {
  it("garde le cadre d'un téléphone", () => {
    expect(cadreDuViseur(448)).toEqual({ largeur: 288, hauteur: 128 });
  });

  it("grandit avec la page sans dépasser 480, en gardant ses proportions", () => {
    expect(cadreDuViseur(1840)).toEqual({ largeur: 480, hauteur: 213 });
    expect(cadreDuViseur(1000).largeur).toBe(400);
  });
});
