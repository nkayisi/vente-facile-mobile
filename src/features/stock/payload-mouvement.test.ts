import type { Packaging } from "@vente-facile/core";

import {
  apercuDuCoutMelange,
  corpsDuMouvement,
  corpsJsonDuMouvement,
  resumeDeConversion,
  verifierLaSaisie,
  type SaisieFormulaireMouvement,
} from "./payload-mouvement";

const CARTON: Packaging = {
  factor: 12,
  retailWord: "bouteille",
  packageWord: "carton",
  packageOnly: false,
};
const CASIER_SCELLE: Packaging = { ...CARTON, packageWord: "casier", packageOnly: true };

function saisie(sur: Partial<SaisieFormulaireMouvement> = {}): SaisieFormulaireMouvement {
  return {
    produit: "p1",
    entrepot: "w1",
    type: "purchase",
    conditionnement: null,
    aUneDatePeremption: false,
    contenants: null,
    vrac: null,
    coutDetail: null,
    coutContenant: null,
    prixDetail: null,
    prixGros: null,
    reporterLesPrix: false,
    emplacement: null,
    peremption: null,
    notes: "",
    ...sur,
  };
}

describe("le corps du mouvement, selon le mode de vente", () => {
  it("au DÉTAIL seul : une quantité simple, et rien du conditionnement", () => {
    const c = corpsDuMouvement(saisie({ vrac: 10, coutDetail: 1200 }));
    expect(c.quantite).toBe(10);
    expect(c.coutUnitaire).toBe(1200);
    expect(c.contenants).toBeUndefined();
    expect(c.vrac).toBeUndefined();
    expect(c.coutContenant).toBeUndefined();
  });

  it("en GROS ET DÉTAIL : les deux compteurs, les deux coûts, JAMAIS de total", () => {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ AUCUNE CONVERSION SUR L'APPAREIL.                                │
    // │ `2 × 12 + 3 = 27` est l'affaire du serveur : une seconde         │
    // │ arithmétique du conditionnement finirait par diverger.           │
    // └──────────────────────────────────────────────────────────────────┘
    const c = corpsDuMouvement(
      saisie({
        conditionnement: CARTON,
        contenants: 2,
        vrac: 3,
        coutDetail: 550,
        coutContenant: 6000,
      })
    );
    expect(c.contenants).toBe(2);
    expect(c.vrac).toBe(3);
    expect(c.coutUnitaire).toBe(550);
    expect(c.coutContenant).toBe(6000);
    expect(c.quantite).toBeUndefined();
  });

  it("en GROS SEUL : le vrac vaut ZÉRO, présent, et le coût de détail ne part pas", () => {
    // `loose_quantity: 0` doit être ENVOYÉ, pas omis : une valeur restée d'un
    // article précédent partirait sinon avec la saisie suivante.
    const c = corpsDuMouvement(
      saisie({
        conditionnement: CASIER_SCELLE,
        contenants: 3,
        vrac: 7,
        coutDetail: 550,
        coutContenant: 6000,
      })
    );
    expect(c.contenants).toBe(3);
    expect(c.vrac).toBe(0);
    expect(c.coutUnitaire).toBeUndefined();
    expect(c.coutContenant).toBe(6000);
  });
});

describe("une SORTIE ne déclare aucun prix d'achat", () => {
  it("retire les deux coûts, l'emplacement et la péremption", () => {
    // Sa valeur vient des lots consommés, pas d'un prix saisi au comptoir.
    const c = corpsDuMouvement(
      saisie({
        type: "damage",
        conditionnement: CARTON,
        contenants: 1,
        vrac: 2,
        coutDetail: 550,
        coutContenant: 6000,
        emplacement: "loc1",
        peremption: "2026-12-31",
      })
    );
    expect(c.contenants).toBe(1);
    expect(c.vrac).toBe(2);
    expect(c.coutUnitaire).toBeUndefined();
    expect(c.coutContenant).toBeUndefined();
    expect(c.emplacement).toBeUndefined();
    expect(c.peremption).toBeUndefined();
  });
});

describe("un coût NUL vaut « non saisi »", () => {
  it("ne l'envoie pas : le figer ferait croire à un achat gratuit", () => {
    // C'est déjà la convention du serveur (`_apply_costs` : `x or None`).
    const c = corpsDuMouvement(saisie({ vrac: 5, coutDetail: 0 }));
    expect(c.coutUnitaire).toBeUndefined();
  });
});

describe("le report des prix sur la fiche produit", () => {
  it("n'envoie RIEN tant que la case n'est pas cochée", () => {
    const c = corpsDuMouvement(
      saisie({
        conditionnement: CARTON,
        contenants: 1,
        prixDetail: 2000,
        prixGros: 22000,
        reporterLesPrix: false,
      })
    );
    expect(c.reporterLesPrix).toBeUndefined();
    expect(c.prixDetail).toBeUndefined();
    expect(c.prixGros).toBeUndefined();
  });

  it("envoie les deux prix quand l'article sert les deux canaux", () => {
    const c = corpsDuMouvement(
      saisie({
        conditionnement: CARTON,
        contenants: 1,
        prixDetail: 2000,
        prixGros: 22000,
        reporterLesPrix: true,
      })
    );
    expect(c.reporterLesPrix).toBe(true);
    expect(c.prixDetail).toBe(2000);
    expect(c.prixGros).toBe(22000);
  });

  it("tait le prix de DÉTAIL sur un article vendu en gros seul", () => {
    const c = corpsDuMouvement(
      saisie({
        conditionnement: CASIER_SCELLE,
        contenants: 1,
        prixDetail: 2000,
        prixGros: 22000,
        reporterLesPrix: true,
      })
    );
    expect(c.prixDetail).toBeUndefined();
    expect(c.prixGros).toBe(22000);
  });

  it("tait le prix de GROS sur un article sans conditionnement", () => {
    const c = corpsDuMouvement(
      saisie({ vrac: 5, prixDetail: 2000, prixGros: 22000, reporterLesPrix: true })
    );
    expect(c.prixDetail).toBe(2000);
    expect(c.prixGros).toBeUndefined();
  });

  it("ne part pas sur une sortie : le serveur le refuserait", () => {
    const c = corpsDuMouvement(
      saisie({ type: "damage", vrac: 5, prixDetail: 2000, reporterLesPrix: true })
    );
    expect(c.reporterLesPrix).toBeUndefined();
    expect(c.prixDetail).toBeUndefined();
  });
});

describe("ce qui empêche d'enregistrer", () => {
  it("refuse une saisie vide, en NOMMANT les deux canaux", () => {
    const e = verifierLaSaisie(saisie({ conditionnement: CARTON }));
    expect(e.contenants).toBe("Indiquez une quantité en cartons ou en bouteilles.");
  });

  it("ne parle QUE des contenants sur un article vendu en gros seul", () => {
    const e = verifierLaSaisie(saisie({ conditionnement: CASIER_SCELLE }));
    expect(e.contenants).toBe("Indiquez une quantité en casiers.");
  });

  it("accepte une saisie sur un SEUL des deux canaux", () => {
    expect(verifierLaSaisie(saisie({ conditionnement: CARTON, vrac: 3 }))).toEqual({});
    expect(verifierLaSaisie(saisie({ conditionnement: CARTON, contenants: 1 }))).toEqual({});
  });

  it("réclame une quantité sur un article sans conditionnement", () => {
    expect(verifierLaSaisie(saisie()).quantite).toBe("Indiquez une quantité.");
  });

  it("exige la péremption d'un produit périssable qui ENTRE", () => {
    const e = verifierLaSaisie(saisie({ vrac: 5, aUneDatePeremption: true }));
    expect(e.peremption).toContain("périssable");
  });

  it("ne la réclame pas sur une SORTIE : rien n'entre en stock", () => {
    const e = verifierLaSaisie(
      saisie({ type: "damage", vrac: 5, aUneDatePeremption: true })
    );
    expect(e.peremption).toBeUndefined();
  });
});

describe("le récapitulatif relu avant de valider", () => {
  it("écrit les deux canaux et leur total, avec le bon verbe", () => {
    expect(
      resumeDeConversion(saisie({ conditionnement: CARTON, contenants: 2, vrac: 5 }))
    ).toBe("Vous ajoutez 2 cartons + 5 bouteilles = 29 bouteilles.");
  });

  it("dit « retirez » sur une sortie", () => {
    expect(
      resumeDeConversion(
        saisie({ type: "damage", conditionnement: CARTON, contenants: 1, vrac: 0 })
      )
    ).toBe("Vous retirez 1 carton = 12 bouteilles.");
  });

  it("se tait quand il n'y a rien à récapituler", () => {
    expect(resumeDeConversion(saisie({ conditionnement: CARTON }))).toBeNull();
    expect(resumeDeConversion(saisie({ vrac: 5 }))).toBeNull();
  });
});

describe("l'aperçu du coût mélangé", () => {
  it("le calcule quand les DEUX canaux sont servis à deux prix", () => {
    // 2 cartons à 6 000 plus 3 bouteilles à 550, sur 12 bouteilles par carton :
    // (12 000 + 1 650) / (24 + 3) = 505,56.
    const v = apercuDuCoutMelange(
      saisie({
        conditionnement: CARTON,
        contenants: 2,
        vrac: 3,
        coutContenant: 6000,
        coutDetail: 550,
      })
    );
    expect(v).toBeCloseTo(505.56, 2);
  });

  it("se tait quand un seul canal est servi : il n'y a rien à mélanger", () => {
    expect(
      apercuDuCoutMelange(
        saisie({ conditionnement: CARTON, contenants: 2, coutContenant: 6000 })
      )
    ).toBeNull();
  });

  it("se tait sur une sortie et sans conditionnement", () => {
    expect(
      apercuDuCoutMelange(
        saisie({ type: "damage", conditionnement: CARTON, contenants: 2, vrac: 3,
                 coutContenant: 6000, coutDetail: 550 })
      )
    ).toBeNull();
    expect(apercuDuCoutMelange(saisie({ vrac: 5, coutDetail: 550 }))).toBeNull();
  });
});

describe("le contrat du transport", () => {
  it("met les décimales en CHAÎNES et omet ce qui n'est pas saisi", () => {
    const json = corpsJsonDuMouvement(
      corpsDuMouvement(
        saisie({ conditionnement: CARTON, contenants: 2, vrac: 3, coutDetail: 550 })
      )
    );
    expect(json.package_quantity).toBe("2");
    expect(json.loose_quantity).toBe("3");
    expect(json.unit_cost).toBe("550");
    expect(json).not.toHaveProperty("quantity");
    for (const [cle, valeur] of Object.entries(json)) {
      expect(valeur).not.toBeNull();
      expect(valeur).toBeDefined();
      expect(cle).not.toBe("");
    }
  });

  it("laisse la DATE telle quelle, et le drapeau en BOOLÉEN", () => {
    const json = corpsJsonDuMouvement(
      corpsDuMouvement(
        saisie({
          vrac: 5,
          peremption: "2026-12-31",
          emplacement: "loc-1",
          prixDetail: 2000,
          reporterLesPrix: true,
        })
      )
    );
    expect(json.expiry_date).toBe("2026-12-31");
    expect(json.location).toBe("loc-1");
    expect(json.update_product_prices).toBe(true);
    expect(json.selling_price).toBe("2000");
  });

  it("une saisie minimale ne porte que le strict nécessaire", () => {
    const json = corpsJsonDuMouvement(corpsDuMouvement(saisie({ vrac: 5 })));
    expect(new Set(Object.keys(json))).toEqual(
      new Set(["product", "warehouse", "movement_type", "quantity", "notes"])
    );
  });
});
