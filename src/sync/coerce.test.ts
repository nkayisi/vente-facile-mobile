/**
 * Conversion des valeurs reçues.
 *
 * C'est ici que se tient la discipline des décimales : un panier en francs
 * congolais à sept chiffres perd ses unités dès qu'il passe par un flottant.
 * Le serveur les envoie en chaîne, la base les range en chaîne, et rien entre
 * les deux ne doit les convertir « pour faire propre ».
 */
import { coerce } from "./coerce";

describe("décimales", () => {
  it("restent des chaînes, intactes", () => {
    expect(coerce("1250036.40", "decimal")).toBe("1250036.40");
    expect(coerce("0.000", "decimal")).toBe("0.000");
    // Les zéros de queue portent la précision de la colonne : les perdre,
    // c'est perdre l'information « trois décimales ».
    expect(coerce("12.500", "decimal")).toBe("12.500");
  });

  it("ne passent jamais par un nombre", () => {
    const gros = "9007199254740993.99"; // au-delà de la précision d'un double
    expect(coerce(gros, "decimal")).toBe(gros);
  });
});

describe("horodatages", () => {
  it("deviennent des millisecondes comparables", () => {
    const iso = "2026-08-28T09:14:02.317Z";
    expect(coerce(iso, "datetime")).toBe(Date.parse(iso));
  });

  it("supportent un décalage horaire sans se décaler", () => {
    // Deux écritures du MÊME instant. Un tri lexicographique sur l'ISO les
    // aurait ordonnées à l'envers ; en millisecondes, elles sont égales.
    const utc = coerce("2026-08-28T09:00:00+00:00", "datetime");
    const kinshasa = coerce("2026-08-28T10:00:00+01:00", "datetime");
    expect(utc).toBe(kinshasa);
  });

  it("rendent null plutôt qu'un NaN sur une date illisible", () => {
    // Un NaN en base se relit en null de toute façon, mais silencieusement :
    // autant le décider ici.
    expect(coerce("pas une date", "datetime")).toBeNull();
  });
});

describe("booléens", () => {
  it("deviennent 0 ou 1, ce que SQLite sait ranger", () => {
    expect(coerce(true, "boolean")).toBe(1);
    expect(coerce(false, "boolean")).toBe(0);
  });
});

describe("JSON", () => {
  it("se range en texte, qu'il arrive en objet ou déjà sérialisé", () => {
    expect(coerce({ a: 1 }, "json")).toBe('{"a":1}');
    expect(coerce('{"a":1}', "json")).toBe('{"a":1}');
  });
});

describe("valeurs absentes", () => {
  it("sont nulles, quel que soit le type", () => {
    for (const kind of ["text", "decimal", "datetime", "boolean", "json"] as const) {
      expect(coerce(null, kind)).toBeNull();
      expect(coerce(undefined, kind)).toBeNull();
    }
  });

  it("distinguent le zéro et le vide de l'absence", () => {
    // `0` et `""` sont des valeurs : les confondre avec null effacerait un
    // stock à zéro ou une note vidée.
    expect(coerce(0, "integer")).toBe(0);
    expect(coerce("", "text")).toBe("");
    expect(coerce(false, "boolean")).toBe(0);
  });
});
