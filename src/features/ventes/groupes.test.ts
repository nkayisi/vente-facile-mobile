/**
 * Le découpage d'un historique en journées.
 *
 * Ces règles ne lèvent jamais quand elles sont fausses : une borne de jour en
 * UTC range simplement une vente de 23h30 sous la veille, et un sous-total qui
 * mêle deux devises affiche un nombre qui n'existe pas mais qui a l'air juste.
 * C'est ce qui les rend indispensables à prouver hors appareil.
 */
import { grouperParJour, type GroupeJour } from "./groupes";
import type { VenteResume } from "@/data/ventes";

let n = 0;
function vente(patch: Partial<VenteResume> = {}): VenteResume {
  n += 1;
  return {
    id: `v${n}`,
    reference: `VT-${n}`,
    client: null,
    statut: "completed",
    total: 100,
    resteAPayer: 0,
    devise: "USD",
    date: new Date(2026, 7, 31, 10, 0),
    ...patch,
  };
}

const LE_31 = new Date(2026, 7, 31, 12, 0);

/** Les seuls en-têtes, dans l'ordre. */
const jours = (elements: ReturnType<typeof grouperParJour>): GroupeJour[] =>
  elements.flatMap((e) => (e.type === "jour" ? [e.groupe] : []));

beforeEach(() => {
  n = 0;
});

describe("grouperParJour", () => {
  it("pose un en-tête devant chaque journée, et rien de plus", () => {
    const elements = grouperParJour(
      [
        vente({ date: new Date(2026, 7, 31, 14, 0) }),
        vente({ date: new Date(2026, 7, 31, 9, 0) }),
        vente({ date: new Date(2026, 7, 30, 18, 0) }),
      ],
      LE_31
    );
    expect(elements.map((e) => e.type)).toEqual([
      "jour", "vente", "vente", "jour", "vente",
    ]);
    expect(jours(elements).map((g) => g.nb)).toEqual([2, 1]);
  });

  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LA JOURNÉE EST LOCALE, JAMAIS UTC.                                    │
   * │                                                                        │
   * │ Une vente saisie à 23h30 est déjà le lendemain en UTC : découpée sur   │
   * │ l'horloge universelle, elle se rangerait sous la date du lendemain et  │
   * │ le sous-total du jour serait amputé du dernier client de la soirée.    │
   * │ C'est la règle de `day_bounds()` côté serveur, et celle de tout le     │
   * │ reste de ce terminal.                                                  │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it("garde la vente de 23h30 dans SA journée", () => {
    const elements = grouperParJour(
      [
        vente({ date: new Date(2026, 7, 31, 23, 30) }),
        vente({ date: new Date(2026, 7, 31, 8, 0) }),
      ],
      LE_31
    );
    expect(jours(elements)).toHaveLength(1);
    expect(jours(elements)[0].nb).toBe(2);
  });

  it("sépare 23h30 de 00h30 le lendemain", () => {
    const elements = grouperParJour(
      [
        vente({ date: new Date(2026, 8, 1, 0, 30) }),
        vente({ date: new Date(2026, 7, 31, 23, 30) }),
      ],
      new Date(2026, 8, 1, 12, 0)
    );
    expect(jours(elements)).toHaveLength(2);
  });

  it("dit « Aujourd'hui » et « Hier » plutôt qu'une date", () => {
    const elements = grouperParJour(
      [
        vente({ date: new Date(2026, 7, 31, 10, 0) }),
        vente({ date: new Date(2026, 7, 30, 10, 0) }),
        vente({ date: new Date(2026, 7, 29, 10, 0) }),
      ],
      LE_31
    );
    expect(jours(elements).map((g) => g.label)).toEqual([
      "Aujourd'hui",
      "Hier",
      // Le jour de la semaine en tête : c'est ce qui situe une vente dont on
      // se souvient (« c'était un samedi »).
      "Samedi 29 août",
    ]);
  });

  it("passe le mois et l'année sans se tromper de veille", () => {
    const elements = grouperParJour(
      [vente({ date: new Date(2025, 11, 31, 10, 0) })],
      new Date(2026, 0, 1, 12, 0)
    );
    expect(jours(elements)[0].label).toBe("Hier");
  });

  /**
   * Additionner des francs et des dollars donne un nombre qui n'existe pas.
   * Le sous-total d'une journée n'échappe pas à la règle : c'est même là
   * qu'elle se transgresse le plus facilement, un en-tête ayant l'air d'un
   * simple résumé.
   */
  it("ventile le sous-total par devise, sans jamais le sommer", () => {
    const elements = grouperParJour(
      [
        vente({ total: 100, devise: "USD" }),
        vente({ total: 280000, devise: "CDF" }),
        vente({ total: 50, devise: "USD" }),
      ],
      LE_31
    );
    expect(jours(elements)[0].totalParDevise).toEqual([
      { devise: "CDF", montant: 280000 },
      { devise: "USD", montant: 150 },
    ]);
  });

  /**
   * Un montant inconnu vaut zéro faute de mieux, et ce zéro n'a rien à faire
   * dans un sous-total : il ferait passer une journée incomplète pour une
   * journée arrêtée. L'en-tête le COMPTE pour pouvoir le dire.
   */
  it("compte la vente sans montant sans l'additionner", () => {
    const elements = grouperParJour(
      [
        vente({ total: 100, devise: "USD" }),
        vente({ total: 0, montantConnu: false, devise: "USD" }),
      ],
      LE_31
    );
    const g = jours(elements)[0];
    expect(g.nb).toBe(2);
    expect(g.sansMontant).toBe(1);
    expect(g.totalParDevise).toEqual([{ devise: "USD", montant: 100 }]);
  });

  /** Une devise vide écrirait un montant SANS SYMBOLE, en silence. */
  it("écarte du sous-total ce dont la devise est inconnue", () => {
    const elements = grouperParJour(
      [vente({ total: 100, devise: "USD" }), vente({ total: 40, devise: "" })],
      LE_31
    );
    expect(jours(elements)[0].totalParDevise).toEqual([{ devise: "USD", montant: 100 }]);
    expect(jours(elements)[0].nb).toBe(2);
  });

  /**
   * Une vente sans date rangée sous « Aujourd'hui » grossirait un sous-total
   * auquel elle n'appartient pas, et rien ne dirait laquelle.
   */
  it("donne son propre groupe à une vente sans date", () => {
    const elements = grouperParJour(
      [vente(), vente({ date: null })],
      LE_31
    );
    expect(jours(elements).map((g) => g.label)).toEqual(["Aujourd'hui", "Date inconnue"]);
  });

  it("ne trie pas : l'ordre appartient à la lecture qui fusionne", () => {
    // Deux jours entrelacés, comme un tri manquant les rendrait. Le groupement
    // les laisse tels quels plutôt que de masquer le défaut en amont.
    const elements = grouperParJour(
      [
        vente({ date: new Date(2026, 7, 31, 10, 0) }),
        vente({ date: new Date(2026, 7, 30, 10, 0) }),
        vente({ date: new Date(2026, 7, 31, 9, 0) }),
      ],
      LE_31
    );
    expect(jours(elements).map((g) => g.label)).toEqual(["Aujourd'hui", "Hier", "Aujourd'hui"]);
  });

  it("rend une liste vide sur une liste vide", () => {
    expect(grouperParJour([], LE_31)).toEqual([]);
  });
});
