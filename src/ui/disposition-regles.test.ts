import {
  diametreDeLAnneau,
  DIAMETRE_ANNEAU_LISIBLE,
  LARGEUR_LATERALE_MAX,
  LARGEUR_LATERALE_MIN,
  LARGEUR_RAIL,
  LARGEUR_VOLET_LISTE_MAX,
  LARGEUR_VOLET_LISTE_MIN,
  SEUIL_LARGE,
  SEUIL_LISTE_FICHE,
  SEUIL_MOYEN,
  afficheLibelles,
  classeDeFenetre,
  colonnesEquilibrees,
  colonnesPour,
  depliageDuRail,
  estAuComptoir,
  estPaysage,
  estTablette,
  formeDeModale,
  largeurDeLaLaterale,
  largeurDeNavigation,
  largeurDuVoletFiche,
  largeurDuVoletListe,
  largeurMaxDe,
  margePage,
  navigationPour,
  repartirEnColonnes,
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
    expect(largeurDeNavigation("barre", 1920)).toBe(0);
    expect(largeurDeNavigation("rail", 1920)).toBe(LARGEUR_RAIL);
    expect(largeurDeNavigation("laterale", 1920)).toBe(320);
  });

  it("élargit la barre latérale avec la fenêtre, entre deux bornes", () => {
    // Jamais sous le `w-64` du back-office, même sur la plus petite fenêtre
    // qui la porte.
    expect(largeurDeLaLaterale(SEUIL_LARGE)).toBe(LARGEUR_LATERALE_MIN);
    expect(largeurDeLaLaterale(1280)).toBe(256);
    expect(largeurDeLaLaterale(1680)).toBe(280);
    expect(largeurDeLaLaterale(1920)).toBe(320);
    expect(largeurDeLaLaterale(3840)).toBe(LARGEUR_LATERALE_MAX);
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

describe("des rangées équilibrées", () => {
  it("préfère deux rangées pleines à une rangée et demie", () => {
    // Six relevés : trois par rangée plutôt que quatre puis deux.
    expect(colonnesEquilibrees(6, 4)).toBe(3);
    // Quatre relevés : deux et deux plutôt que trois puis un.
    expect(colonnesEquilibrees(4, 3)).toBe(2);
    // Cinq tuiles : trois puis deux plutôt que quatre puis un.
    expect(colonnesEquilibrees(5, 4)).toBe(3);
  });

  it("prend tout sur une rangée quand la place le permet", () => {
    expect(colonnesEquilibrees(6, 6)).toBe(6);
    expect(colonnesEquilibrees(4, 6)).toBe(4);
    expect(colonnesEquilibrees(2, 6)).toBe(2);
  });

  it("ne dépasse jamais ce que la largeur permet", () => {
    expect(colonnesEquilibrees(8, 2)).toBe(2);
    expect(colonnesEquilibrees(8, 6)).toBe(4);
    expect(colonnesEquilibrees(1, 6)).toBe(1);
  });
});

describe("la liste et sa fiche", () => {
  it("prend 40 % de la page, entre ses deux bornes", () => {
    expect(largeurDuVoletListe(SEUIL_LISTE_FICHE)).toBe(LARGEUR_VOLET_LISTE_MIN);
    expect(largeurDuVoletListe(1024)).toBe(410);
    expect(largeurDuVoletListe(1600)).toBe(LARGEUR_VOLET_LISTE_MAX);
    expect(largeurDuVoletListe(3000)).toBe(LARGEUR_VOLET_LISTE_MAX);
  });

  it("couvre toute la page : liste, filet et fiche", () => {
    for (const page of [900, 1024, 1280, 1600, 2560]) {
      expect(largeurDuVoletListe(page) + 1 + largeurDuVoletFiche(page)).toBe(page);
    }
  });

  /**
   * ⚠ Une liste qui atteindrait 600 points deviendrait une « tablette » pour
   * `Screen`, qui lui poserait une gouttière dans sa propre colonne.
   */
  it("reste une colonne de téléphone, quelle que soit la page", () => {
    expect(classeDeFenetre(LARGEUR_VOLET_LISTE_MAX)).toBe("compact");
  });

  it("laisse à la fiche la place de ses montants", () => {
    for (const page of [900, 1000, 1280, 1600]) {
      expect(largeurDuVoletFiche(page)).toBeGreaterThanOrEqual(539);
    }
  });
});

describe("les colonnes de cartes", () => {
  it("garde l'ordre de lecture à l'intérieur de chaque colonne", () => {
    for (const groupe of repartirEnColonnes([3, 1, 4, 1, 5, 9, 2, 6], 3)) {
      expect(groupe).toEqual([...groupe].sort((a, b) => a - b));
    }
  });

  it("n'oublie aucun bloc, et n'en range aucun deux fois", () => {
    const groupes = repartirEnColonnes([1, 2, 3, 4, 5], 2);
    expect(groupes.flat().sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("pose chaque bloc dans la colonne la plus courte", () => {
    // Le grand bloc occupe la première colonne : les trois petits vont en face.
    expect(repartirEnColonnes([9, 1, 1, 1], 2)).toEqual([[0], [1, 2, 3]]);
  });

  it("rend tout sur une colonne quand il n'y en a qu'une", () => {
    expect(repartirEnColonnes([2, 2], 1)).toEqual([[0, 1]]);
  });
});

describe("les libellés des boutons à icône", () => {
  it("n'apparaissent que là où il y a la place", () => {
    expect(afficheLibelles(448)).toBe(false);
    // Une liste à côté de sa fiche reste une colonne de téléphone.
    expect(afficheLibelles(LARGEUR_VOLET_LISTE_MAX)).toBe(false);
    expect(afficheLibelles(720)).toBe(true);
    expect(afficheLibelles(1600)).toBe(true);
  });
});

describe("le gabarit, la marge, la modale", () => {
  it("ne borne plus que la carte seule d'une connexion", () => {
    expect(largeurMaxDe("etroit")).toBe(480);
    expect(largeurMaxDe("page")).toBeNull();
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

describe("l'anneau de répartition", () => {
  it("prend le diamètre lisible à côté de sa légende", () => {
    expect(diametreDeLAnneau(600, 168)).toBe(DIAMETRE_ANNEAU_LISIBLE);
  });

  it("suit la largeur une fois empilé, jusqu'au diamètre lisible", () => {
    // Une carte d'accueil de tablette en deux colonnes, puis un téléphone : le
    // centre doit tenir le total, plus seulement à 1 920 points.
    expect(diametreDeLAnneau(374, 168)).toBe(DIAMETRE_ANNEAU_LISIBLE);
    expect(diametreDeLAnneau(296, 168)).toBe(177);
  });

  it("ne descend jamais sous le diamètre demandé", () => {
    expect(diametreDeLAnneau(200, 168)).toBe(168);
  });
});

describe("le bouton qui déplie le rail", () => {
  it("rend la barre fixe sur un grand écran", () => {
    expect(depliageDuRail("large", "/articles")).toBe("barre");
  });

  it("ouvre le menu par-dessus la page au comptoir, qui garde toute sa place", () => {
    expect(depliageDuRail("large", "/vendre")).toBe("tiroir");
  });

  it("ouvre le menu par-dessus la page là où la barre fixe ne tient pas", () => {
    expect(depliageDuRail("moyen", "/articles")).toBe("tiroir");
  });
});
