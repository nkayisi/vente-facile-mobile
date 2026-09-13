/**
 * La proforma : un devis, pas un reçu.
 *
 * Ce qui compte ici tient en deux points, et les deux se voient sur le papier
 * du client : le total est BRUT (une proforma ne réserve aucun point), et
 * aucun règlement n'y figure (rien n'a été encaissé).
 */
import { createCurrencyTable, saleCurrencyTotals } from "@vente-facile/core/pos";

import { donneesProforma } from "./proforma";
import { PANIER_VIDE, reducteurPanier, type EtatPanier } from "./etat-panier";
import type { ArticlePos } from "./catalogue";

const devises = createCurrencyTable(
  [
    { currency_code: "CDF", exchange_rate: "1", currency_decimal_places: 0, is_primary: true },
    { currency_code: "USD", exchange_rate: "2800", currency_decimal_places: 2 },
  ],
  { code: "CDF", decimal_places: 2 }
);

const savon = {
  id: "p1",
  name: "Savon",
  sku: null, barcode: null, image: null, categoryId: null, categoryName: null,
  selling_price: "28000",
  wholesale_price: null,
  is_taxable: false,
  tax_rate: "0",
  selling_mode: "retail_only",
  units_per_package: null,
  unit_name: "pièce",
  packaging_unit_name: null,
  allow_auto_unpacking: false,
  track_inventory: true,
  allow_negative_stock: false,
  stock_quantity: 100,
  stock_packages: null,
  stock_loose: 100,
  reserved_quantity: 0,
  verrou_inventaire: null,
} satisfies ArticlePos;

const casier = {
  ...savon,
  id: "p2",
  name: "Primus 65cl",
  selling_price: "5600",
  wholesale_price: "50400",
  selling_mode: "wholesale_and_retail",
  units_per_package: 12,
  unit_name: "bouteille",
  packaging_unit_name: "casier",
  allow_auto_unpacking: true,
  stock_packages: 8,
  stock_loose: 12,
} satisfies ArticlePos;

const ajouter = (etat: EtatPanier, article: ArticlePos, packages: number, loose: number) =>
  reducteurPanier(etat, {
    type: "ajouter",
    article,
    saisie: { packages, loose },
    prix: Number(article.selling_price),
  });

/** La ventilation BRUTE que l'écran doit passer : points non déduits. */
const brute = (etat: EtatPanier, devise = "CDF") =>
  saleCurrencyTotals({
    lines: etat.lignes,
    currencies: devises,
    invoiceCurrency: devise,
    loyaltyDiscount: 0,
  });

const proforma = (etat: EtatPanier, devise = "CDF") =>
  donneesProforma({
    reference: "PRO-20260911-Q5L8-0001",
    date: new Date("2026-09-11T10:00:00Z"),
    etat,
    factureBrute: brute(etat, devise),
    snapshot: null,
  });

describe("Facture proforma", () => {
  it("porte le genre qui supprime les blocs de règlement", () => {
    const doc = proforma(ajouter(PANIER_VIDE, savon, 0, 2));
    expect(doc.kind).toBe("proforma");
    expect(doc.payments).toEqual([]);
    expect(doc.changeAmount).toBeUndefined();
    expect(doc.amountDue).toBeUndefined();
    expect(doc.loyalty).toBeUndefined();
  });

  it("chiffre le total BRUT, points NON déduits", () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE CAS QUI COMPTE.                                                 │
    // │                                                                    │
    // │ Prendre la ventilation NETTE annoncerait une remise que les lignes │
    // │ ne montrent pas : un devis qui ne s'additionne pas, sous les yeux   │
    // │ d'un client qui vérifie. Et la proforma ne réserve aucun point.     │
    // └────────────────────────────────────────────────────────────────────┘
    const etat = { ...ajouter(PANIER_VIDE, savon, 0, 2), points: 5000 };
    const net = saleCurrencyTotals({
      lines: etat.lignes,
      currencies: devises,
      invoiceCurrency: "CDF",
      loyaltyDiscount: 5000,
    });
    const doc = proforma(etat);

    expect(doc.total).toBe(56000);
    expect(doc.total).toBeGreaterThan(net.total);
    expect(doc.loyaltyRedemptionAmount).toBeUndefined();
  });

  it("somme ses propres lignes", () => {
    // Un devis dont le total ne vaut pas la somme des lignes est un devis que
    // le client refuse au comptoir.
    const etat = ajouter(ajouter(PANIER_VIDE, savon, 0, 3), casier, 2, 0);
    const doc = proforma(etat);
    const somme = doc.items.reduce((t, i) => t + i.total, 0);
    expect(doc.subtotal).toBeCloseTo(somme, 2);
  });

  it("nomme les contenants, jamais un total redécoupé", () => {
    const doc = proforma(ajouter(PANIER_VIDE, casier, 2, 3));
    expect(doc.items[0].quantityLabel).toBe("2 casiers + 3 bouteilles");
    // Le prix lu sous le nom est celui du CONTENANT : c'est ce qu'on achète.
    expect(doc.items[0].unitPrice).toBe(50400);
  });

  it("facture dans la devise demandée, jamais en principale", () => {
    const doc = proforma(ajouter(PANIER_VIDE, savon, 0, 1), "USD");
    expect(doc.currency).toBe("USD");
    expect(doc.total).toBeCloseTo(10, 2); // 28 000 FC / 2 800
  });

  it("porte un numéro préfixé PRO, celui que le document attend", () => {
    // `DOCUMENT_IDENTITIES.proforma` déclare le préfixe « PRO » : un devis se
    // distingue d'une vente par son numéro autant que par son bandeau. Le
    // préfixe lui-même vit dans `numerotation.ts`, qui ouvre SQLite au
    // chargement et ne peut donc pas être importé par un module pur.
    const doc = proforma(ajouter(PANIER_VIDE, savon, 0, 1));
    expect(doc.number.startsWith("PRO-")).toBe(true);
  });
});
