import {
  afficherPartage,
  alerteDisponible,
  ecartDuComptage,
  libelleCanal,
  ligneAjustement,
  ligneTransfert,
  rappelConditionnement,
  resumeConversion,
  saisieRenseignee,
  totalSaisi,
  verifierQuantite,
  type SaisieQuantite,
} from "@/features/stock/lignes-conditionnees";

/** Un casier de 12 bouteilles, vendu en gros ET au détail. */
const CASIER = {
  factor: 12,
  retailWord: "BOUTEILLE",
  packageWord: "CASIER",
  packageOnly: false,
};
/** Une boîte de 28 ampoules, vendue en gros SEUL. */
const BOITE = {
  factor: 28,
  retailWord: "AMPOULE",
  packageWord: "BOITE",
  packageOnly: true,
};

const saisie = (p: Partial<SaisieQuantite> = {}): SaisieQuantite => ({
  conditionnement: CASIER,
  contenants: null,
  vrac: null,
  ...p,
});

describe("le vocabulaire du conditionnement", () => {
  it("nomme le canal sans accord ni élision", () => {
    // « Nombre de AMPOULES » ne s'accorde pas et « de » s'élide devant une
    // voyelle. Le GENRE d'un nom d'unité vient du marchand : il n'est pas
    // dérivable, et « en X » marche pour les deux.
    expect(libelleCanal("AMPOULE")).toBe("Quantité en AMPOULES");
    expect(libelleCanal("CASIER")).toBe("Quantité en CASIERS");
  });

  it("rappelle le facteur avant la saisie, pas après", () => {
    expect(rappelConditionnement(CASIER)).toBe("1 CASIER = 12 BOUTEILLES");
  });
});

describe("le total n'est qu'un contrôle de relecture", () => {
  it("compose les deux canaux au facteur", () => {
    expect(totalSaisi(saisie({ contenants: 2, vrac: 5 }))).toBe(29);
  });

  it("rend la quantité simple telle quelle sans conditionnement", () => {
    expect(totalSaisi(saisie({ conditionnement: null, vrac: 7 }))).toBe(7);
  });

  it("traite un champ vide comme zéro dans le total, jamais dans le contrôle", () => {
    expect(totalSaisi(saisie({ contenants: 3, vrac: null }))).toBe(36);
    expect(saisieRenseignee(saisie({ contenants: null, vrac: null }))).toBe(false);
  });
});

describe("ce qui empêche d'ajouter une ligne", () => {
  it("refuse deux champs vides sur un transfert, en nommant les deux canaux", () => {
    const e = verifierQuantite(saisie());
    expect(e.contenants).toBe("Indiquez une quantité en CASIERS ou en BOUTEILLES.");
  });

  it("accepte un seul canal renseigné", () => {
    expect(verifierQuantite(saisie({ contenants: 2 }))).toEqual({});
    expect(verifierQuantite(saisie({ vrac: 5 }))).toEqual({});
  });

  it("ne parle QUE du contenant sur un article vendu en gros seul", () => {
    // Le champ vrac n'existe pas à l'écran, et le serveur refuse tout vrac sur
    // un tel article : proposer les deux canaux ferait découvrir le refus après
    // l'impression.
    const e = verifierQuantite(saisie({ conditionnement: BOITE }));
    expect(e.contenants).toBe("Indiquez une quantité en BOITES.");
    expect(e.vrac).toBeUndefined();
  });

  it("refuse une quantité nulle sur un transfert : le serveur la refuse aussi", () => {
    expect(verifierQuantite(saisie({ contenants: 0, vrac: 0 })).contenants).toBeDefined();
    expect(
      verifierQuantite(saisie({ conditionnement: null, vrac: 0 })).vrac
    ).toBe("Indiquez une quantité.");
  });

  it("ACCEPTE zéro sur un comptage : un rayon vide est un constat", () => {
    // C'est l'écart le plus important qu'un ajustement existe pour écrire.
    expect(verifierQuantite(saisie({ contenants: 0, vrac: 0 }), { zeroAccepte: true })).toEqual({});
    expect(
      verifierQuantite(saisie({ conditionnement: null, vrac: 0 }), { zeroAccepte: true })
    ).toEqual({});
  });

  it("refuse quand même la saisie VIDE sur un comptage", () => {
    // Deux champs blancs ne disent pas « rien en rayon », ils ne disent rien.
    const e = verifierQuantite(saisie(), { zeroAccepte: true });
    expect(e.contenants).toBe("Indiquez ce que vous avez compté, même si c'est zéro.");
  });
});

describe("le récapitulatif de conversion", () => {
  it("écrit les deux canaux et leur somme", () => {
    expect(resumeConversion(saisie({ contenants: 2, vrac: 5 }), "transférez")).toBe(
      "Vous transférez 2 CASIERS + 5 BOUTEILLES = 29 BOUTEILLES."
    );
  });

  it("n'écrit que le canal servi", () => {
    expect(resumeConversion(saisie({ contenants: 1 }), "comptez")).toBe(
      "Vous comptez 1 CASIER = 12 BOUTEILLES."
    );
  });

  it("se tait sans conditionnement : il n'y a rien à convertir", () => {
    expect(resumeConversion(saisie({ conditionnement: null, vrac: 9 }), "comptez")).toBeNull();
  });

  it("se tait tant que rien n'est tapé", () => {
    expect(resumeConversion(saisie(), "transférez")).toBeNull();
  });
});

describe("le partage d'un rayon est LU, jamais redécoupé", () => {
  it("rend « 3 CASIERS + 27 BOUTEILLES » et non « 4 CASIERS + 3 BOUTEILLES »", () => {
    // Redécouper le total au facteur du jour est la contrevérité la plus
    // trompeuse de ce domaine : elle a l'air exacte.
    expect(afficherPartage(CASIER, { contenants: 3, vrac: 27, total: 63 })).toBe(
      "3 CASIERS + 27 BOUTEILLES"
    );
  });
});

describe("l'avertissement de disponible", () => {
  const dispo = { contenants: 3, vrac: 7, total: 43 };

  it("se tait tant qu'on reste sous le disponible", () => {
    expect(alerteDisponible(saisie({ contenants: 3 }), dispo)).toBeNull();
  });

  it("mord PAR CANAL, même quand le total suffit largement", () => {
    // 5 casiers demandés sur 43 unités disponibles : le total suffit, mais le
    // serveur refuse à l'expédition faute de scellés (`assert_sealed_available`),
    // et des unités en vrac ne se remettent pas dans un emballage neuf.
    const a = alerteDisponible(saisie({ contenants: 5 }), dispo);
    expect(a).toContain("3 CASIERS en scellé");
    expect(a).toContain("expédition sera refusée");
  });

  it("laisse le détail puiser dans les scellés : le serveur ouvre un contenant", () => {
    // `ensure_loose_available` ouvre autant de contenants qu'il faut : c'est le
    // TOTAL qui borne le détail, pas le vrac isolé.
    expect(alerteDisponible(saisie({ vrac: 40 }), dispo)).toBeNull();
    expect(alerteDisponible(saisie({ vrac: 44 }), dispo)).toContain("au détail");
  });

  it("décompte les scellés déjà demandés du reste au détail", () => {
    // 3 casiers = 36 unités engagées ; il n'en reste que 7 pour le détail.
    expect(alerteDisponible(saisie({ contenants: 3, vrac: 7 }), dispo)).toBeNull();
    expect(alerteDisponible(saisie({ contenants: 3, vrac: 8 }), dispo)).toContain(
      "7 BOUTEILLES au détail"
    );
  });

  it("se tait quand le dépôt tolère les soldes négatifs", () => {
    // Le serveur n'oppose alors RIEN à l'expédition. Avertir d'un refus qui
    // n'aura pas lieu apprend à ne plus lire l'écran.
    expect(
      alerteDisponible(saisie({ contenants: 99 }), dispo, { negatifAutorise: true })
    ).toBeNull();
  });

  it("se tait sans ligne de stock : `null` n'est pas zéro", () => {
    expect(alerteDisponible(saisie({ contenants: 2 }), null)).toBeNull();
  });
});

describe("l'écart d'un comptage est VENTILÉ par canal", () => {
  it("désigne chaque cause là où le total les compense", () => {
    // Il manque 2 casiers et il y a 5 bouteilles de trop : le total dit -19,
    // ce qui n'apprend rien sur ce qui s'est passé en rayon.
    const e = ecartDuComptage(
      CASIER,
      { contenants: 5, vrac: 2, total: 62 },
      saisie({ contenants: 3, vrac: 7 })
    );
    expect(e.texte).toBe("-2 CASIERS, +5 BOUTEILLES");
    expect(e.total).toBe(43 - 62);
    expect(e.signe).toBe(-1);
  });

  it("MONTRE un déplacement entre canaux que le total ne voit pas", () => {
    // Attendu 1 casier + 30 bouteilles isolées, compté 3 casiers + 6 : le total
    // est le MÊME des deux côtés (42), et pourtant vingt-quatre bouteilles ont
    // changé de canal. Un écart réduit à son total dirait « conforme » et le
    // magasinier n'aurait aucune raison de chercher.
    //
    // ⚠ `splitPackaged` ne RESCELLE PAS le vrac au-delà du facteur, et c'est
    // délibéré des deux côtés (« un contenant entamé ne se rescelle pas ») :
    // l'attendu reste « 1 casier + 30 bouteilles », jamais « 3 casiers + 6 ».
    const e = ecartDuComptage(
      CASIER,
      { contenants: 1, vrac: 30, total: 42 },
      saisie({ contenants: 3, vrac: 6 })
    );
    expect(e.texte).toBe("+2 CASIERS, -24 BOUTEILLES");
    // Le TOTAL, lui, est bien nul : c'est ce que la ventilation sauve.
    expect(e.total).toBe(0);
    expect(e.signe).toBe(0);
  });

  it("reste neutre sur un écart nul", () => {
    const e = ecartDuComptage(
      CASIER,
      { contenants: 2, vrac: 3, total: 27 },
      saisie({ contenants: 2, vrac: 3 })
    );
    expect(e.signe).toBe(0);
  });

  it("sans conditionnement, rend un nombre signé", () => {
    const e = ecartDuComptage(
      null,
      { contenants: 0, vrac: 0, total: 10 },
      saisie({ conditionnement: null, vrac: 14 })
    );
    expect(e.texte).toBe("+4");
    expect(e.signe).toBe(1);
  });
});

describe("ce qui part au serveur", () => {
  it("n'envoie PAS de quantité simple sur une ligne de transfert conditionnée", () => {
    // Le serveur recompose (`to_base`) : lui souffler le total ferait cohabiter
    // deux vérités sur la même ligne.
    const l = ligneTransfert("p1", saisie({ contenants: 2, vrac: 5 }));
    expect(l).toEqual({ produit: "p1", quantite: 29, contenants: 2, vrac: 5 });
  });

  it("force le vrac à zéro sur un article vendu en gros seul", () => {
    // Une valeur restée d'un article précédent ne doit pas partir : le champ
    // n'existe même pas à l'écran, et le serveur refuserait la ligne.
    const l = ligneTransfert("p1", saisie({ conditionnement: BOITE, contenants: 3, vrac: 9 }));
    expect(l.vrac).toBe(0);
    expect(l.contenants).toBe(3);
  });

  it("n'envoie AUCUN contenant sans conditionnement", () => {
    const l = ligneTransfert("p1", saisie({ conditionnement: null, vrac: 7 }));
    expect(l).toEqual({ produit: "p1", quantite: 7 });
    expect(l.contenants).toBeUndefined();
  });

  it("joint l'attendu RELEVÉ à une ligne de comptage, jamais un attendu saisi", () => {
    const l = ligneAjustement(
      "p1",
      { contenants: 5, vrac: 2, total: 62 },
      saisie({ contenants: 3, vrac: 7 })
    );
    expect(l).toEqual({
      produit: "p1",
      attendu: 62,
      compte: 43,
      contenantsComptes: 3,
      vracCompte: 7,
    });
  });

  it("porte un comptage à ZÉRO sans le confondre avec une absence", () => {
    const l = ligneAjustement(
      "p1",
      { contenants: 1, vrac: 0, total: 12 },
      saisie({ contenants: 0, vrac: 0 })
    );
    expect(l.compte).toBe(0);
    expect(l.contenantsComptes).toBe(0);
    expect(l.vracCompte).toBe(0);
  });
});
