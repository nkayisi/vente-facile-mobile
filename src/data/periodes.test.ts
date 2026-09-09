/**
 * Les périodes, et leur EMBOÎTEMENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER VERROUILLAIT LE DÉFAUT.                                      │
 * │                                                                          │
 * │ Il affirmait que « mois » part du 1er du mois (`getDate() === 1`), en    │
 * │ invoquant le serveur - lequel était passé en glissant entre-temps. Un    │
 * │ test qui décrit fidèlement un comportement faux le rend permanent : il   │
 * │ passe au vert, il a l'air rigoureux, et il refuse le correctif.          │
 * │                                                                          │
 * │ Ce qu'il faut affirmer n'est pas un quantième, c'est l'INVARIANT :       │
 * │ `jour ⊆ 7 jours ⊆ 30 jours`, quel que soit le jour où l'on regarde. Il   │
 * │ ne tient QUE si les trois fenêtres sont glissantes, et il est faux dès   │
 * │ le 1er du mois si l'une d'elles est calendaire.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { bornes, depuisQuand, type Periode } from "./periodes";

/** Les témoins de `features/tableau-de-bord/bornes.test.ts`, mêmes pièges. */
const TEMOINS: [string, Date][] = [
  // Le 1er d'un mois : c'est là que le mois calendaire se réduit à UNE journée
  // pendant que la semaine glissante remonte au mois précédent. Le défaut
  // signalé a été relevé exactement ce jour-là.
  ["le 1er d'un mois", new Date(2026, 8, 1, 14, 30)],
  ["le 1er janvier", new Date(2026, 0, 1, 9, 0)],
  ["le 2 d'un mois", new Date(2026, 8, 2, 9, 0)],
  ["en milieu de mois", new Date(2026, 6, 17, 23, 59)],
  ["un 29 février", new Date(2028, 1, 29, 12, 0)],
];

describe("depuisQuand", () => {
  it.each(TEMOINS)("emboîte jour ⊆ 7 jours ⊆ 30 jours, %s", (_nom, maintenant) => {
    const jour = depuisQuand("jour", maintenant)!;
    const semaine = depuisQuand("semaine", maintenant)!;
    const mois = depuisQuand("mois", maintenant)!;

    // Une fenêtre plus large commence PLUS TÔT. Cette seule ligne aurait
    // attrapé le défaut : le 1er septembre, `mois` valait `jour`.
    expect(mois.getTime()).toBeLessThan(semaine.getTime());
    expect(semaine.getTime()).toBeLessThan(jour.getTime());
  });

  it("rend les fenêtres glissantes attendues", () => {
    const mercredi = new Date(2026, 7, 26, 14, 30);
    // Sept derniers jours, aujourd'hui compris : du 20 au 26.
    expect(depuisQuand("semaine", mercredi)).toEqual(new Date(2026, 7, 20));
    // Trente derniers jours, aujourd'hui compris : du 28 juillet au 26 août.
    expect(depuisQuand("mois", mercredi)).toEqual(new Date(2026, 6, 28));
  });

  it("part de MINUIT local, jamais de l'heure courante", () => {
    // Une vente encaissée ce matin doit figurer dans « Jour » à 14h30. Partir
    // de l'instant présent la ferait disparaître de sa propre journée.
    expect(depuisQuand("jour", new Date(2026, 7, 26, 14, 30))).toEqual(new Date(2026, 7, 26));
  });

  it("traverse un changement de mois sans se tromper", () => {
    // Le 3 septembre, les sept derniers jours remontent au 28 AOÛT.
    expect(depuisQuand("semaine", new Date(2026, 8, 3, 10, 0))).toEqual(new Date(2026, 7, 28));
  });

  it("« tout » n'a pas de borne", () => {
    expect(depuisQuand("tout")).toBeNull();
  });

  /**
   * Le défaut vivait dans une SECONDE copie de la règle. Tant qu'il n'y en a
   * qu'une, il ne peut pas revenir ; ce test le dit à qui serait tenté d'en
   * réécrire une ici.
   */
  it("DÉLÈGUE à `bornes`, elle ne recalcule rien", () => {
    const t = new Date(2026, 8, 1, 14, 30);
    const paires: [Periode, Parameters<typeof bornes>[0]][] = [
      ["jour", "day"],
      ["semaine", "week"],
      ["mois", "month"],
    ];
    for (const [periode, fenetre] of paires) {
      expect(depuisQuand(periode, t)).toEqual(bornes(fenetre, t).debut);
    }
  });
});
