/**
 * Le pavé de quantité : ce qu'il accepte, et ce qu'il refuse en le DISANT.
 *
 * Ces cas fixent la frontière entre « le serveur accepte » et « le comptoir
 * laisse taper ». Un écart d'un côté fait perdre une vente, de l'autre il fait
 * échouer un encaissement en 400, client déjà servi.
 */
import { frapper, SEPARATEUR } from "./saisie-quantite";

/** Rejoue une suite de touches, comme un caissier la frappe. */
function taper(touches: string): { valeur: string; dernierMotif: string | null } {
  let valeur = "";
  let dernierMotif: string | null = null;
  for (const t of touches) {
    const r = frapper(valeur, t);
    if (r.ok) {
      valeur = r.valeur;
      dernierMotif = null;
    } else {
      dernierMotif = r.motif;
    }
  }
  return { valeur, dernierMotif };
}

describe("Pavé de quantité", () => {
  it("accumule les chiffres", () => {
    expect(taper("123").valeur).toBe("123");
  });

  it("dépasse les cinq caractères d'avant", () => {
    // 99 999 était le plafond, en silence. Sept chiffres passent désormais.
    expect(taper("1234567").valeur).toBe("1234567");
  });

  it("accepte douze chiffres entiers, ce que le serveur enregistre", () => {
    expect(taper("999999999999").valeur).toBe("999999999999");
  });

  it("refuse le treizième, et le DIT", () => {
    const r = taper("9999999999999");
    expect(r.valeur).toBe("999999999999");
    expect(r.dernierMotif).toMatch(/12 chiffres/);
  });

  it("retire les zéros de tête", () => {
    expect(taper("007").valeur).toBe("7");
  });
});

describe("Le séparateur décimal", () => {
  it("pose un zéro devant quand le champ est vide", () => {
    // « ,5 » n'est pas un nombre.
    expect(taper(SEPARATEUR).valeur).toBe("0,");
  });

  it("laisse écrire un demi", () => {
    expect(taper(`0${SEPARATEUR}5`).valeur).toBe("0,5");
  });

  it("garde le zéro de tête devant une virgule", () => {
    // La garde des zéros exige un CHIFFRE derrière : une virgule n'en est pas un.
    expect(taper(`0${SEPARATEUR}75`).valeur).toBe("0,75");
  });

  it("accepte trois décimales", () => {
    expect(taper(`1${SEPARATEUR}234`).valeur).toBe("1,234");
  });

  it("refuse la quatrième, et le DIT", () => {
    const r = taper(`1${SEPARATEUR}2345`);
    expect(r.valeur).toBe("1,234");
    expect(r.dernierMotif).toMatch(/3 décimales/);
  });

  /**
   * ⚠ UNE SECONDE VIRGULE NE DIT RIEN, et c'est voulu : le caissier voit
   * déjà la première à l'écran. Expliquer l'évidence chasserait un refus qui
   * compte - celui des bornes.
   */
  it("ignore une seconde virgule, sans rien dire", () => {
    const r = frapper("1,5", SEPARATEUR);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toBeNull();
  });

  it("compte les décimales, pas les caractères", () => {
    // 12 entiers + virgule + 3 décimales = 16 caractères, tous légitimes.
    expect(taper(`999999999999${SEPARATEUR}999`).valeur).toBe("999999999999,999");
  });
});
