import {
  depenseSeraitInvisible,
  entrepotDeLaDepense,
  entrepotsAccessibles,
  saisieSansIssue,
  type EntrepotNomme,
} from "./perimetre";

const A: EntrepotNomme = { id: "a", nom: "Boutique A", parDefaut: true, actif: true };
const B: EntrepotNomme = { id: "b", nom: "Boutique B", parDefaut: false, actif: true };
const FERME: EntrepotNomme = { id: "z", nom: "Fermé", parDefaut: false, actif: false };
const TOUS = [A, B, FERME];

describe("entrepôts accessibles", () => {
  it("le propriétaire les voit tous, sauf les inactifs", () => {
    expect(entrepotsAccessibles("owner", [], TOUS).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("un rôle borné ne voit QUE ses affectations", () => {
    expect(entrepotsAccessibles("manager", [{ id: "b" }], TOUS).map((e) => e.id))
      .toEqual(["b"]);
  });

  it("un rôle borné sans affectation n'en voit aucun", () => {
    expect(entrepotsAccessibles("manager", [], TOUS)).toEqual([]);
  });
});

describe("l'entrepôt proposé d'emblée", () => {
  it("ne propose JAMAIS un entrepôt non assigné", () => {
    // Le défaut qu'on ferme : « Boutique A » porte `is_default`, mais un
    // gérant affecté à B qui l'enverrait verrait sa dépense refusée par
    // `assert_warehouse_allowed_for_request` - donc en quarantaine, à chaque
    // dépense.
    expect(entrepotDeLaDepense("manager", [{ id: "b" }], TOUS)).toBe("b");
  });

  it("prend le principal quand il est accessible", () => {
    expect(entrepotDeLaDepense("owner", [], TOUS)).toBe("a");
  });

  it("ne devine RIEN entre plusieurs accessibles sans principal", () => {
    const sansPrincipal = [{ ...A, parDefaut: false }, B];
    expect(entrepotDeLaDepense("owner", [], sansPrincipal)).toBeNull();
  });

  it("propose l'unique accessible même s'il n'est pas principal", () => {
    expect(entrepotDeLaDepense("cashier", [{ id: "b" }], TOUS)).toBe("b");
  });
});

describe("la dépense qu'on ne reverra pas", () => {
  it("avertit un rôle borné qui n'attache aucun entrepôt", () => {
    expect(depenseSeraitInvisible("manager", null)).toBe(true);
    expect(depenseSeraitInvisible("stock_keeper", null)).toBe(true);
  });

  it("n'avertit pas le propriétaire : `null` lui est licite", () => {
    // C'est même le SEUL moyen d'enregistrer un loyer ou un salaire, que le
    // serveur lui réserve par construction.
    expect(depenseSeraitInvisible("owner", null)).toBe(false);
  });

  it("n'avertit pas le caissier : il est borné par `created_by`, pas par l'entrepôt", () => {
    expect(depenseSeraitInvisible("cashier", null)).toBe(false);
  });

  it("n'avertit personne dès qu'un entrepôt est attaché", () => {
    expect(depenseSeraitInvisible("manager", "b")).toBe(false);
  });
});

describe("la saisie sans issue", () => {
  it("un gérant sans affectation est averti, pas silencieusement autorisé", () => {
    expect(saisieSansIssue("manager", [], TOUS)).toBe(true);
  });

  it("un propriétaire n'est jamais sans issue", () => {
    expect(saisieSansIssue("owner", [], TOUS)).toBe(false);
  });

  it("un caissier non plus : sa dépense lui reste visible", () => {
    expect(saisieSansIssue("cashier", [], TOUS)).toBe(false);
  });
});
