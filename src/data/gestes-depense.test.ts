/**
 * Les MÊMES cas que `frontend/lib/cashbook/gestes-depense.test.ts` : une règle
 * qui change d'un seul côté fait tomber l'un des deux jeux.
 */
import {
  acteDuGeste,
  decisionsPossibles,
  gestesPossibles,
  motifPaiementImpossible,
  type DroitsDepense,
} from "./gestes-depense";

const CAISSIER: DroitsDepense = {
  peutCreer: true, peutApprouver: false, peutPayer: true, proprietaire: false, moi: "caissier",
};
const GERANT: DroitsDepense = {
  peutCreer: true, peutApprouver: true, peutPayer: true, proprietaire: false, moi: "gerant",
};
const PROPRIETAIRE: DroitsDepense = {
  peutCreer: true, peutApprouver: true, peutPayer: true, proprietaire: true, moi: "proprio",
};

const depense = (status: string, auteur: string) => ({ status, created_by: auteur });

describe("gestes d'une dépense", () => {
  it("le caissier soumet son brouillon, sans pouvoir le payer directement", () => {
    expect(gestesPossibles(depense("draft", "caissier"), CAISSIER)).toEqual(["submit"]);
  });

  it("le caissier paie SA dépense approuvée", () => {
    expect(gestesPossibles(depense("approved", "caissier"), CAISSIER)).toEqual(["pay"]);
  });

  it("le caissier ne paie pas celle d'un collègue", () => {
    expect(gestesPossibles(depense("approved", "autre"), CAISSIER)).toEqual([]);
  });

  it("le caissier n'approuve rien", () => {
    expect(gestesPossibles(depense("pending", "autre"), CAISSIER)).toEqual([]);
  });

  it("le gérant n'approuve, ne rejette ni ne paie directement SA dépense", () => {
    expect(gestesPossibles(depense("pending", "gerant"), GERANT)).toEqual(["cancel"]);
  });

  it("le gérant approuve celle d'un caissier", () => {
    expect(gestesPossibles(depense("pending", "caissier"), GERANT)).toEqual([
      "approve", "reject", "pay_direct", "cancel",
    ]);
  });

  it("le gérant paie sa propre dépense une fois approuvée", () => {
    expect(gestesPossibles(depense("approved", "gerant"), GERANT)).toEqual(["pay", "cancel"]);
  });

  it("le propriétaire approuve aussi la sienne", () => {
    expect(gestesPossibles(depense("pending", "proprio"), PROPRIETAIRE)).toContain("approve");
  });

  it("une dépense rejetée ne se paie jamais", () => {
    expect(gestesPossibles(depense("rejected", "caissier"), PROPRIETAIRE)).toEqual([]);
  });

  it("sans identifiant connu, rien n'est payé à la place d'un autre", () => {
    expect(gestesPossibles(depense("approved", "caissier"), { ...CAISSIER, moi: null })).toEqual([]);
  });
});

describe("l'acte mis en file", () => {
  it("« payer directement » est un `expense.pay`", () => {
    expect(acteDuGeste("pay_direct")).toBe("expense.pay");
    expect(acteDuGeste("pay")).toBe("expense.pay");
    expect(acteDuGeste("approve")).toBe("expense.approve");
  });
});

describe("payer en espèces exige une caisse ouverte", () => {
  it("espèces sans caisse : refusé AVANT l'envoi, avec la marche à suivre", () => {
    expect(motifPaiementImpossible({ methodType: "cash" }, false)).toMatch(/Ouvrez votre caisse/);
  });

  it("aucun moyen choisi vaut des espèces", () => {
    expect(motifPaiementImpossible(null, false)).not.toBeNull();
  });

  it("un mobile money ne touche à aucune caisse", () => {
    expect(motifPaiementImpossible({ methodType: "mobile_money" }, false)).toBeNull();
  });

  it("espèces avec la caisse ouverte : rien ne retient", () => {
    expect(motifPaiementImpossible({ methodType: "cash" }, true)).toBeNull();
  });
});

describe("décisions sur une dépense encore en file", () => {
  it("n'en ouvre AUCUNE, quel que soit le statut ou le rôle", () => {
    for (const statut of ["draft", "pending", "approved", "paid"]) {
      expect(decisionsPossibles(depense(statut, "proprio"), PROPRIETAIRE, true)).toEqual([]);
    }
  });

  it("les rend toutes dès que le serveur connaît la pièce", () => {
    expect(decisionsPossibles(depense("pending", "caissier"), GERANT, false)).toEqual(
      gestesPossibles(depense("pending", "caissier"), GERANT)
    );
  });
});
