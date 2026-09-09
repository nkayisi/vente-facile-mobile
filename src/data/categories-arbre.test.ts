import { sousArbre, type NoeudCategorie } from "./categories-arbre";

/** Trois niveaux, plus une branche voisine qui ne doit JAMAIS être ramenée. */
const ARBRE: NoeudCategorie[] = [
  { id: "boissons", parentId: null },
  { id: "sodas", parentId: "boissons" },
  { id: "colas", parentId: "sodas" },
  { id: "jus", parentId: "boissons" },
  { id: "hygiene", parentId: null },
  { id: "savons", parentId: "hygiene" },
];

describe("le sous-arbre d'une catégorie", () => {
  it("la grille de test porte bien trois niveaux", () => {
    // Le balayage BALAIE : sur un arbre plat, tous les tests ci-dessous
    // passeraient en ne ramenant que la racine.
    expect(ARBRE).toHaveLength(6);
    expect(ARBRE.filter((c) => c.parentId !== null)).toHaveLength(4);
  });

  it("descend jusqu'au TROISIÈME niveau", () => {
    expect(new Set(sousArbre(ARBRE, "boissons"))).toEqual(
      new Set(["boissons", "sodas", "colas", "jus"])
    );
  });

  it("ne franchit pas vers une branche voisine", () => {
    expect(sousArbre(ARBRE, "boissons")).not.toContain("hygiene");
    expect(sousArbre(ARBRE, "boissons")).not.toContain("savons");
  });

  it("rend la feuille seule pour une feuille", () => {
    expect(sousArbre(ARBRE, "colas")).toEqual(["colas"]);
  });

  it("rend la RACINE pour une catégorie inconnue, jamais le vide", () => {
    // Le cas tranchant : `[]` se traduirait en « aucun filtre », donc en tout
    // le stock, là où l'utilisateur en demandait une part.
    expect(sousArbre(ARBRE, "disparue")).toEqual(["disparue"]);
  });

  it("ne filtre rien quand aucune catégorie n'est choisie", () => {
    expect(sousArbre(ARBRE, null)).toBeNull();
  });

  it("TERMINE sur une hiérarchie cyclique", () => {
    const cycle: NoeudCategorie[] = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    expect(new Set(sousArbre(cycle, "a"))).toEqual(new Set(["a", "b"]));
  });
});
