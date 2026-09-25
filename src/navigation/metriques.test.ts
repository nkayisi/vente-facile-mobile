import { HAUTEUR_ONGLETS, styleBarreOnglets } from "./metriques";

describe("le style de la barre d'onglets", () => {
  it("redonne EXACTEMENT la géométrie d'origine quand le système annonce sa marge", () => {
    // C'est l'invariant qui rend la compensation sûre à livrer sans avoir vu
    // le défaut : sur un appareil sain, rien ne bouge.
    expect(styleBarreOnglets(24)).toEqual({
      height: HAUTEUR_ONGLETS + 24,
      paddingBottom: 24,
    });
    expect(styleBarreOnglets(0)).toEqual({ height: HAUTEUR_ONGLETS, paddingBottom: 0 });
  });

  it("GRANDIT de la marge posée, et la réserve à l'intérieur", () => {
    // Le cas `marge_absente` : la barre doit à la fois monter de 48 points et
    // pousser ses icônes de 48 vers le haut. `height` sans `paddingBottom`
    // laisserait les icônes centrées sur la barre du système.
    expect(styleBarreOnglets(48)).toEqual({
      height: HAUTEUR_ONGLETS + 48,
      paddingBottom: 48,
    });
  });
});
