import { ordreArbre, sousArbre, type NoeudCategorie } from "./categories-arbre";

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

describe("l'ordre d'affichage", () => {
  const noeud = (id: string, parentId: string | null) => ({ id, parentId });

  it("range un enfant SOUS son parent, et lui donne sa profondeur", () => {
    const rendu = ordreArbre([
      noeud("b", null), noeud("s", "b"), noeud("c", "s"), noeud("e", null),
    ]);
    expect(rendu.map((r) => [r.item.id, r.profondeur])).toEqual([
      ["b", 0], ["s", 1], ["c", 2], ["e", 0],
    ]);
  });

  it("CONSERVE l'ordre d'entrée dans une fratrie : c'est l'appelant qui trie", () => {
    const rendu = ordreArbre([noeud("z", null), noeud("a", null)]);
    expect(rendu.map((r) => r.item.id)).toEqual(["z", "a"]);
  });

  it("rend un ORPHELIN en fin de liste plutôt que de le perdre", () => {
    // Son parent a pu être supprimé entre deux tirages. Le perdre le rendrait
    // inatteignable, sans que rien ne le signale.
    const rendu = ordreArbre([noeud("a", null), noeud("orphelin", "disparu")]);
    expect(rendu.map((r) => [r.item.id, r.profondeur])).toEqual([
      ["a", 0], ["orphelin", 0],
    ]);
  });

  it("ne boucle pas sur une hiérarchie CYCLIQUE", () => {
    const rendu = ordreArbre([noeud("a", "b"), noeud("b", "a")]);
    expect(rendu).toHaveLength(2);
    expect(rendu.every((r) => r.profondeur === 0)).toBe(true);
  });

  it("rend chaque noeud UNE SEULE FOIS", () => {
    const rendu = ordreArbre([noeud("b", null), noeud("s", "b"), noeud("c", "s")]);
    expect(new Set(rendu.map((r) => r.item.id)).size).toBe(rendu.length);
  });
});
