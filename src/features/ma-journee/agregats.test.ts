import { buildDayReport } from "@vente-facile/core/receipt";

import {
  agregerLaJournee,
  monnaieDeLaVente,
  seauxHoraires,
  ticketDeLaJournee,
  type EntreesJournee,
  type VenteDeLaJournee,
} from "./agregats";

const AUJOURDHUI = (h: number, min = 0) => new Date(2026, 10, 24, h, min);

function vente(p: Partial<VenteDeLaJournee> = {}): VenteDeLaJournee {
  return {
    id: "v",
    reference: "VT-1",
    date: AUJOURDHUI(9),
    statut: "completed",
    devise: "USD",
    total: 100,
    resteDu: 0,
    taux: 1,
    client: null,
    vendeur: null,
    ...p,
  };
}

function entrees(p: Partial<EntreesJournee> = {}): EntreesJournee {
  return {
    ventes: [],
    encaissements: [],
    depenses: [],
    caisse: [],
    stock: null,
    maintenant: AUJOURDHUI(14, 30),
    ...p,
  };
}

describe("les ventes de la journée", () => {
  it("comptent le crédit, et le reste dû se lit à part", () => {
    const j = agregerLaJournee(
      entrees({
        ventes: [
          vente({ id: "1", total: 500 }),
          vente({ id: "2", total: 200, resteDu: 150, statut: "pending" }),
        ],
      })
    );
    expect(j.ventes).toMatchObject({ nombre: 2, total: 700, aCredit: 150, nombreACredit: 1 });
  });

  it("convertissent au taux FIGÉ de chaque vente", () => {
    const j = agregerLaJournee(
      entrees({ ventes: [vente({ devise: "CDF", total: 230000, taux: 1 / 2300 })] })
    );
    expect(j.ventes.total).toBe(100);
  });

  it("comptent sans additionner une vente au ticket introuvable", () => {
    const j = agregerLaJournee(entrees({ ventes: [vente({ total: null }), vente({ id: "2" })] }));
    expect(j.ventes).toMatchObject({ nombre: 2, total: 100, sansMontant: 1 });
  });

  it("se listent de la plus récente à la plus ancienne", () => {
    const j = agregerLaJournee(
      entrees({
        ventes: [
          vente({ id: "a", reference: "VT-A", date: AUJOURDHUI(8) }),
          vente({ id: "b", reference: "VT-B", date: AUJOURDHUI(11) }),
        ],
      })
    );
    expect(j.ventes.lignes.map((v) => v.reference)).toEqual(["VT-B", "VT-A"]);
  });
});

describe("l'encaissé", () => {
  it("retire la monnaie rendue pour donner le net", () => {
    const j = agregerLaJournee(
      entrees({
        encaissements: [{ moyen: "Espèces", principal: 120 }],
        caisse: [
          { direction: "in", type: "sale", principal: 120 },
          { direction: "out", type: "change", principal: 20 },
        ],
      })
    );
    expect(j.encaisse).toMatchObject({ total: 120, monnaie: 20, net: 100 });
    expect(j.caisse).toEqual({ entrees: 120, sorties: 20, net: 100 });
  });

  it("se ventile par moyen, le plus gros d'abord", () => {
    const j = agregerLaJournee(
      entrees({
        encaissements: [
          { moyen: "Espèces", principal: 30 },
          { moyen: "Mobile money", principal: 70 },
          { moyen: "Espèces", principal: 20 },
        ],
      })
    );
    expect(j.encaisse.parMoyen).toEqual([
      { moyen: "Mobile money", nombre: 1, total: 70 },
      { moyen: "Espèces", nombre: 2, total: 50 },
    ]);
  });

  it("la monnaie d'une vente en file est ce que les règlements dépassent", () => {
    expect(monnaieDeLaVente(100, 120)).toBe(20);
    expect(monnaieDeLaVente(100, 60)).toBe(0);
    expect(monnaieDeLaVente(null, 60)).toBe(0);
  });
});

describe("les heures", () => {
  it("gardent les heures vides jusqu'à l'heure courante, et pas au-delà", () => {
    const h = seauxHoraires([vente({ date: AUJOURDHUI(9) }), vente({ date: AUJOURDHUI(11) })], AUJOURDHUI(13, 5));
    expect(h.map((s) => s.heure)).toEqual([9, 10, 11, 12, 13]);
    expect(h.find((s) => s.heure === 10)).toEqual({ heure: 10, nombre: 0, total: 0 });
  });

  it("ne rendent rien sans vente", () => {
    expect(seauxHoraires([], AUJOURDHUI(10))).toEqual([]);
  });
});

describe("les dépenses", () => {
  it("disent ce qui est déjà payé", () => {
    const j = agregerLaJournee(
      entrees({ depenses: [{ statut: "paid", principal: 12 }, { statut: "draft", principal: 8 }] })
    );
    expect(j.depenses).toEqual({ nombre: 2, total: 20, payees: 12 });
  });
});

describe("le ticket", () => {
  const chrome = { org: { name: "NekaShop" } } as never;
  const contexte = {
    chrome,
    jour: "Mardi 24 novembre 2026",
    arreteA: "14:30",
    portee: "Mes opérations",
    devise: "USD",
    listeVentes: true,
  };

  it("garde la devise de chaque vente et marque le crédit, de la plus ancienne à la plus récente", () => {
    const j = agregerLaJournee(
      entrees({
        ventes: [
          vente({ id: "a", reference: "VT-A", date: AUJOURDHUI(8) }),
          vente({ id: "b", reference: "VT-B", date: AUJOURDHUI(11), devise: "CDF", total: 46000, resteDu: 10000, taux: 1 / 2300 }),
        ],
      })
    );
    const t = ticketDeLaJournee(j, contexte);
    expect(t.lines?.map((l) => [l.reference, l.currency, l.note])).toEqual([
      ["VT-A", "USD", undefined],
      ["VT-B", "CDF", "crédit"],
    ]);
  });

  it("n'a pas de section des ventes pour qui ne les lit pas", () => {
    expect(ticketDeLaJournee(agregerLaJournee(entrees()), { ...contexte, listeVentes: false }).lines).toBeNull();
  });

  it("se rend en blocs, sans numéro", () => {
    const blocs = JSON.stringify(buildDayReport(ticketDeLaJournee(agregerLaJournee(entrees()), contexte)));
    expect(blocs).toContain("RAPPORT DE LA JOURN");
    expect(blocs).not.toContain("N°");
  });
});
