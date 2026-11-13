import {
  consequenceCreditsEnFile,
  envoiDesCredits,
  resumerCreditsEnFile,
  titreCreditsEnFile,
  type CreditEnFile,
} from "./en-file";

const credit = (o: Partial<CreditEnFile>): CreditEnFile => ({
  reference: "VT-1",
  client: "Mama Lucie",
  resteAPayer: 100,
  devise: "USD",
  envoi: "en_attente",
  ...o,
});

describe("resumerCreditsEnFile", () => {
  it("rien en file : rien à dire", () => {
    expect(resumerCreditsEnFile([])).toEqual({ nombre: 0, parDevise: [], bloquees: 0, sansMontant: 0 });
  });

  it("par devise, jamais sommé entre devises", () => {
    const r = resumerCreditsEnFile([
      credit({ resteAPayer: 30, devise: "USD" }),
      credit({ resteAPayer: 50_000, devise: "CDF" }),
      credit({ resteAPayer: 20, devise: "USD" }),
    ]);
    expect(r.nombre).toBe(3);
    expect(r.parDevise).toEqual([
      { devise: "CDF", montant: 50_000 },
      { devise: "USD", montant: 50 },
    ]);
  });

  it("un montant inconnu est COMPTÉ sans être additionné", () => {
    const r = resumerCreditsEnFile([credit({ resteAPayer: null, devise: null }), credit({})]);
    expect(r.nombre).toBe(2);
    expect(r.sansMontant).toBe(1);
    expect(r.parDevise).toEqual([{ devise: "USD", montant: 100 }]);
  });

  it("un crédit soldé par son acompte n'est plus une créance", () => {
    expect(resumerCreditsEnFile([credit({ resteAPayer: 0 })]).nombre).toBe(0);
  });

  it("distingue celles qui attendent une décision", () => {
    expect(resumerCreditsEnFile([credit({ envoi: "bloque" }), credit({})]).bloquees).toBe(1);
  });
});

describe("le bandeau des crédits en file", () => {
  const f = (m: number, d: string) => `${m} ${d}`;

  it("rien à annoncer quand rien n'attend", () => {
    expect(envoiDesCredits(resumerCreditsEnFile([]))).toBeUndefined();
  });

  it("le pire l'emporte : une seule bloquée, et la synchronisation n'est plus offerte", () => {
    expect(envoiDesCredits(resumerCreditsEnFile([credit({}), credit({ envoi: "bloque" })]))).toBe("bloque");
    expect(envoiDesCredits(resumerCreditsEnFile([credit({})]))).toBe("en_attente");
  });

  it("accorde au singulier", () => {
    const r = resumerCreditsEnFile([credit({ resteAPayer: 30 })]);
    expect(titreCreditsEnFile(r)).toBe("1 vente à crédit attend son envoi");
    expect(consequenceCreditsEnFile(r, f)).toBe(
      "Elle n'est pas encore dans la balance ci-dessous : 30 USD. Elle y entrera une fois envoyée."
    );
  });

  it("accorde au pluriel, par devise, et dit le montant inconnu", () => {
    const r = resumerCreditsEnFile([
      credit({ resteAPayer: 30 }),
      credit({ resteAPayer: 5000, devise: "CDF" }),
      credit({ resteAPayer: null, devise: null }),
    ]);
    expect(titreCreditsEnFile(r)).toBe("3 ventes à crédit attendent leur envoi");
    expect(consequenceCreditsEnFile(r, f)).toBe(
      "Elles ne sont pas encore dans la balance ci-dessous : 5000 CDF · 30 USD (+1 sans montant). Elles y entreront une fois envoyées."
    );
  });
});
