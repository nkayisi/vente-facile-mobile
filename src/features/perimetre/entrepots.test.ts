import {
  destinationsDuTransfert,
  entrepotsActionnablesDuMembre,
  entrepotsConnus,
  entrepotsLisiblesDuMembre,
  libelleEntrepot,
  membreDeLaSession,
  nomOuInconnu,
  type EntrepotLocal,
} from "./entrepots";

const LOCAUX: EntrepotLocal[] = [
  { id: "a", nom: "Boutique A", parDefaut: true, actif: true },
  { id: "b", nom: "boutique B", parDefaut: false, actif: true },
];
const ANNUAIRE = [
  { id: "a", name: "Boutique A", is_active: true },
  { id: "b", name: "boutique B", is_active: true },
  { id: "z", name: "Ancien dépôt", is_active: false },
  { id: "n", name: "Nord", is_active: true },
];

describe("le membre se lit dans la session", () => {
  it("la case et la permission « Voir tout » descendent jusqu'au noyau", () => {
    const m = membreDeLaSession({
      role: "cashier",
      permissions: ["sales.view_all"],
      assigned_warehouses: [{ id: "a", name: "Boutique A" }],
      consult_all_warehouses: true,
    });
    expect(m.consulteTout).toBe(true);
    expect(m.voitCollegues).toBe(true);
  });

  it("un instantané antérieur, sans la case, lit le périmètre le plus étroit", () => {
    const m = membreDeLaSession({
      role: "manager",
      permissions: [],
      assigned_warehouses: [{ id: "a", name: "Boutique A" }],
    });
    expect(m.consulteTout).toBe(false);
  });

  it("sans session, aucun rôle : rien n'est ouvert", () => {
    expect(membreDeLaSession(null).role).toBeNull();
  });
});

describe("tous les entrepôts que le terminal sait nommer", () => {
  it("l'annuaire nomme ceux que la base locale ne porte pas", () => {
    const tous = entrepotsConnus({ annuaire: ANNUAIRE, affectes: [], locaux: LOCAUX });
    expect(tous.map((e) => e.id)).toEqual(["a", "b", "n", "z"]);
  });

  it("le PRINCIPAL vient de la table locale, que l'annuaire ne dit pas", () => {
    const tous = entrepotsConnus({ annuaire: ANNUAIRE, affectes: [], locaux: LOCAUX });
    expect(tous.find((e) => e.id === "a")?.parDefaut).toBe(true);
  });

  it("sans annuaire (serveur antérieur), la table locale tient lieu de liste", () => {
    const tous = entrepotsConnus({ annuaire: undefined, affectes: [], locaux: LOCAUX });
    expect(tous.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("une affectation toute fraîche est nommée avant même le tirage", () => {
    // Le défaut : l'entrepôt affecté était dans les droits et absent des
    // filtres jusqu'au tirage suivant.
    const tous = entrepotsConnus({
      annuaire: undefined,
      affectes: [{ id: "n", name: "Nord", is_active: true }],
      locaux: LOCAUX,
    });
    expect(tous.map((e) => e.id)).toContain("n");
  });

  it("l'état de l'instantané l'emporte sur celui de la table locale", () => {
    const tous = entrepotsConnus({
      annuaire: undefined,
      affectes: [{ id: "b", name: "boutique B", is_active: false }],
      locaux: LOCAUX,
    });
    expect(tous.find((e) => e.id === "b")?.actif).toBe(false);
  });

  it("actifs d'abord, puis par nom, sans tenir compte de la casse", () => {
    const tous = entrepotsConnus({ annuaire: ANNUAIRE, affectes: [], locaux: [] });
    expect(tous.map((e) => e.nom)).toEqual(["Boutique A", "boutique B", "Nord", "Ancien dépôt"]);
  });
});

describe("lire et agir", () => {
  const tous = entrepotsConnus({ annuaire: ANNUAIRE, affectes: [], locaux: LOCAUX });
  const membre = (o: { role: "owner" | "manager"; affectes?: string[]; consulteTout?: boolean }) => ({
    role: o.role,
    consulteTout: o.consulteTout ?? false,
    voitCollegues: true,
    affectes: (o.affectes ?? []).map((id) => {
      const e = ANNUAIRE.find((x) => x.id === id)!;
      return { id, name: e.name, is_active: e.is_active };
    }),
  });

  it("le propriétaire LIT tout, désactivés compris", () => {
    expect(entrepotsLisiblesDuMembre(membre({ role: "owner" }), tous).map((e) => e.id))
      .toEqual(["a", "b", "n", "z"]);
  });

  it("le propriétaire n'AGIT que sur les actifs", () => {
    expect(entrepotsActionnablesDuMembre(membre({ role: "owner" }), tous).map((e) => e.id))
      .toEqual(["a", "b", "n"]);
  });

  it("« Consulter tous » ouvre la lecture, jamais l'action", () => {
    const m = membre({ role: "manager", affectes: ["b"], consulteTout: true });
    expect(entrepotsLisiblesDuMembre(m, tous)).toHaveLength(4);
    expect(entrepotsActionnablesDuMembre(m, tous).map((e) => e.id)).toEqual(["b"]);
  });

  it("un gérant au seul entrepôt désactivé le LIT mais n'y AGIT pas", () => {
    const m = membre({ role: "manager", affectes: ["z"] });
    expect(entrepotsLisiblesDuMembre(m, tous).map((e) => e.id)).toEqual(["z"]);
    expect(entrepotsActionnablesDuMembre(m, tous)).toEqual([]);
  });
});

describe("le transfert et ses noms", () => {
  const tous = entrepotsConnus({ annuaire: ANNUAIRE, affectes: [], locaux: LOCAUX });

  it("la destination est TOUT entrepôt actif, sauf la source", () => {
    // Y compris un dépôt qui ne m'est pas affecté : c'est le cas ordinaire
    // d'un réassort.
    expect(destinationsDuTransfert(tous, "a").map((e) => e.id)).toEqual(["b", "n"]);
  });

  it("un entrepôt désactivé dit qu'il l'est dans une liste de lecture", () => {
    expect(libelleEntrepot({ nom: "Ancien dépôt", actif: false })).toBe("Ancien dépôt (inactif)");
    expect(libelleEntrepot({ nom: "Nord", actif: true })).toBe("Nord");
  });

  it("un nom inconnu se dit, jamais « ? » ni un identifiant", () => {
    expect(nomOuInconnu(null)).not.toContain("?");
    expect(nomOuInconnu("  ")).toBe("Entrepôt hors de votre périmètre");
    expect(nomOuInconnu("Nord")).toBe("Nord");
  });
});
