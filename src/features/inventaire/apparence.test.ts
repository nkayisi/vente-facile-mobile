/**
 * Les portes d'une session d'inventaire, et ce qu'elles disent quand elles
 * sont fermées.
 */
import { ACTIONS, motifSoumissionFermee, motifTransitionEnFile } from "./apparence";

describe("motifSoumissionFermee", () => {
  it("ferme la soumission tant qu'une ligne n'est pas comptée, et NOMME le reste", () => {
    const m = motifSoumissionFermee({ lignes: 12, comptees: 11, bloquees: 0 });
    expect(m).not.toBe("");
    expect(m).toMatch(/une ligne/i);

    const trois = motifSoumissionFermee({ lignes: 12, comptees: 9, bloquees: 0 });
    expect(trois).toMatch(/\b3 lignes/);
  });

  it("l'ouvre quand tout est compté", () => {
    expect(motifSoumissionFermee({ lignes: 12, comptees: 12, bloquees: 0 })).toBe("");
  });

  it("ne soumet pas une feuille VIDE", () => {
    // `0 - 0 > 0` est faux : sans ce cas, le bouton s'ouvrirait sur une
    // feuille qui n'a aucune ligne à soumettre.
    expect(motifSoumissionFermee({ lignes: 0, comptees: 0, bloquees: 0 })).not.toBe("");
  });

  it("un comptage BLOQUÉ n'ouvre pas la soumission, même feuille complète", () => {
    // Il s'affiche compté - c'est du travail fait dans le rayon - mais il
    // n'arrivera pas au serveur, qui refuserait la soumission.
    const m = motifSoumissionFermee({ lignes: 3, comptees: 3, bloquees: 1 });
    expect(m).not.toBe("");
    expect(m).not.toMatch(/synchronis/i);
    expect(m).not.toMatch(/réessay/i);
  });
});

describe("motifTransitionEnFile", () => {
  it("ne dit rien quand rien n'attend", () => {
    expect(motifTransitionEnFile("submit", "envoye")).toBe("");
  });

  it("annonce la synchronisation pour une file, et JAMAIS pour un blocage", () => {
    expect(motifTransitionEnFile("submit", "en_attente")).toMatch(/synchronisation/i);

    const bloque = motifTransitionEnFile("submit", "bloque");
    expect(bloque).not.toMatch(/synchronis/i);
    expect(bloque).not.toMatch(/réessay/i);
    expect(bloque).toMatch(/abonnement|permission/i);
  });

  it("nomme l'acte qui attend, création comprise", () => {
    expect(motifTransitionEnFile("create", "en_attente")).toMatch(/création/i);
    expect(motifTransitionEnFile("start", "en_attente")).toMatch(/démarrage/i);
    expect(motifTransitionEnFile("validate", "en_attente")).toMatch(/validation/i);
    expect(motifTransitionEnFile("cancel", "en_attente")).toMatch(/annulation/i);
  });
});

describe("ACTIONS", () => {
  it("couvre les quatre transitions, et elles seules", () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(["cancel", "start", "submit", "validate"]);
  });

  it("chaque acte porte une permission du domaine inventaire", () => {
    // UN CODE DE PERMISSION FAUX NE LÈVE RIEN : le bouton disparaît, et le
    // magasinier conclut que la fonction n'existe pas.
    for (const a of Object.values(ACTIONS)) {
      expect(a.permission).toMatch(/^inventory\./);
    }
  });

  it("seule l'annulation est destructrice", () => {
    expect(ACTIONS.cancel.destructif).toBe(true);
    for (const cle of ["start", "submit", "validate"] as const) {
      expect(ACTIONS[cle].destructif).toBeUndefined();
    }
  });

  it("le libellé court tient sur une demi-largeur", () => {
    // Mesuré : « Annuler la session » déborde de cent quatre-vingts points.
    for (const a of Object.values(ACTIONS)) {
      expect(a.labelCourt.length).toBeLessThanOrEqual(12);
    }
  });
});
