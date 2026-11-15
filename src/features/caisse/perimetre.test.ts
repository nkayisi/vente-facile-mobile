import {
  depenseSeraitInvisible,
  entrepotDeLaDepense,
  saisieSansIssue,
  type EntrepotNomme,
  type MembreDuTerminal,
} from "./perimetre";

const A: EntrepotNomme = { id: "a", nom: "Boutique A", parDefaut: true, actif: true };
const B: EntrepotNomme = { id: "b", nom: "Boutique B", parDefaut: false, actif: true };
const FERME: EntrepotNomme = { id: "z", nom: "Fermé", parDefaut: false, actif: false };
const TOUS = [A, B, FERME];

/** Le gérant et le magasinier ont `sales.view_all` par leur rôle. */
function m(
  role: MembreDuTerminal["role"],
  affectes: EntrepotNomme[] = [],
  o: { consulteTout?: boolean; voitCollegues?: boolean } = {}
): MembreDuTerminal {
  return {
    role,
    consulteTout: o.consulteTout ?? false,
    voitCollegues: o.voitCollegues ?? (role === "manager" || role === "stock_keeper"),
    affectes: affectes.map((e) => ({ id: e.id, name: e.nom, is_active: e.actif })),
  };
}

describe("l'entrepôt proposé d'emblée", () => {
  it("ne propose JAMAIS un entrepôt non assigné", () => {
    // Le défaut qu'on ferme : « Boutique A » porte `is_default`, mais un
    // gérant affecté à B qui l'enverrait verrait sa dépense refusée - donc en
    // quarantaine, à chaque dépense.
    expect(entrepotDeLaDepense(m("manager", [B]), TOUS)).toBe("b");
  });

  it("ne propose JAMAIS un entrepôt seulement LISIBLE", () => {
    // « Consulter tous » ouvre la lecture de A, pas l'action : la dépense
    // reviendrait `consultation_seule`.
    expect(entrepotDeLaDepense(m("manager", [B], { consulteTout: true }), TOUS)).toBe("b");
  });

  it("ne propose JAMAIS un entrepôt désactivé, même le principal", () => {
    const principalFerme = [{ ...A, actif: false }, B];
    expect(entrepotDeLaDepense(m("owner"), principalFerme)).toBe("b");
  });

  it("prend le principal quand il est actionnable", () => {
    expect(entrepotDeLaDepense(m("owner"), TOUS)).toBe("a");
  });

  it("ne devine RIEN entre plusieurs actionnables sans principal", () => {
    const sansPrincipal = [{ ...A, parDefaut: false }, B];
    expect(entrepotDeLaDepense(m("owner"), sansPrincipal)).toBeNull();
  });

  it("propose l'unique actionnable même s'il n'est pas principal", () => {
    expect(entrepotDeLaDepense(m("cashier", [B]), TOUS)).toBe("b");
  });
});

describe("la dépense qu'on ne reverra pas", () => {
  it("avertit un membre qui lit ses collègues et n'attache aucun entrepôt", () => {
    expect(depenseSeraitInvisible(m("manager", [A]), null)).toBe(true);
    expect(depenseSeraitInvisible(m("stock_keeper", [A]), null)).toBe(true);
    // La permission, pas le rôle : un caissier avec « Voir tout » n'est plus
    // borné par auteur, donc ne reverrait pas sa dépense sans entrepôt.
    expect(depenseSeraitInvisible(m("cashier", [A], { voitCollegues: true }), null)).toBe(true);
  });

  it("n'avertit pas le propriétaire : `null` lui est licite", () => {
    // C'est même le SEUL moyen d'enregistrer un loyer ou un salaire.
    expect(depenseSeraitInvisible(m("owner"), null)).toBe(false);
  });

  it("n'avertit pas qui consulte tout : il lit aussi ce qui n'a pas d'entrepôt", () => {
    expect(depenseSeraitInvisible(m("manager", [A], { consulteTout: true }), null)).toBe(false);
  });

  it("n'avertit pas le caissier borné par auteur : ses lignes sans entrepôt sont à lui", () => {
    expect(depenseSeraitInvisible(m("cashier", [A]), null)).toBe(false);
  });

  it("n'avertit personne dès qu'un entrepôt est attaché", () => {
    expect(depenseSeraitInvisible(m("manager", [B]), "b")).toBe(false);
  });
});

describe("la saisie sans issue", () => {
  it("un gérant sans affectation est averti, pas silencieusement autorisé", () => {
    expect(saisieSansIssue(m("manager"), TOUS)).toBe(true);
  });

  it("un gérant dont le SEUL entrepôt est désactivé est averti aussi", () => {
    // Le défaut rapporté : compté « affecté » au serveur, il ne pouvait plus
    // saisir et rien ne disait pourquoi.
    expect(saisieSansIssue(m("manager", [FERME]), TOUS)).toBe(true);
  });

  it("un propriétaire n'est jamais sans issue", () => {
    expect(saisieSansIssue(m("owner"), TOUS)).toBe(false);
  });

  it("un caissier borné par auteur non plus : sa dépense lui reste visible", () => {
    expect(saisieSansIssue(m("cashier"), TOUS)).toBe(false);
  });
});
