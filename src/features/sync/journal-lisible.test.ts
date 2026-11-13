import { bandeauxDuJournal, pastilleOperations } from "./journal-lisible";

const VIDE = { pending: 0, quarantined: 0, blocked: 0 };

describe("bandeauxDuJournal", () => {
  it("rien à dire sur un journal vide", () => {
    expect(bandeauxDuJournal(VIDE)).toEqual([]);
  });

  it("accorde le titre ET la phrase au singulier", () => {
    const [b] = bandeauxDuJournal({ ...VIDE, quarantined: 1 });
    expect(b.titre).toBe("1 opération refusée");
    expect(b.message).toBe("Elle ne repartira pas d'elle-même.");
    expect(b.corriger).toBe(true);
  });

  it("accorde au pluriel", () => {
    const [b] = bandeauxDuJournal({ ...VIDE, quarantined: 3 });
    expect(b.titre).toBe("3 opérations refusées");
    expect(b.message).toBe("Elles ne repartiront pas d'elles-mêmes.");
  });

  it("une opération bloquée attend une décision, jamais le réseau", () => {
    for (const n of [1, 4]) {
      const [b] = bandeauxDuJournal({ ...VIDE, blocked: n });
      expect(b.ton).toBe("warning");
      expect(b.message).not.toMatch(/synchronis|réessay|réseau/i);
    }
    expect(bandeauxDuJournal({ ...VIDE, blocked: 1 })[0].message).toMatch(/^Elle repartira seule /);
    expect(bandeauxDuJournal({ ...VIDE, blocked: 2 })[0].message).toMatch(/^Elles repartiront seules /);
  });

  it("du plus grave au moins grave", () => {
    const cles = bandeauxDuJournal({ pending: 2, quarantined: 1, blocked: 1 }).map((b) => b.cle);
    expect(cles).toEqual(["refusees", "bloquees", "en_attente"]);
  });

  it("aucun libellé ne garde le raccourci entre parenthèses", () => {
    for (const n of [0, 1, 2]) {
      for (const b of bandeauxDuJournal({ pending: n, quarantined: n, blocked: n })) {
        expect(`${b.titre} ${b.message}`).not.toMatch(/\((s|es|e)\)/);
      }
    }
  });
});

describe("pastilleOperations", () => {
  it("aucune pastille quand rien n'est à corriger", () => {
    // Les opérations simplement EN ATTENTE ne sont pas à corriger : elles partent seules.
    expect(pastilleOperations({ ...VIDE, pending: 12 })).toBeNull();
  });

  it("compte les refusées ET les bloquées, et le rouge prime", () => {
    expect(pastilleOperations({ pending: 0, quarantined: 2, blocked: 1 })).toEqual({
      texte: "3",
      ton: "destructive",
      etiquette: "Opérations à corriger : 2 refusées et 1 en attente d'un droit",
    });
  });

  it("des bloquées seules sont en ambre", () => {
    const p = pastilleOperations({ ...VIDE, blocked: 1 });
    expect(p?.ton).toBe("warning");
    expect(p?.etiquette).toBe("Opérations à corriger : 1 en attente d'un droit");
  });

  it("borne l'affichage à 99+", () => {
    expect(pastilleOperations({ ...VIDE, quarantined: 150 })?.texte).toBe("99+");
  });
});
