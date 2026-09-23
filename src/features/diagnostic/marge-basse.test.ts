import { verdict, type Mesures } from "./marge-basse";

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
