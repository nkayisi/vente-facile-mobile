import {
  LARGEUR_LATERALE,
  LARGEUR_RAIL,
  SEUIL_LARGE,
  SEUIL_MOYEN,
  classeDeFenetre,
  colonnesPour,
  estAuComptoir,
  estPaysage,
  estTablette,
  formeDeModale,
  largeurDeNavigation,
  largeurMaxDe,
  margePage,
  navigationPour,
  verrouPour,
} from "./disposition-regles";

/**
 * Les appareils de référence, relevés et non inventés : l'émulateur du
 * développeur, le terminal rk3568 du comptoir (1920 × 1080 à densité 1), et les
 * deux tailles de tablette courantes, dans les deux sens.
 */
const APPAREILS = {
  emulateur: { l: 448, h: 997 },
  petitTelephone: { l: 360, h: 640 },
  tablette7Portrait: { l: 600, h: 960 },
  tablette7Paysage: { l: 960, h: 600 },
  tablette10Portrait: { l: 800, h: 1280 },
  tablette10Paysage: { l: 1280, h: 800 },
  rk3568: { l: 1920, h: 1080 },
};

describe("la classe de fenêtre", () => {
  it("suit les seuils du back-office", () => {
    expect(classeDeFenetre(SEUIL_MOYEN - 1)).toBe("compact");
    expect(classeDeFenetre(SEUIL_MOYEN)).toBe("moyen");
    expect(classeDeFenetre(SEUIL_LARGE - 1)).toBe("moyen");
    expect(classeDeFenetre(SEUIL_LARGE)).toBe("large");
  });

  it("range chaque appareil de référence", () => {
    expect(classeDeFenetre(APPAREILS.emulateur.l)).toBe("compact");
    expect(classeDeFenetre(APPAREILS.petitTelephone.l)).toBe("compact");
    expect(classeDeFenetre(APPAREILS.tablette7Portrait.l)).toBe("moyen");
    expect(classeDeFenetre(APPAREILS.tablette7Paysage.l)).toBe("moyen");
    expect(classeDeFenetre(APPAREILS.tablette10Portrait.l)).toBe("moyen");
    expect(classeDeFenetre(APPAREILS.tablette10Paysage.l)).toBe("large");
    expect(classeDeFenetre(APPAREILS.rk3568.l)).toBe("large");
  });
});

describe("tablette ou téléphone", () => {
  /**
   * ⚠ LE PLUS PETIT CÔTÉ, JAMAIS LA LARGEUR : un téléphone tenu en paysage fait
   * 997 de large et reste un téléphone. Juger sur la largeur le libérerait de
   * son verrou portrait dès qu'on le tourne.
   */
  it("se reconnaît au plus petit côté, quel que soit le sens", () => {
    expect(estTablette(448, 997)).toBe(false);
    expect(estTablette(997, 448)).toBe(false);
    expect(estTablette(600, 960)).toBe(true);
    expect(estTablette(960, 600)).toBe(true);
    expect(estTablette(1920, 1080)).toBe(true);
  });

  it("dit le paysage", () => {
    expect(estPaysage(1920, 1080)).toBe(true);
    expect(estPaysage(448, 997)).toBe(false);
  });

  it("verrouille le téléphone en portrait, libère la tablette", () => {
    expect(verrouPour(448, 997)).toBe("portrait");
    expect(verrouPour(997, 448)).toBe("portrait");
    expect(verrouPour(1920, 1080)).toBe("libre");
    expect(verrouPour(600, 960)).toBe("libre");
  });
});

describe("la navigation", () => {
  it("téléphone : la barre d'onglets, comme aujourd'hui", () => {
    expect(navigationPour("compact", false, "/")).toBe("barre");
    expect(navigationPour("compact", true, "/vendre")).toBe("barre");
  });

  it("tablette étroite : le rail", () => {
    expect(navigationPour("moyen", false, "/")).toBe("rail");
  });

  it("grand écran : la barre latérale, sauf repliée ou au comptoir", () => {
    expect(navigationPour("large", false, "/")).toBe("laterale");
    expect(navigationPour("large", false, "/ventes")).toBe("laterale");
    expect(navigationPour("large", true, "/")).toBe("rail");
    expect(navigationPour("large", false, "/vendre")).toBe("rail");
  });

  /**
   * ⚠ Le comptoir se reconnaît à SON chemin, pas à un préfixe : `/vente/123`
   * (une fiche de vente) n'est pas le comptoir, et y replier la barre ferait
   * sauter toute la page à l'ouverture d'une fiche.
   */
  it("ne confond pas le comptoir avec une fiche de vente", () => {
    expect(estAuComptoir("/vendre")).toBe(true);
    expect(estAuComptoir("/vente/abc")).toBe(false);
    expect(estAuComptoir("/ventes")).toBe(false);
    expect(estAuComptoir(null)).toBe(false);
  });

  it("donne la largeur réservée par chaque forme", () => {
    expect(largeurDeNavigation("barre")).toBe(0);
    expect(largeurDeNavigation("rail")).toBe(LARGEUR_RAIL);
    expect(largeurDeNavigation("laterale")).toBe(LARGEUR_LATERALE);
    // Le `w-64` du back-office : la même barre, à la même largeur.
    expect(LARGEUR_LATERALE).toBe(256);
  });
});

describe("les colonnes", () => {
  it("tient autant de cellules que la largeur le permet, écart compris", () => {
    // 2 cellules de 160 + 1 écart de 12 = 332.
    expect(colonnesPour(332, { largeurMin: 160 })).toBe(2);
    expect(colonnesPour(331, { largeurMin: 160 })).toBe(1);
  });

  it("reste dans ses bornes", () => {
    expect(colonnesPour(100, { largeurMin: 160, min: 2 })).toBe(2);
    expect(colonnesPour(5000, { largeurMin: 160, max: 4 })).toBe(4);
  });

  it("ne rend jamais zéro, même sans largeur connue", () => {
    expect(colonnesPour(0, { largeurMin: 160 })).toBe(1);
    expect(colonnesPour(Number.NaN, { largeurMin: 160, min: 2 })).toBe(2);
  });
});

describe("le gabarit, la marge, la modale", () => {
  it("borne chaque gabarit, sauf le comptoir", () => {
    expect(largeurMaxDe("etroit")).toBe(480);
    expect(largeurMaxDe("lecture")).toBe(760);
    expect(largeurMaxDe("large")).toBe(1280);
    expect(largeurMaxDe("plein")).toBeNull();
  });

  it("élargit la marge de page hors du téléphone, comme `p-4 lg:p-6` du web", () => {
    expect(margePage("compact")).toBe(16);
    expect(margePage("moyen")).toBe(24);
    expect(margePage("large")).toBe(24);
  });

  it("monte la modale du bas sur un téléphone, la pose au centre ailleurs", () => {
    expect(formeDeModale("compact")).toBe("feuille");
    expect(formeDeModale("moyen")).toBe("dialogue");
    expect(formeDeModale("large")).toBe("dialogue");
  });
});
