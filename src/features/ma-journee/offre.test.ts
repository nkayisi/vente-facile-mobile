import { CHOIX_TOUS } from "@vente-facile/core";

import type { EntrepotNomme, MembreDuTerminal } from "../perimetre/entrepots";
import type { MembrePerimetre } from "../perimetre/filtre-perimetre";

import { offreDeLaJournee, type EntreeJournee } from "./offre";

const A = "wh-a";
const B = "wh-b";

const depots: EntrepotNomme[] = [
  { id: A, nom: "Dépôt A", parDefaut: true, actif: true },
  { id: B, nom: "Dépôt B", parDefaut: false, actif: true },
];

const EQUIPE: MembrePerimetre[] = [
  { userId: "u-own", nom: "Patron", role: "owner", entrepots: [] },
  { userId: "u-ger", nom: "Gérante", role: "manager", entrepots: [A] },
  { userId: "u-cai", nom: "Caissier A", role: "cashier", entrepots: [A] },
  { userId: "u-cbi", nom: "Caissier B", role: "cashier", entrepots: [B] },
];

function m(
  role: MembreDuTerminal["role"],
  affectes: string[] = [],
  o: { consulteTout?: boolean } = {}
): MembreDuTerminal {
  return {
    role,
    consulteTout: o.consulteTout ?? false,
    voitCollegues: role === "manager" || role === "stock_keeper",
    affectes: affectes.map((id) => ({
      id,
      name: depots.find((d) => d.id === id)?.nom ?? id,
      is_active: true,
    })),
  };
}

function offre(patch: Partial<EntreeJournee> = {}) {
  return offreDeLaJournee({
    membre: m("manager", [A]),
    moi: "u-ger",
    tousLesEntrepots: depots,
    equipe: EQUIPE,
    choix: { entrepot: null, utilisateur: null },
    ...patch,
  });
}

describe("Ma journée : le défaut est MOI, pour tous les rôles", () => {
  it.each([
    ["owner", "u-own", []],
    ["manager", "u-ger", [A]],
    ["cashier", "u-cai", [A]],
  ] as const)("%s", (role, moi, affectes) => {
    const o = offre({ membre: m(role, [...affectes]), moi });
    expect(o.portee).toEqual({ kind: "moi" });
    expect(o.applique).toEqual({ entrepot: null, utilisateur: moi });
    expect(o.libelle).toBe("Mes opérations");
    expect(o.parametres).toEqual({});
  });
});

describe("le caissier n'a aucun filtre", () => {
  it("même avec la case « Consulter tous », et quoi que porte l'état de l'écran", () => {
    const o = offre({
      membre: m("cashier", [A], { consulteTout: true }),
      moi: "u-cai",
      choix: { entrepot: A, utilisateur: CHOIX_TOUS },
    });
    expect(o.champEntrepot).toBe(false);
    expect(o.champUtilisateur).toBe(false);
    expect(o.applique).toEqual({ entrepot: null, utilisateur: "u-cai" });
  });
});

describe("le gérant élargit en choisissant", () => {
  it("son entrepôt : toute la journée de l'entrepôt", () => {
    const o = offre({ choix: { entrepot: A, utilisateur: null } });
    expect(o.portee).toEqual({ kind: "equipe", entrepot: A });
    expect(o.applique.utilisateur).toBeNull();
    expect(o.applique.entrepot).toBe(A);
    expect(o.libelleDefautUtilisateur).toBe("Toute l'équipe");
    expect(o.libelle).toBe("Dépôt A · toute l'équipe");
    expect(o.parametres).toEqual({ warehouse: A });
  });

  it("une personne : sa journée", () => {
    const o = offre({ choix: { entrepot: null, utilisateur: "u-cai" } });
    expect(o.applique).toMatchObject({ entrepot: null, utilisateur: "u-cai" });
    expect(o.libelle).toBe("Caissier A");
    expect(o.parametres).toEqual({ user: "u-cai" });
  });

  it("propose « Toute l'équipe » sans entrepôt, et pas lui-même", () => {
    const o = offre();
    const valeurs = o.utilisateurs.map((u) => u.valeur);
    expect(valeurs[0]).toBe(CHOIX_TOUS);
    expect(valeurs).not.toContain("u-ger");
    expect(valeurs).not.toContain("u-cbi");
  });

  it("se propose lui-même une fois un entrepôt choisi", () => {
    const o = offre({ choix: { entrepot: A, utilisateur: null } });
    const valeurs = o.utilisateurs.map((u) => u.valeur);
    expect(valeurs).toContain("u-ger");
    expect(valeurs).not.toContain(CHOIX_TOUS);
  });

  it("écarte un entrepôt hors périmètre et « Tous les entrepôts »", () => {
    expect(offre({ choix: { entrepot: B, utilisateur: null } }).portee).toEqual({ kind: "moi" });
    expect(offre({ choix: { entrepot: CHOIX_TOUS, utilisateur: null } }).portee).toEqual({ kind: "moi" });
  });

  it("garde le champ Entrepôt même avec un seul entrepôt", () => {
    expect(offre().champEntrepot).toBe(true);
  });
});

describe("le propriétaire", () => {
  const owner = { membre: m("owner"), moi: "u-own" };

  it("n'a pas le choix « Tous les entrepôts » : son champ vide le dit déjà", () => {
    // Vu sur l'émulateur : deux entrées « Tous les entrepôts » dans la liste.
    const valeurs = offre(owner).entrepots.map((e) => e.valeur);
    expect(valeurs).not.toContain(CHOIX_TOUS);
    expect(offre(owner).libelleDefautEntrepot).toBe("Tous les entrepôts");
  });

  it("« Toute l'équipe » : tout l'établissement", () => {
    const o = offre({ ...owner, choix: { entrepot: null, utilisateur: CHOIX_TOUS } });
    expect(o.libelle).toBe("Tout l'établissement");
    expect(o.applique).toMatchObject({ entrepot: null, utilisateur: null, tousUtilisateurs: true });
    expect(o.parametres).toEqual({ all_users: "1" });
  });
});

describe("la case « Consulter tous » d'un gérant", () => {
  it("borne l'équipe à SES entrepôts tant qu'aucun n'est choisi", () => {
    const o = offre({
      membre: m("manager", [A], { consulteTout: true }),
      choix: { entrepot: null, utilisateur: CHOIX_TOUS },
    });
    expect(o.applique.entrepots).toEqual([A]);
  });
});

describe("la file", () => {
  it("admet un entrepôt inconnu sauf sous un entrepôt précis", () => {
    expect(offre().file.entrepotInconnuAdmis).toBe(true);
    expect(offre({ choix: { entrepot: A, utilisateur: null } }).file.entrepotInconnuAdmis).toBe(false);
  });
});
