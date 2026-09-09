import {
  avertissementDeFile,
  avertissementDeMouvementsEnFile,
  compterEnFile,
} from "./en-file";

const lot = (nombre: number, envoi?: "en_attente" | "bloque") => ({
  nombre,
  envoi,
});

describe("les ventes encore en file", () => {
  it("ne compte PAS une vente tirée, qui n'a pas d'état d'envoi", () => {
    // Le défaut relevé à l'écran : cinq ventes acquises annonçaient
    // « 5 ventes attendent leur envoi ».
    expect(compterEnFile([{}, {}, {}]).nombre).toBe(0);
    expect(compterEnFile([{ envoi: undefined }, { envoi: null }]).nombre).toBe(0);
  });

  it("ne compte pas une opération déjà acceptée", () => {
    expect(compterEnFile([{ envoi: "envoye" }, { envoi: "envoye" }]).nombre).toBe(0);
  });

  it("compte celles qui attendent le réseau ET celles qui sont bloquées", () => {
    // Une opération bloquée est CONSERVÉE et repartira : elle manque au
    // document tout autant, et son blocage dure plus longtemps encore.
    expect(
      compterEnFile([
        { envoi: "en_attente" },
        { envoi: "bloque" },
        { envoi: "envoye" },
      ]).nombre
    ).toBe(2);
  });

  it("retient le PIRE état du lot", () => {
    // Dire « attend son envoi » d'un lot dont une pièce est bloquée ferait
    // attendre un réseau qui ne débloquera rien.
    expect(compterEnFile([{ envoi: "en_attente" }]).envoi).toBe("en_attente");
    expect(
      compterEnFile([{ envoi: "en_attente" }, { envoi: "bloque" }]).envoi
    ).toBe("bloque");
    // Un lot vide ne dit RIEN : « envoyé » affirmerait qu'un acte est arrivé
    // là où il n'y en a jamais eu.
    expect(compterEnFile([]).envoi).toBeUndefined();
  });

  it("se tait quand il n'y a rien à annoncer", () => {
    expect(avertissementDeFile(lot(0))).toBeNull();
  });

  it("accorde son message", () => {
    // Le possessif compte autant que le verbe : la version d'origine s'arretait
    // a « 1 vente attend », un prefixe que « leur envoi » passait sans broncher.
    const une = avertissementDeFile(lot(1, "en_attente"));
    const trois = avertissementDeFile(lot(3, "en_attente"));
    expect(une).toContain("1 vente attend son envoi");
    expect(une).toContain("ne figurera pas");
    expect(trois).toContain("3 ventes attendent leur envoi");
    expect(trois).toContain("ne figureront pas");
  });

  it("propose de synchroniser quand le lot attend le RÉSEAU", () => {
    expect(avertissementDeFile(lot(2, "en_attente"))).toContain("Synchronisez");
  });
});

describe("un lot BLOQUÉ ne s'annonce pas comme un lot en attente", () => {
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LE DÉFAUT QUE CES TESTS FERMENT.                                       │
  // │                                                                        │
  // │ La queue était toujours « Synchronisez pour l'obtenir complet ». Une   │
  // │ opération bloquée n'attend pas le réseau, elle attend une DÉCISION :   │
  // │ le marchand cherche du réseau, le trouve, synchronise, et rien ne      │
  // │ bouge - potentiellement des jours. C'est la règle que                  │
  // │ `features/sync/bandeau.ts` tient déjà sur les bandeaux.                │
  // └────────────────────────────────────────────────────────────────────────┘

  it("ne propose JAMAIS de synchroniser ni de réessayer", () => {
    const m = avertissementDeFile(lot(2, "bloque")) ?? "";
    expect(m).not.toMatch(/synchronisez/i);
    expect(m).not.toMatch(/réessay/i);
  });

  it("NOMME ce qui débloque", () => {
    const m = avertissementDeFile(lot(2, "bloque")) ?? "";
    expect(m).toMatch(/abonnement/i);
    expect(m).toMatch(/permission/i);
  });

  it("prend la phrase du blocage dès qu'UNE pièce est bloquée", () => {
    // Le pire l'emporte : sur un lot mixte, synchroniser seul ne rendra
    // effectivement pas le document complet.
    const mixte = compterEnFile([{ envoi: "en_attente" }, { envoi: "bloque" }]);
    expect(avertissementDeFile(mixte)).not.toMatch(/synchronisez/i);
  });

  it("s'écrit sans GENRE ni NOMBRE, donc elle sert les deux pièces", () => {
    // `libelleEnvoi("bloque").detail` s'accorde avec une « opération »
    // féminine singulière : le reprendre mot pour mot ferait écrire
    // « 3 mouvements… Elle repartira ».
    const queue = (m: string | null) => (m ?? "").split("document.")[1];
    expect(queue(avertissementDeFile(lot(1, "bloque")))).toBe(
      queue(avertissementDeMouvementsEnFile(lot(4, "bloque")))
    );
  });
});

describe("les mouvements de stock encore en file", () => {
  it("se tait quand il n'y a rien à annoncer", () => {
    expect(avertissementDeMouvementsEnFile(lot(0))).toBeNull();
  });

  it("accorde son message, et nomme la bonne pièce", () => {
    // La phrase est fabriquée par le même corps que celle des ventes : c'est
    // ce qui empêche de n'accorder que deux des trois mots.
    const un = avertissementDeMouvementsEnFile(lot(1, "en_attente"));
    const quatre = avertissementDeMouvementsEnFile(lot(4, "en_attente"));
    expect(un).toContain("1 mouvement attend son envoi");
    expect(un).toContain("ne figurera pas");
    expect(quatre).toContain("4 mouvements attendent leur envoi");
    expect(quatre).toContain("ne figureront pas");
    // Et jamais le mot de l'autre écran.
    expect(quatre).not.toContain("vente");
  });
});
