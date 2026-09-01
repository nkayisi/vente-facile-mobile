import {
  arcsDonut,
  cheminSecteur,
  cleDeSeau,
  indicesEtiquettes,
  labelDeSeau,
  bornes,
  seauxDePeriode,
} from "./series";

const d = (a: number, m: number, j: number) => new Date(a, m - 1, j);

describe("découpage temporel", () => {
  it("l'année groupe par MOIS, tout le reste par JOUR", () => {
    expect(cleDeSeau(d(2026, 8, 31), "year")).toBe("2026-08");
    expect(cleDeSeau(d(2026, 8, 31), "month")).toBe("2026-08-31");
    expect(cleDeSeau(d(2026, 8, 31), "week")).toBe("2026-08-31");
    expect(cleDeSeau(d(2026, 8, 31), "day")).toBe("2026-08-31");
  });

  it("les seaux VIDES sont conservés", () => {
    // C'est la différence assumée avec le serveur : sans eux, une semaine
    // vendue lundi et vendredi tire un trait au-dessus de trois journées à
    // zéro, comme si elles avaient vendu.
    const seaux = seauxDePeriode("week", d(2026, 8, 25), d(2026, 9, 1));
    expect(seaux).toHaveLength(7);
    expect(seaux[0].cle).toBe("2026-08-25");
    expect(seaux[6].cle).toBe("2026-08-31");
  });

  it("n'engendre AUCUN seau au-delà de la borne haute", () => {
    // Un tableau de bord ouvert le 3 du mois dessinerait sinon vingt-huit
    // journées à venir, toutes à zéro, et la vente du jour se lirait comme un
    // effondrement.
    const seaux = seauxDePeriode("month", d(2026, 8, 1), d(2026, 8, 4));
    expect(seaux.map((s) => s.cle)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("l'année glissante rend DOUZE seaux, aux étiquettes toutes distinctes", () => {
    // Les bornes de « 12 mois » partent du 1er d'un mois : c'est ce qui rend
    // douze seaux pleins. Une fenêtre à cheval (`aujourd'hui - 364`) en
    // rendrait treize, dont deux partiels, avec DEUX étiquettes « sept. » sur
    // le même axe - et le lecteur ne saurait pas laquelle est l'année en cours.
    const b = bornes("year", new Date(2026, 8, 15));
    const seaux = seauxDePeriode("year", b.debut, b.fin);
    expect(seaux).toHaveLength(12);
    expect(seaux[0].label).toBe("oct.");
    expect(seaux[11].label).toBe("sept.");
    expect(new Set(seaux.map((s) => s.label)).size).toBe(12);
  });

  it("l'année s'arrête au mois courant, jamais sur un mois à venir", () => {
    const seaux = seauxDePeriode("year", d(2026, 1, 1), d(2026, 9, 1));
    expect(seaux).toHaveLength(8);
    expect(seaux[0].label).toBe("janv.");
    expect(seaux[7].label).toBe("août");
  });

  it("le mois qui change de longueur ne saute rien", () => {
    // `setDate(+1)` sur le 31 janvier donne le 31 février, que JavaScript
    // reporte au 3 mars : la boucle doit rester sur des dates réelles.
    const seaux = seauxDePeriode("week", d(2026, 1, 29), d(2026, 2, 3));
    expect(seaux.map((s) => s.cle)).toEqual([
      "2026-01-29",
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });

  it("une période vide ou inversée ne rend rien", () => {
    expect(seauxDePeriode("month", d(2026, 8, 5), d(2026, 8, 5))).toEqual([]);
    expect(seauxDePeriode("month", d(2026, 8, 5), d(2026, 8, 1))).toEqual([]);
  });
});

describe("étiquettes de l'axe", () => {
  it("la semaine nomme le JOUR, le mois nomme le quantième", () => {
    // Un marchand reconnaît « son samedi » sans compter les dates ; mais deux
    // mardis d'un même mois se confondraient.
    expect(labelDeSeau(d(2026, 8, 31), "week")).toBe("lun");
    expect(labelDeSeau(d(2026, 8, 31), "month")).toBe("31");
    expect(labelDeSeau(d(2026, 8, 31), "year")).toBe("août");
    expect(labelDeSeau(d(2026, 8, 31), "day")).toBe("31 août");
  });

  it("les étiquettes viennent du noyau, jamais d'`Intl`", () => {
    // Hermes n'embarque pas l'ICU complète et se replie sur l'anglais SANS
    // lever : « lun » sortirait « Mon » sur le terminal du marchand, et jamais
    // sur la machine du développeur.
    const source: string = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "series.ts"),
      "utf8"
    );
    // Commentaires retirés : une règle CITÉE n'est pas une infraction.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/toLocaleDateString|toLocaleString|Intl\./);
  });

  it("l'axe chargé garde ses deux bornes et s'éclaircit au milieu", () => {
    const v = indicesEtiquettes(31, 6);
    expect(v.has(0)).toBe(true);
    expect(v.has(30)).toBe(true);
    expect(v.size).toBe(6);
  });

  it("un axe court garde toutes ses étiquettes", () => {
    // Sept est le défaut PRÉCISÉMENT pour que la semaine garde ses sept jours.
    expect([...indicesEtiquettes(7)].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(indicesEtiquettes(0)).toEqual(new Set());
  });
});

describe("géométrie de l'anneau", () => {
  it("les arcs plus les écarts ferment le tour", () => {
    const arcs = arcsDonut([50, 30, 20], 2);
    expect(arcs).toHaveLength(3);
    expect(arcs[0].debut).toBeCloseTo(0, 6);
    expect(arcs[2].fin + 2).toBeCloseTo(360, 6);
  });

  it("une tranche unique n'a pas d'écart : l'anneau ferme", () => {
    // Un anneau ouvert de deux degrés se lit comme une donnée manquante.
    const [seul] = arcsDonut([42], 2);
    expect(seul.debut).toBe(0);
    expect(seul.fin).toBe(360);
  });

  it("les proportions sont respectées", () => {
    const [a, b] = arcsDonut([75, 25], 2);
    expect(a.fin - a.debut).toBeCloseTo((360 - 4) * 0.75, 6);
    expect(b.fin - b.debut).toBeCloseTo((360 - 4) * 0.25, 6);
  });

  it("rien à dessiner quand tout est nul ou négatif", () => {
    expect(arcsDonut([])).toEqual([]);
    expect(arcsDonut([0, 0])).toEqual([]);
    expect(arcsDonut([-5])).toEqual([]);
  });

  it("une valeur aberrante ne casse pas le tour", () => {
    expect(arcsDonut([10, Number.NaN, 10])).toHaveLength(3);
  });

  it("au-delà d'un demi-tour, le drapeau « grand arc » est levé", () => {
    // Sans lui, SVG trace le COMPLÉMENT : une tranche de 70 % en dessine 30.
    expect(cheminSecteur(50, 50, 50, 30, 0, 250)).toContain("A 50 50 0 1 1");
    expect(cheminSecteur(50, 50, 50, 30, 0, 90)).toContain("A 50 50 0 0 1");
  });

  it("le secteur part de MIDI et referme sur lui-même", () => {
    const c = cheminSecteur(50, 50, 50, 30, 0, 90);
    expect(c.startsWith("M 50.000 0.000")).toBe(true);
    expect(c.endsWith("Z")).toBe(true);
  });
});
