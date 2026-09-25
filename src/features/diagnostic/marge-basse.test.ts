import {
  margeBasseEffective,
  PLANCHER_BARRE_SYSTEME,
  verdict,
  type Mesures,
} from "./marge-basse";

const base: Mesures = { hauteurEcran: 997, hauteurFenetre: 997, margeBasse: 24 };

describe("verdict de la marge basse", () => {
  it("bord-à-bord avec marge rapportée : conforme", () => {
    expect(verdict(base)).toBe("conforme");
  });

  it("bord-à-bord SANS marge : c'est le défaut", () => {
    // Le cas rapporté par l'utilisateur : la fenêtre descend jusqu'au bord et
    // personne ne réserve la place de la barre gestuelle.
    expect(verdict({ ...base, margeBasse: 0 })).toBe("marge_absente");
  });

  it("fenêtre insérée par le système : une marge nulle est JUSTE", () => {
    // 997 d'écran pour 973 de fenêtre : les 24 points manquants SONT la barre,
    // déjà retirés par le système. Poser une marge ici ajouterait une bande
    // morte sur un appareil parfaitement sain.
    expect(
      verdict({ hauteurEcran: 997, hauteurFenetre: 973, margeBasse: 0 })
    ).toBe("fenetre_inseree");
  });

  it("un écart d'arrondi n'est PAS une fenêtre insérée", () => {
    // Les deux hauteurs viennent de sources différentes. Sans tolérance, un
    // point d'écart classerait un appareil bord-à-bord à l'envers, et le
    // défaut passerait pour normal.
    expect(
      verdict({ hauteurEcran: 997, hauteurFenetre: 996, margeBasse: 0 })
    ).toBe("marge_absente");
  });

  it("des mesures absentes ne fabriquent pas un défaut", () => {
    // Au tout premier rendu les mesures valent zéro. Conclure « marge absente »
    // ferait poser une bande morte le temps d'une image.
    expect(verdict({ hauteurEcran: 0, hauteurFenetre: 0, margeBasse: 0 })).toBe(
      "conforme"
    );
  });
});

describe("la marge basse a poser", () => {
  it("rend ce que le systeme annonce quand il l'annonce", () => {
    expect(margeBasseEffective(base)).toBe(24);
  });

  it("pose le plancher, et SEULEMENT sur le defaut", () => {
    // C'est la seule branche qui ajoute quoi que ce soit. Un `Math.max` chez
    // l'appelant rendrait 48 dans les deux cas suivants, donc une bande morte
    // sur un appareil que le systeme insere correctement.
    expect(margeBasseEffective({ ...base, margeBasse: 0 })).toBe(
      PLANCHER_BARRE_SYSTEME
    );
  });

  it("n'ajoute RIEN quand le systeme insere la fenetre", () => {
    expect(
      margeBasseEffective({ hauteurEcran: 997, hauteurFenetre: 973, margeBasse: 0 })
    ).toBe(0);
  });

  it("n'ajoute RIEN sur des mesures absentes", () => {
    // Au premier rendu tout vaut zero : y poser 48 ferait sauter la mise en
    // page le temps d'une image, sur tous les appareils.
    expect(
      margeBasseEffective({ hauteurEcran: 0, hauteurFenetre: 0, margeBasse: 0 })
    ).toBe(0);
  });

  it("ne RABOTE jamais une marge plus grande que le plancher", () => {
    // Une barre a trois boutons correctement annoncee vaut 48, un iPhone 34.
    // Le plancher est un plancher, pas une valeur imposee.
    expect(margeBasseEffective({ ...base, margeBasse: 62 })).toBe(62);
  });
});
