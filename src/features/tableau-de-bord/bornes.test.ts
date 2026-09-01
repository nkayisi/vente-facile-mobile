/**
 * Les bornes du tableau de bord : GLISSANTES, donc emboîtées.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « MOIS » POUVAIT ÊTRE PLUS PETIT QUE « SEMAINE ».                        │
 * │                                                                          │
 * │ `week` était glissante (`aujourd'hui - 6`), `month` et `year`            │
 * │ calendaires. Le 1er septembre, « Mois » couvrait UNE SEULE JOURNÉE       │
 * │ pendant que « Semaine » remontait au 26 août : une vente du 28 août      │
 * │ figurait dans « Semaine » et dans « Année », et disparaissait de         │
 * │ « Mois ». Le marchand y lisait une perte de données, et cela revenait    │
 * │ les six premiers jours de CHAQUE mois.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le second rôle de ce fichier est la PARITÉ : ces bornes sont recopiées de
 * `apps/organizations/views.py::_periode_glissante`, et les décalages sont
 * affirmés en dur ici comme là-bas. Les changer d'un côté seulement ferait
 * donner deux chiffres différents au même établissement, sans que rien ne le
 * signale.
 */
import { bornes, type Periode } from "./series";

const PERIODES: Periode[] = ["day", "week", "month", "year"];

/** Les deux quantièmes où l'ancienne règle cassait, plus deux témoins. */
const JOURS_TEMOINS = [
  new Date(2026, 8, 1), // 1er septembre : « Mois » ne valait qu'un jour
  new Date(2026, 0, 1), // 1er janvier : « Année » ne valait qu'un jour
  new Date(2026, 2, 2), // le lendemain d'un 1er
  new Date(2026, 6, 17), // milieu de mois, le cas ordinaire
  new Date(2028, 1, 29), // année bissextile
];

const jour = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe("bornes du tableau de bord", () => {
  it("chaque période contient strictement la précédente", () => {
    for (const aujourdhui of JOURS_TEMOINS) {
      const debuts = Object.fromEntries(
        PERIODES.map((p) => [p, bornes(p, aujourdhui).debut.getTime()])
      ) as Record<Periode, number>;

      // Un début PLUS ANCIEN veut dire une période plus large : la borne haute
      // est toujours aujourd'hui.
      expect(debuts.week).toBeLessThanOrEqual(debuts.day);
      expect(debuts.month).toBeLessThanOrEqual(debuts.week);
      expect(debuts.year).toBeLessThanOrEqual(debuts.month);
    }
  });

  it("la borne haute est demain, jamais plus loin", () => {
    // Un tableau de bord ouvert le 3 du mois ne doit pas ménager des journées
    // à venir : la vente du jour s'y lirait comme un effondrement.
    for (const aujourdhui of JOURS_TEMOINS) {
      for (const p of PERIODES) {
        const { fin } = bornes(p, aujourdhui);
        const demain = new Date(
          aujourdhui.getFullYear(),
          aujourdhui.getMonth(),
          aujourdhui.getDate() + 1
        );
        expect(jour(fin)).toBe(jour(demain));
      }
    }
  });

  it("les décalages sont ceux que le serveur applique", () => {
    const aujourdhui = new Date(2026, 8, 1);
    expect(jour(bornes("day", aujourdhui).debut)).toBe("2026-9-1");
    expect(jour(bornes("week", aujourdhui).debut)).toBe("2026-8-26");
    expect(jour(bornes("month", aujourdhui).debut)).toBe("2026-8-3");
    // L'année part du 1er d'un mois et non de `aujourd'hui - 364` : le
    // graphique groupe par mois, et une fenêtre à cheval rendrait treize seaux
    // dont deux partiels, avec deux étiquettes « sept. » sur le même axe.
    expect(jour(bornes("year", aujourdhui).debut)).toBe("2025-10-1");
  });

  it("la période précédente s'arrête au début de la courante", () => {
    // `finPrecedent` est EXCLUSIVE : elle vaut le début de la période
    // courante. Un chevauchement d'un jour compterait deux fois les ventes de
    // ce jour-là, dans la période et dans celle qui sert de référence.
    for (const aujourdhui of JOURS_TEMOINS) {
      for (const p of PERIODES) {
        const b = bornes(p, aujourdhui);
        expect(b.finPrecedent.getTime()).toBe(b.debut.getTime());
        expect(b.debutPrecedent.getTime()).toBeLessThan(b.finPrecedent.getTime());
      }
    }
  });

  it("la période précédente a la même longueur que la courante", () => {
    // Sans quoi la variation compare deux fenêtres inégales et invente une
    // hausse. L'année recule de douze MOIS, dont la longueur varie : elle est
    // écartée de cette égalité stricte.
    const enJours = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
    for (const aujourdhui of JOURS_TEMOINS) {
      for (const p of ["day", "week", "month"] as Periode[]) {
        const b = bornes(p, aujourdhui);
        expect(enJours(b.debutPrecedent, b.finPrecedent)).toBe(
          enJours(b.debut, b.fin)
        );
      }
    }
  });

  it("l'année couvre douze mois, dont celui en cours", () => {
    const b = bornes("year", new Date(2026, 8, 15));
    expect(jour(b.debut)).toBe("2025-10-1");
    expect(jour(b.debutPrecedent)).toBe("2024-10-1");
    expect(jour(b.finPrecedent)).toBe("2025-10-1");
  });
});
