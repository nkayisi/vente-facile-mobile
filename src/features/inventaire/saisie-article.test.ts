/**
 * Les refus du formulaire d'article, miroir de `_validate_packaging`.
 *
 * Ils sont opposés AU COMPTOIR et non à la poussée : un refus découvert par le
 * serveur arrive en quarantaine, c'est-à-dire le lendemain, sur un autre écran,
 * alors que le marchand a sa fiche sous les yeux maintenant.
 */
import { lireChamp, refusDeSaisie, saisiePrete } from "./saisie-article";
import type { SaisieBrute } from "./saisie-article";

const detail: SaisieBrute = {
  nom: "Eau 50cl",
  sku: "EAU-50",
  mode: "retail_only",
  unite: null,
  uniteContenant: null,
  parContenant: "",
  prixVente: "1500",
  prixVenteGros: "",
};

const gros: SaisieBrute = {
  ...detail,
  mode: "wholesale_and_retail",
  unite: "u-detail",
  uniteContenant: "u-contenant",
  parContenant: "12",
  prixVenteGros: "16000",
};

describe("lireChamp", () => {
  it("rend null sur un champ vide, jamais zéro", () => {
    expect(lireChamp("")).toEqual({ valeur: null });
  });

  it("lit un séparateur de milliers", () => {
    // `Number("12 500") || 0` donnait ZÉRO : sur un prix de vente, cela
    // enregistre un article donné, et le comptoir le vend pour rien.
    expect(lireChamp("12 500").valeur).toBe(12500);
  });

  it("lit la virgule décimale française", () => {
    expect(lireChamp("12,5").valeur).toBe(12.5);
  });

  it("REFUSE une saisie illisible au lieu de la ramener à zéro", () => {
    const lu = lireChamp("12,5,0");
    expect(lu.valeur).toBeNull();
    expect(lu.refus).toBeTruthy();
  });

  it("refuse un montant négatif", () => {
    expect(lireChamp("-5").refus).toBeTruthy();
  });
});

describe("refusDeSaisie", () => {
  it("laisse passer une vente au détail complète", () => {
    expect(refusDeSaisie(detail)).toEqual({
      unite: undefined,
      contenant: undefined,
      facteur: undefined,
      prixVente: undefined,
      prixVenteGros: undefined,
    });
    expect(saisiePrete(detail)).toBe(true);
  });

  it("n'exige NI unité NI contenant au détail seul", () => {
    // Le serveur ne les demande que si le mode sort du détail : les exiger ici
    // interdirait de créer un article que le back-office accepte.
    expect(refusDeSaisie({ ...detail, unite: null }).unite).toBeUndefined();
    expect(refusDeSaisie(detail).contenant).toBeUndefined();
  });

  it("exige l'unité de détail, le contenant et le facteur dès qu'on vend en gros", () => {
    const r = refusDeSaisie({
      ...gros,
      unite: null,
      uniteContenant: null,
      parContenant: "",
    });
    expect(r.unite).toBeTruthy();
    expect(r.contenant).toBeTruthy();
    expect(r.facteur).toBeTruthy();
  });

  it("refuse un contenant d'UNE unité, comme le serveur", () => {
    // `getPackaging` du noyau et `PackagingService.factor` imposent tous deux
    // un facteur >= 2 : à un, le « contenant » n'en est pas un.
    expect(refusDeSaisie({ ...gros, parContenant: "1" }).facteur).toBeTruthy();
    expect(refusDeSaisie({ ...gros, parContenant: "2" }).facteur).toBeUndefined();
  });

  it("n'exige PAS de prix de détail en gros seul", () => {
    // En gros seul, c'est le prix du contenant qui prend le relais et le
    // serveur en déduit l'unitaire.
    const r = refusDeSaisie({ ...gros, mode: "wholesale_only", prixVente: "" });
    expect(r.prixVente).toBeUndefined();
    expect(r.prixVenteGros).toBeUndefined();
  });

  it("exige le prix du contenant dès que l'article se vend en gros", () => {
    expect(refusDeSaisie({ ...gros, prixVenteGros: "" }).prixVenteGros).toBeTruthy();
  });

  it("REMONTE le motif d'une saisie illisible, plutôt que « obligatoire »", () => {
    // « 12,5,0 » n'est pas un champ oublié : dire « obligatoire » enverrait le
    // marchand retaper ce qu'il a déjà tapé, sans savoir ce qui cloche.
    const r = refusDeSaisie({ ...detail, prixVente: "12,5,0" });
    expect(r.prixVente).toContain("illisible");
  });

  it("un prix de vente à zéro est un REFUS, pas un article gratuit", () => {
    expect(refusDeSaisie({ ...detail, prixVente: "0" }).prixVente).toBeTruthy();
  });
});

describe("saisiePrete", () => {
  it("exige le nom et le code", () => {
    expect(saisiePrete({ ...detail, nom: "   " })).toBe(false);
    expect(saisiePrete({ ...detail, sku: "" })).toBe(false);
  });

  it("ferme le bouton tant qu'un refus subsiste", () => {
    expect(saisiePrete({ ...gros, parContenant: "1" })).toBe(false);
    expect(saisiePrete(gros)).toBe(true);
  });
});
