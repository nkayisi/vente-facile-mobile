import {
  VUES,
  indexDeLOffset,
  indexSuivant,
  libelleBouton,
  libellePoint,
} from "./vues";

describe("les vues de la présentation", () => {
  it("il y en a trois, et leurs clés sont distinctes", () => {
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien.
    expect(VUES).toHaveLength(4);
    expect(new Set(VUES.map((v) => v.cle)).size).toBe(4);
  });

  it("chacune porte un titre et un corps non vides", () => {
    for (const v of VUES) {
      expect(v.titre.trim().length).toBeGreaterThan(0);
      expect(v.corps.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("le libellé du bouton", () => {
  it("promet la suite tant qu'il y en a une", () => {
    expect(libelleBouton(0)).toBe("Continuer");
    expect(libelleBouton(2)).toBe("Continuer");
  });

  it("annonce l'entrée dans l'application sur la dernière vue", () => {
    // « Suivant » sur la dernière promettrait une quatrième page, et le
    // marchand appuierait une fois de plus pour rien.
    expect(libelleBouton(VUES.length - 1)).toBe("Commencer");
  });

  it("ne promet rien au-delà de la dernière", () => {
    expect(libelleBouton(99)).toBe("Commencer");
  });
});

describe("le libellé d'un point de pagination", () => {
  it("se prononce, là où un point ne se prononce pas", () => {
    expect(libellePoint(0)).toBe("Vue 1 sur 4");
    expect(libellePoint(3)).toBe("Vue 4 sur 4");
  });
});

describe("avancer d'une vue", () => {
  it("avance", () => {
    expect(indexSuivant(0)).toBe(1);
    expect(indexSuivant(2)).toBe(3);
  });

  it("ne sort jamais de la liste", () => {
    // Le bouton reste pressable sur la dernière vue : sans ce bornage,
    // `scrollToIndex` viserait une page qui n'existe pas et lèverait.
    expect(indexSuivant(3)).toBe(3);
    expect(indexSuivant(99)).toBe(3);
  });
});

describe("l'index que désigne un défilement", () => {
  const L = 390;

  it("désigne la page sur laquelle le défilement s'est arrêté", () => {
    expect(indexDeLOffset(0, L)).toBe(0);
    expect(indexDeLOffset(L, L)).toBe(1);
    expect(indexDeLOffset(3 * L, L)).toBe(3);
  });

  /**
   * ⚠ C'EST LA MUTATION QUI COMPTE.
   *
   * Un `Math.floor` rend la vue PRÉCÉDENTE tant que le doigt n'a pas franchi
   * la page entière : les points de pagination retardent alors d'un cran sur
   * ce qu'on voit, et le bouton annonce « Suivant » sur la dernière vue.
   * Vérifié en échec en remplaçant `Math.round` par `Math.floor`.
   */
  it("arrondit, il ne tronque pas", () => {
    expect(indexDeLOffset(L * 0.6, L)).toBe(1);
    expect(indexDeLOffset(L * 2.7, L)).toBe(3);
    // Et l'inverse : un défilement à peine entamé reste sur sa page.
    expect(indexDeLOffset(L * 0.4, L)).toBe(0);
  });

  it("supporte le premier rendu, où la fenêtre n'est pas encore mesurée", () => {
    // Diviser par zéro rendrait `NaN`, et `NaN` borné reste `NaN` : l'écran
    // n'afficherait alors aucun point actif, sans la moindre erreur.
    expect(indexDeLOffset(0, 0)).toBe(0);
    expect(indexDeLOffset(120, 0)).toBe(0);
    expect(indexDeLOffset(Number.NaN, L)).toBe(0);
  });

  it("ne sort pas de la liste sur un rebond élastique", () => {
    // iOS laisse dépasser au-delà de la dernière page, et en deçà de la
    // première : les deux donneraient un index hors bornes.
    expect(indexDeLOffset(-40, L)).toBe(0);
    expect(indexDeLOffset(4.4 * L, L)).toBe(3);
  });
});
