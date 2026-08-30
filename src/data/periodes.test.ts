import { depuisQuand } from "./periodes";

/**
 * Les périodes du terminal doivent être celles du SERVEUR, pas celles qu'on
 * trouverait logiques.
 *
 * `apps/organizations/views.py::dashboard` définit « semaine » comme les SEPT
 * DERNIERS JOURS et « mois » comme le 1er à aujourd'hui. Le lot 5bis a déjà
 * corrigé une divergence de ce type : le tableau de bord mobile affichait un
 * chiffre d'affaires différent du web parce que « semaine » y avait été
 * recalculée en semaine calendaire.
 *
 * Les bornes sont en heure LOCALE, comme `day_bounds()` côté serveur : une
 * vente saisie à 23h30 est déjà le lendemain en UTC et disparaîtrait du jour.
 */
describe("bornes de période", () => {
  // Mercredi 26 août 2026, 14h30, heure locale.
  const maintenant = new Date(2026, 7, 26, 14, 30, 0);

  it("« jour » part de minuit LOCAL, pas de minuit UTC", () => {
    const d = depuisQuand("jour", maintenant)!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(26);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("« semaine » vaut les SEPT DERNIERS JOURS, pas la semaine calendaire", () => {
    // Calendaire, un mercredi partirait du lundi 24. Le serveur part du 20.
    const d = depuisQuand("semaine", maintenant)!;
    expect(d.getDate()).toBe(20);
    expect(d.getMonth()).toBe(7);
    expect(d.getHours()).toBe(0);
  });

  it("« mois » part du 1er du mois courant", () => {
    const d = depuisQuand("mois", maintenant)!;
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(7);
    expect(d.getHours()).toBe(0);
  });

  it("« tout » n'a pas de borne", () => {
    expect(depuisQuand("tout", maintenant)).toBeNull();
  });

  it("« semaine » traverse un changement de mois", () => {
    // 3 septembre : les sept derniers jours remontent au 28 août.
    const d = depuisQuand("semaine", new Date(2026, 8, 3, 9, 0, 0))!;
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(28);
  });
});
