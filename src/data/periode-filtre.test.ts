import { jourISO } from "./dates";
import {
  bornesLocales,
  libellePeriodeFiltre,
  moisCourant,
  moisRecents,
  parametresPeriode,
  type PeriodeFiltre,
} from "./periode-filtre";

/** Une date figée : un test de période qui dépend du jour ment un jour sur deux. */
const LE_5_SEPTEMBRE = new Date(2026, 8, 5, 14, 30);

describe("les paramètres envoyés au serveur", () => {
  it("« tout » n'envoie rien", () => {
    expect(parametresPeriode({ mode: "tout" }, LE_5_SEPTEMBRE)).toEqual({});
  });

  it("« aujourd'hui » borne la journée des deux côtés", () => {
    expect(parametresPeriode({ mode: "jour" }, LE_5_SEPTEMBRE)).toEqual({
      date_from: "2026-09-05",
      date_to: "2026-09-05",
    });
  });

  it("« 7 derniers jours » compte SEPT jours, aujourd'hui compris", () => {
    expect(parametresPeriode({ mode: "semaine" }, LE_5_SEPTEMBRE)).toEqual({
      date_from: "2026-08-30",
      date_to: "2026-09-05",
    });
  });

  it("« un mois précis » envoie le raccourci, jamais deux dates", () => {
    expect(parametresPeriode({ mode: "mois", mois: "2026-07" }, LE_5_SEPTEMBRE))
      .toEqual({ month: "2026-07" });
  });

  it("un mode « mois » sans mois retombe sur le mois courant", () => {
    expect(parametresPeriode({ mode: "mois" }, LE_5_SEPTEMBRE))
      .toEqual({ month: "2026-09" });
  });

  it("une plage à une seule borne reste à une seule borne", () => {
    // Le back-office le permet, et `filter_date_from` seul est légitime.
    expect(parametresPeriode({ mode: "personnalisee", debut: "2026-01-01" }))
      .toEqual({ date_from: "2026-01-01" });
  });
});

describe("les bornes locales", () => {
  it("range une saisie de 23h30 dans SA journée, pas dans la suivante", () => {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ LE PIÈGE DU FUSEAU, ET IL EST DÉJÀ VENU TROIS FOIS ICI.         │
    // │                                                                  │
    // │ À Kinshasa (UTC+1), 23h30 le 5 est déjà le 6 en temps universel. │
    // │ Une fenêtre bâtie sur `toISOString()` perdrait cette entrée du   │
    // │ rapport du jour où elle a été faite.                             │
    // └──────────────────────────────────────────────────────────────────┘
    const { debutMs, finMs } = bornesLocales({ mode: "jour" }, LE_5_SEPTEMBRE);
    const tardDansLaJournee = new Date(2026, 8, 5, 23, 30).getTime();

    expect(debutMs).not.toBeNull();
    expect(finMs).not.toBeNull();
    expect(tardDansLaJournee).toBeGreaterThanOrEqual(debutMs as number);
    expect(tardDansLaJournee).toBeLessThanOrEqual(finMs as number);
  });

  it("ferme la journée à la dernière milliseconde, jamais à minuit", () => {
    const { finMs } = bornesLocales({ mode: "jour" }, LE_5_SEPTEMBRE);
    expect(new Date(finMs as number)).toEqual(new Date(2026, 8, 5, 23, 59, 59, 999));
  });

  it("finit FÉVRIER 2024 le 29, sans table de longueurs de mois", () => {
    // Le test qui prouve qu'on ne devine ni 30 ni 31 : on prend la veille du
    // premier du mois suivant, comme `filter_month`.
    const { debutMs, finMs } = bornesLocales({ mode: "mois", mois: "2024-02" });
    expect(new Date(debutMs as number)).toEqual(new Date(2024, 1, 1));
    expect(new Date(finMs as number)).toEqual(new Date(2024, 1, 29, 23, 59, 59, 999));
  });

  it("finit décembre le 31, en changeant d'année", () => {
    const { finMs } = bornesLocales({ mode: "mois", mois: "2026-12" });
    expect(new Date(finMs as number)).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
  });

  it("« tout » n'a aucune borne", () => {
    expect(bornesLocales({ mode: "tout" })).toEqual({ debutMs: null, finMs: null });
  });

  it("un mois malformé ne borne RIEN plutôt que de border n'importe quoi", () => {
    expect(bornesLocales({ mode: "mois", mois: "oups" }))
      .toEqual({ debutMs: null, finMs: null });
  });

  /**
   * L'INVARIANT du module : la fenêtre lue en base et celle du document
   * décrivent le même intervalle. Sans lui, l'écran montrerait N lignes et le
   * fichier en porterait N+k, sans que rien ne le signale.
   */
  it.each<PeriodeFiltre>([
    { mode: "jour" },
    { mode: "semaine" },
    { mode: "mois", mois: "2026-07" },
    { mode: "personnalisee", debut: "2026-03-02", fin: "2026-03-09" },
  ])("décrit la MÊME fenêtre des deux côtés (%o)", (p) => {
    const params = parametresPeriode(p, LE_5_SEPTEMBRE);
    const { debutMs, finMs } = bornesLocales(p, LE_5_SEPTEMBRE);

    const attenduDebut = params.date_from ?? `${params.month}-01`;
    expect(jourISO(new Date(debutMs as number))).toBe(attenduDebut);

    if (params.date_to) {
      expect(jourISO(new Date(finMs as number))).toBe(params.date_to);
    } else {
      // Mode « mois » : la fin doit tomber DANS le mois demandé.
      expect(jourISO(new Date(finMs as number)).startsWith(params.month as string))
        .toBe(true);
    }
  });
});

describe("le libellé de la période", () => {
  it("nomme le mois en français, sans `Intl`", () => {
    expect(libellePeriodeFiltre({ mode: "mois", mois: "2026-09" }))
      .toBe("septembre 2026");
  });

  it("écrit une plage, et une journée seule autrement", () => {
    expect(libellePeriodeFiltre({ mode: "jour" }, LE_5_SEPTEMBRE))
      .toBe("le 2026-09-05");
    expect(libellePeriodeFiltre({ mode: "semaine" }, LE_5_SEPTEMBRE))
      .toBe("du 2026-08-30 au 2026-09-05");
  });

  it("dit « Tout l'historique » quand rien n'est posé", () => {
    expect(libellePeriodeFiltre({ mode: "tout" })).toBe("Tout l'historique");
  });

  it("nomme les bornes à demi ouvertes", () => {
    expect(libellePeriodeFiltre({ mode: "personnalisee", debut: "2026-01-01" }))
      .toBe("à partir du 2026-01-01");
    expect(libellePeriodeFiltre({ mode: "personnalisee", fin: "2026-01-31" }))
      .toBe("jusqu'au 2026-01-31");
  });
});

describe("le choix d'un mois", () => {
  it("propose douze mois, le courant en tête", () => {
    const options = moisRecents(LE_5_SEPTEMBRE);
    expect(options).toHaveLength(12);
    expect(options[0]).toEqual({ valeur: "2026-09", label: "septembre 2026" });
    expect(options[11]).toEqual({ valeur: "2025-10", label: "octobre 2025" });
  });

  it("s'accorde avec `moisCourant`", () => {
    expect(moisRecents(LE_5_SEPTEMBRE)[0].valeur).toBe(moisCourant(LE_5_SEPTEMBRE));
  });
});
