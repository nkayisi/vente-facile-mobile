/**
 * Le fonds d'ouverture : ce qui part au serveur, et ce qui n'en part pas.
 *
 * Ces deux règles décident de l'argent qu'un Z annoncera le soir même. Elles
 * sont éprouvées ici parce qu'aucune des deux ne se voit à l'écran : une
 * virgule refusée par le serveur part en quarantaine sans rien afficher, et un
 * héritage écrasé par un zéro ne se découvre qu'au comptage du tiroir.
 */
import { analyserFond } from "./fond";

const montant = (saisie: string): number | null => {
  const r = analyserFond(saisie);
  if (!r.ok) throw new Error(`refusé : ${r.message}`);
  return r.montant;
};

describe("analyserFond", () => {
  it("lit la VIRGULE du pavé décimal francophone", () => {
    // C'est le défaut d'origine : « 12,5 » partait tel quel et `DecimalField`
    // le refusait, donc l'ouverture allait en quarantaine et n'en revenait pas.
    expect(montant("12,5")).toBe(12.5);
    expect(montant("12.5")).toBe(12.5);
  });

  it("lit les séparateurs de milliers, quels qu'ils soient", () => {
    // Un caissier qui compte 12 500 francs les écrit avec l'espace qu'il a
    // sous la main, et le clavier en propose trois.
    expect(montant("12 500")).toBe(12500);
    expect(montant("12 500")).toBe(12500);
    expect(montant("12 500,50")).toBe(12500.5);
  });

  it("rend `null` sur un champ VIDE, jamais zéro", () => {
    // `null` laisse le serveur hériter du tiroir de la dernière clôture.
    // Zéro l'écraserait, et le Z du soir annoncerait un excédent égal au fonds.
    expect(montant("")).toBeNull();
    expect(montant("   ")).toBeNull();
  });

  it("rend zéro quand le caissier l'ÉCRIT", () => {
    // Un tiroir vide est une affirmation : elle se tape, et elle doit passer.
    expect(montant("0")).toBe(0);
    expect(montant("0,00")).toBe(0);
  });

  it("refuse un montant négatif, en le NOMMANT", () => {
    const r = analyserFond("-500");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toMatch(/négatif/);
  });

  it("refuse ce qui n'est pas un nombre, et dit à quoi ça ressemble", () => {
    for (const saisie of ["abc", "12,5,5", "1.2.3", ",", "12$"]) {
      const r = analyserFond(saisie);
      expect(r.ok).toBe(false);
      // Un refus qui ne montre pas la forme attendue laisse le caissier
      // essayer au hasard, devant un client.
      expect(r.ok === false && r.message).toMatch(/12 500/);
    }
  });
});
