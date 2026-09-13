import { dateCourteFr, dateDepuisJourISO, dateHeureCourteFr, ilYA, jourEnLettresFr, jourISO } from "./dates";

describe("dates courtes sans Intl", () => {
  const d = new Date(2026, 7, 31, 14, 7, 9);

  it("rend la date numérique comme le faisait `toLocaleDateString`", () => {
    // La migration ne doit RIEN changer à ce que le marchand lit : ces écrans
    // n'étaient pas au programme, seul le moteur de rendu l'était.
    expect(dateCourteFr(d)).toBe("31/08/2026");
  });

  it("complète en heures, minutes et secondes", () => {
    expect(dateHeureCourteFr(d)).toBe("31/08/2026 14:07:09");
  });

  it("remplit les chiffres isolés", () => {
    expect(dateCourteFr(new Date(2026, 0, 5, 3, 4, 5))).toBe("05/01/2026");
    expect(dateHeureCourteFr(new Date(2026, 0, 5, 3, 4, 5))).toBe("05/01/2026 03:04:05");
  });

  it("nomme le jour en français, capitale en tête", () => {
    expect(jourEnLettresFr(d)).toBe("Lundi 31 août");
    expect(jourEnLettresFr(new Date(2026, 2, 1))).toBe("Dimanche 1 mars");
  });

  it("n'emploie NULLE PART `Intl` ni `toLocale*`", () => {
    const source: string = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "dates.ts"),
      "utf8"
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/toLocale[A-Za-z]*String|Intl\./);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « 2026-09-02 » N'EST PAS LE 2 SEPTEMBRE POUR `new Date`.                │
 * │                                                                          │
 * │ La forme courte est interprétée en UTC : sur un fuseau en retard sur     │
 * │ Greenwich, la date obtenue se rend « 01 sept. ». L'arrêté d'un rapport   │
 * │ daterait de la veille, et le marchand conclurait qu'il n'a pas été mis à │
 * │ jour. Kinshasa étant en AVANCE, le défaut ne se verrait jamais sur       │
 * │ l'émulateur qui a servi à écrire l'écran.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("dateDepuisJourISO", () => {
  it("rend le jour tel qu'il est écrit, en heure locale", () => {
    const d = dateDepuisJourISO("2026-09-02");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(8);
    expect(d!.getDate()).toBe(2);
    // Minuit LOCAL, pas minuit UTC : c'est toute la différence.
    expect(d!.getHours()).toBe(0);
  });

  it("est l'inverse exact de `jourISO`", () => {
    const origine = new Date(2026, 0, 1, 23, 30);
    expect(jourISO(dateDepuisJourISO(jourISO(origine))!)).toBe("2026-01-01");
  });

  it("accepte un horodatage complet et n'en garde que le jour", () => {
    // Le serveur rend `as_of` en jour nu, mais un champ voisin pourrait
    // porter l'heure : mieux vaut la couper que rendre `null`.
    expect(dateDepuisJourISO("2026-09-02T14:07:00Z")!.getDate()).toBe(2);
  });

  it("rend `null` plutôt qu'une date invalide", () => {
    // « Invalid Date » affiché à un marchand est pire qu'une ligne absente.
    for (const mauvais of ["", "  ", "hier", "02/09/2026", null, undefined]) {
      expect(dateDepuisJourISO(mauvais)).toBeNull();
    }
  });
});

describe("ilYA", () => {
  const T0 = new Date("2026-09-12T10:00:00.000Z");
  const ilYaDe = (ms: number) => ilYA(new Date(T0.getTime() - ms), T0);

  it("dit « jamais » pour une base qui n'a rien reçu", () => {
    // `null` ne se lit jamais comme « à l'instant » : une base jamais tirée
    // n'est pas une base fraîche.
    expect(ilYA(null, T0)).toBe("jamais");
  });

  it("dit « à l'instant » sous la minute", () => {
    expect(ilYaDe(0)).toBe("à l'instant");
    expect(ilYaDe(20_000)).toBe("à l'instant");
  });

  it("compte en minutes sous l'heure", () => {
    expect(ilYaDe(5 * 60_000)).toBe("il y a 5 min");
    expect(ilYaDe(59 * 60_000)).toBe("il y a 59 min");
  });

  it("compte en heures sous la journée", () => {
    expect(ilYaDe(3 * 3_600_000)).toBe("il y a 3 h");
  });

  it("compte en jours au-delà", () => {
    expect(ilYaDe(3 * 24 * 3_600_000)).toBe("il y a 3 j");
  });

  it("n'emploie aucun formateur de locale", () => {
    // `Intl` est proscrit : Hermes n'embarque pas l'ICU complète et se replie
    // sur l'anglais SANS lever, donc jamais sur la machine du développeur.
    for (const ms of [0, 60_000, 3_600_000, 86_400_000]) {
      expect(ilYaDe(ms)).toMatch(/^(jamais|à l'instant|il y a \d+ (min|h|j))$/);
    }
  });
});
