import { dateCourteFr, dateHeureCourteFr, jourEnLettresFr } from "./dates";

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
