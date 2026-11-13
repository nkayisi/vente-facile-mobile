/**
 * Le fonds d'ouverture : ce qui part au serveur, et ce qui n'en part pas.
 *
 * Ces deux règles décident de l'argent qu'un Z annoncera le soir même. Elles
 * sont éprouvées ici parce qu'aucune des deux ne se voit à l'écran : une
 * virgule refusée par le serveur part en quarantaine sans rien afficher, et un
 * héritage écrasé par un zéro ne se découvre qu'au comptage du tiroir.
 */
import { analyserFond, devisesDuFonds, fondsParDevise, lireFonds } from "./fond";

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

describe("le fonds d'ouverture par devise", () => {
  it("les lignes par devise font foi", () => {
    const f = fondsParDevise(
      [{ devise: "CDF", ouverture: 50_000 }, { devise: "USD", ouverture: 20 }],
      50_000,
      "CDF"
    );
    expect([...f.entries()]).toEqual([["CDF", 50_000], ["USD", 20]]);
  });

  it("sans lignes, le scalaire va à la devise PRINCIPALE, jamais à une autre", () => {
    // ⚠ Le défaut : il allait à la devise du premier règlement de la session.
    expect([...fondsParDevise([], 50_000, "CDF").entries()]).toEqual([["CDF", 50_000]]);
  });

  it("un fonds nul n'invente aucune devise", () => {
    expect(fondsParDevise([], 0, "CDF").size).toBe(0);
  });
});

describe("les fonds saisis devise par devise", () => {
  it("la principale à part, les secondaires renseignées seulement", () => {
    expect(lireFonds({ CDF: "50 000", USD: "20", EUR: "" }, "CDF")).toEqual({
      ok: true,
      principal: 50_000,
      autres: [{ devise: "USD", montant: 20 }],
    });
  });

  it("une devise VIDE hérite, elle ne vaut pas zéro", () => {
    // ⚠ Le défaut redouté : « 0 » envoyé pour un dollar laissé vide viderait
    //   un tiroir que personne n'a compté.
    expect(lireFonds({ CDF: "", USD: "" }, "CDF")).toEqual({ ok: true, principal: null, autres: [] });
  });

  it("zéro écrit est une affirmation, et il part", () => {
    expect(lireFonds({ CDF: "0", USD: "0" }, "CDF")).toEqual({
      ok: true,
      principal: 0,
      autres: [{ devise: "USD", montant: 0 }],
    });
  });

  it("toutes les erreurs à la fois, par devise", () => {
    const r = lireFonds({ CDF: "-5", USD: "1,2,3" }, "CDF");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erreurs).sort()).toEqual(["CDF", "USD"]);
  });
});

describe("les devises du fonds", () => {
  const d = (code: string, is_primary = false, is_active = true) => ({
    currency_code: code,
    is_primary,
    is_active,
  });

  it("la principale d'abord, une devise désactivée écartée", () => {
    expect(devisesDuFonds([d("USD"), d("EUR", false, false), d("CDF", true)], "CDF")).toEqual([
      { code: "CDF", principale: true },
      { code: "USD", principale: false },
    ]);
  });

  it("la principale est toujours offerte, même absente de la liste", () => {
    expect(devisesDuFonds([], "CDF")).toEqual([{ code: "CDF", principale: true }]);
  });
});
