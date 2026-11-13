import { doitPousser, type EtatPourPoussee } from "./decision-poussee";

const PRET: EtatPourPoussee = {
  schemaAJour: true,
  jetonsLisibles: true,
  session: { userId: "u1", organizationId: "o1", deviceId: "d1" },
  estampille: { userId: "u1", organizationId: "o1" },
  pretes: 3,
};

describe("doitPousser", () => {
  it("pousse quand tout est réuni, pour l'organisation de la session", () => {
    expect(doitPousser(PRET)).toEqual({ pousser: true, organizationId: "o1", deviceId: "d1" });
  });

  it.each<[string, Partial<EtatPourPoussee>, string]>([
    ["un schéma en retard", { schemaAJour: false }, "schema"],
    ["des jetons illisibles", { jetonsLisibles: false }, "jetons"],
    ["personne de connecté", { session: null }, "session"],
    ["une base sans estampille", { estampille: null }, "estampille"],
    ["la base d'un autre compte", { estampille: { userId: "u2", organizationId: "o1" } }, "estampille"],
    ["la base d'un autre établissement", { estampille: { userId: "u1", organizationId: "o2" } }, "estampille"],
    ["un journal vide", { pretes: 0 }, "rien"],
  ])("s'abstient pour %s", (_cas, ecart, motif) => {
    expect(doitPousser({ ...PRET, ...ecart })).toEqual({ pousser: false, motif });
  });

  it("le schéma passe AVANT tout le reste : rien ne se lit sur une base en retard", () => {
    expect(doitPousser({ ...PRET, schemaAJour: false, session: null, pretes: 0 })).toEqual({
      pousser: false,
      motif: "schema",
    });
  });
});
