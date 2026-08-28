/**
 * Les transitions du panier.
 *
 * Un défaut ici ne plante pas : il fabrique un panier faux, qu'on découvre au
 * moment d'encaisser, ou pire, sur le ticket du client.
 */
import { PANIER_VIDE, reducteurPanier, type EtatPanier } from "./etat-panier";
import type { ArticlePos } from "./catalogue";

const casier = {
  id: "p1",
  name: "Primus 65cl",
  sku: null, barcode: null, image: null, categoryId: null, categoryName: null,
  selling_price: "5000",
  wholesale_price: "50000",
  is_taxable: false,
  tax_rate: "0",
  selling_mode: "wholesale_and_retail",
  units_per_package: 12,
  unit_name: "bouteille",
  packaging_unit_name: "casier",
  allow_auto_unpacking: true,
  track_inventory: true,
  allow_negative_stock: false,
  stock_quantity: 60,
  stock_packages: 4,
  stock_loose: 12,
  reserved_quantity: 0,
} satisfies ArticlePos;

const detail = {
  ...casier,
  id: "p2",
  name: "Savon",
  selling_mode: "retail_only",
  units_per_package: null,
  packaging_unit_name: null,
  wholesale_price: null,
  stock_quantity: 10,
  stock_packages: null,
  stock_loose: 10,
} satisfies ArticlePos;

const ajouter = (etat: EtatPanier, article: ArticlePos, packages: number, loose: number) =>
  reducteurPanier(etat, {
    type: "ajouter",
    article,
    saisie: { packages, loose },
    prix: Number(article.selling_price),
  });

describe("Panier", () => {
  it("garde les deux compteurs séparés au lieu de leur somme", () => {
    const etat = ajouter(PANIER_VIDE, casier, 2, 3);
    expect(etat.lignes).toHaveLength(1);
    expect(etat.lignes[0].packageQuantity).toBe(2);
    expect(etat.lignes[0].quantity).toBe(27);
  });

  it("additionne chaque canal séparément en fusionnant deux ajouts", () => {
    // 2 casiers + 3 bouteilles, puis 1 casier + 2 bouteilles.
    // Attendu : 3 casiers + 5 bouteilles, PAS « 41 » redécoupé en 3 casiers + 5,
    // ce qui donnerait ici le même chiffre par hasard mais divergerait dès que
    // le vrac dépasse un contenant.
    let etat = ajouter(PANIER_VIDE, casier, 2, 3);
    etat = ajouter(etat, casier, 1, 2);
    expect(etat.lignes).toHaveLength(1);
    expect(etat.lignes[0].packageQuantity).toBe(3);
    expect(etat.lignes[0].quantity).toBe(41);
  });

  it("ne redécoupe pas un vrac qui dépasse un contenant", () => {
    // 0 casier + 20 bouteilles : le rayon a bien 20 unités isolées, pas
    // « 1 casier + 8 bouteilles ». Un contenant entamé ne se rescelle pas.
    const etat = ajouter(PANIER_VIDE, casier, 0, 20);
    expect(etat.lignes[0].packageQuantity).toBe(0);
    expect(etat.lignes[0].quantity).toBe(20);
  });

  it("refuse un ajout que le stock ne permet pas, sans toucher au panier", () => {
    const plein = ajouter(PANIER_VIDE, casier, 4, 12); // tout le rayon
    const apres = ajouter(plein, casier, 0, 1);
    expect(apres).toBe(plein);
  });

  it("refuse le gros quand les contenants manquent, meme si le total suffit", () => {
    // 4 casiers scellés seulement, mais 60 unités au total.
    const etat = ajouter(PANIER_VIDE, casier, 5, 0);
    expect(etat.lignes).toHaveLength(0);
  });

  it("exclut la ligne editee de son propre controle de stock", () => {
    // Sans cette exclusion, ramener 4 casiers à 4 casiers serait refusé, la
    // ligne se comptant contre elle-même : le caissier ne pourrait plus rien
    // corriger dès qu'il a pris tout le rayon.
    const plein = ajouter(PANIER_VIDE, casier, 4, 0);
    const meme = reducteurPanier(plein, {
      type: "modifier", index: 0, saisie: { packages: 4, loose: 0 },
    });
    expect(meme.lignes[0].quantity).toBe(48);

    const reduit = reducteurPanier(plein, {
      type: "modifier", index: 0, saisie: { packages: 1, loose: 0 },
    });
    expect(reduit.lignes[0].quantity).toBe(12);
    expect(reduit.lignes[0].packageQuantity).toBe(1);
  });

  it("ignore une modification qui viderait la ligne", () => {
    // Retirer une ligne est une action explicite : une quantité à zéro laissée
    // dans le panier facturerait un article à 0, ce que le serveur accepterait.
    const plein = ajouter(PANIER_VIDE, casier, 1, 0);
    const apres = reducteurPanier(plein, {
      type: "modifier", index: 0, saisie: { packages: 0, loose: 0 },
    });
    expect(apres).toBe(plein);
  });

  it("borne la remise de ligne, sans jamais dépasser cent pour cent", () => {
    let etat = ajouter(PANIER_VIDE, detail, 0, 1);
    etat = reducteurPanier(etat, { type: "remiseLigne", index: 0, pourcentage: 150 });
    expect(etat.lignes[0].discount_percentage).toBe(100);
    etat = reducteurPanier(etat, { type: "remiseLigne", index: 0, pourcentage: -5 });
    expect(etat.lignes[0].discount_percentage).toBe(0);
  });

  it("retire du client ce qui n'a de sens qu'avec lui", () => {
    let etat = ajouter(PANIER_VIDE, detail, 0, 1);
    etat = reducteurPanier(etat, {
      type: "client",
      client: { id: "c1", name: "Kalume", allow_credit: true, credit_limit: "0", current_balance: "0" },
    });
    etat = reducteurPanier(etat, { type: "points", points: 500 });
    etat = reducteurPanier(etat, { type: "credit", actif: true, echeance: "2026-09-30" });
    expect(etat.points).toBe(500);

    // Retirer le client doit retirer les points et le crédit : les laisser
    // enverrait au serveur des points qui n'appartiennent à personne.
    etat = reducteurPanier(etat, { type: "client", client: null });
    expect(etat.points).toBe(0);
    expect(etat.aCredit).toBe(false);
    expect(etat.echeance).toBeNull();
  });

  it("oublie l'échéance quand la vente cesse d'être à crédit", () => {
    let etat = reducteurPanier(PANIER_VIDE, {
      type: "credit", actif: true, echeance: "2026-09-30",
    });
    etat = reducteurPanier(etat, { type: "credit", actif: false });
    expect(etat.echeance).toBeNull();
  });

  it("traite un produit à l'unité seule sans jamais compter de contenants", () => {
    const etat = ajouter(PANIER_VIDE, detail, 3, 2);
    expect(etat.lignes[0].packageQuantity).toBe(0);
    expect(etat.lignes[0].quantity).toBe(2);
  });

  it("vide tout, y compris le client et les règlements", () => {
    let etat = ajouter(PANIER_VIDE, detail, 0, 1);
    etat = reducteurPanier(etat, {
      type: "reglements",
      reglements: [{ cle: "r1", method: "m1", currency: "CDF", amount: "5000" }],
    });
    etat = reducteurPanier(etat, { type: "vider" });
    expect(etat).toEqual(PANIER_VIDE);
  });
});
