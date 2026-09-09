/**
 * La lecture d'un nombre tapé au comptoir.
 *
 * Elle décide de ce qui part au serveur : une virgule non traduite était
 * refusée par `DecimalField` et l'opération partait en quarantaine, un espace
 * de milliers donnait `NaN` puis zéro, et un bouton ne réagissait pas.
 */
import { lireNombre } from "./nombres";

const valeur = (s: string): number | null => {
  const r = lireNombre(s);
  if (!r.ok) throw new Error(`refusé : ${r.motif}`);
  return r.valeur;
};

describe("lireNombre", () => {
  it("lit la VIRGULE du pavé décimal francophone", () => {
    expect(valeur("12,5")).toBe(12.5);
    expect(valeur("12.5")).toBe(12.5);
  });

  it("lit les séparateurs de milliers, quels qu'ils soient", () => {
    expect(valeur("12 500")).toBe(12500);
    expect(valeur("12 500")).toBe(12500);
    expect(valeur("12 500,50")).toBe(12500.5);
  });

  it("rend `null` sur une saisie VIDE, jamais zéro", () => {
    // Ce que « vide » veut dire appartient à l'appelant : hériter du tiroir
    // précédent pour un fonds de caisse, ne rien ajouter pour une ligne.
    expect(valeur("")).toBeNull();
    expect(valeur("   ")).toBeNull();
  });

  it("rend zéro quand il est ÉCRIT", () => {
    expect(valeur("0")).toBe(0);
    expect(valeur("0,00")).toBe(0);
  });

  it("nomme le motif du refus, sans le formuler", () => {
    // La phrase appartient à l'écran : « un fonds négatif » et « une quantité
    // négative » ne se disent pas pareil, et c'est l'écran qui sait laquelle.
    expect(lireNombre("-500")).toEqual({ ok: false, motif: "negatif" });
    for (const saisie of ["abc", "12,5,5", "1.2.3", ",", "12$"]) {
      expect(lireNombre(saisie)).toEqual({ ok: false, motif: "illisible" });
    }
  });

  it("ne DEVINE pas une virgule de milliers", () => {
    // « 12,500 » vaut douze et demi en français. Deviner l'autre lecture
    // écrirait un montant faux qui a l'air juste.
    expect(valeur("12,500")).toBe(12.5);
  });
});
