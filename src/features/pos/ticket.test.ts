/**
 * Le ticket du client.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER N'EXISTAIT PAS, ET C'EST POURQUOI LE DÉFAUT A TENU.          │
 * │                                                                          │
 * │ `donneesTicketVente` rangeait `totaux.total`, issu de `basketTotals`,    │
 * │ donc exprimé en devise PRINCIPALE - et l'étiquetait de la devise de      │
 * │ FACTURE. `totaux.totalFacture` était déclaré dans le contexte et jamais  │
 * │ lu. Sur un établissement tenu en dollars qui facture en francs, le       │
 * │ papier remis au client annonçait un montant deux mille huit cents fois   │
 * │ trop petit, sans erreur, sans journal, et sans que rien ne diffère tant  │
 * │ qu'on ne facture que dans sa devise principale - ce qui est le cas de    │
 * │ toutes les données de développement.                                     │
 * │                                                                          │
 * │ Le POS web y échappait parce qu'il attend le serveur et imprime le total │
 * │ qu'il lui rend. Le terminal doit imprimer HORS LIGNE : il totalise       │
 * │ lui-même, et c'est là que le raccourci a été pris.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { createCurrencyTable, saleCurrencyTotals } from "@vente-facile/core/pos";

import { donneesTicketVente, type ContexteTicket } from "./ticket";
import { PANIER_VIDE, reducteurPanier, type EtatPanier } from "./etat-panier";
import type { ArticlePos } from "./catalogue";

/**
 * Un établissement tenu en FRANCS, qui facture aussi en dollars.
 *
 * `exchange_rate` se lit « unités de la devise PRINCIPALE pour une unité de
 * celle-ci » : le dollar à 2 800 vaut 2 800 francs. Le prendre à l'envers rend
 * des montants qui ont l'air plausibles et un test qui passe pour la mauvaise
 * raison.
 */
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

/** Le contexte que l'écran d'encaissement construit, pour la devise demandée. */
function contexte(etat: EtatPanier, deviseFacture: string): ContexteTicket {
  const facture = saleCurrencyTotals({
    lines: etat.lignes,
    currencies: devises,
    invoiceCurrency: deviseFacture,
  });
  return {
    reference: "VT-20260904-Q5L8-0001",
    date: new Date("2026-09-04T10:00:00Z"),
    etat,
    totaux: { facture, remiseFidelite: 0, monnaie: 0 },
    deviseFacture,
    snapshot: null,
    aCredit: false,
    restantDu: 0,
  };
}

describe("Le ticket porte les montants de la devise qu'il annonce", () => {
  it("facture en dollars ce qui est tarifé en francs, sans laisser l'étiquette mentir", () => {
    // Deux savons à 28 000 FC : vingt dollars au taux de 2 800, et non
    // « 56 000 », qui est le montant en devise principale.
    const etat = ajouter(PANIER_VIDE, savon, 0, 2);
    const t = donneesTicketVente(contexte(etat, "USD"));

    expect(t.currency).toBe("USD");
    expect(t.total).toBe(20);
    expect(t.subtotal).toBe(20);
    // La ligne aussi : un ticket dont les lignes ne somment pas son total est
    // le premier chiffre qu'un client conteste.
    expect(t.items[0].total).toBe(20);
    expect(t.items[0].unitPrice).toBe(10);
  });

  it("laisse le montant intact quand la facture EST la devise principale", () => {
    // La non-régression qui compte : c'est la configuration de toutes les
    // données de développement, et de l'immense majorité des marchands.
    const etat = ajouter(PANIER_VIDE, savon, 0, 2);
    const t = donneesTicketVente(contexte(etat, "CDF"));

    expect(t.currency).toBe("CDF");
    expect(t.total).toBe(56000);
    expect(t.items[0].unitPrice).toBe(28000);
  });

  it("imprime le tarif du CONTENANT, pas le prix unitaire multiplié", () => {
    // Un casier à 18 $ quand la bouteille est à 2 $ : douze bouteilles achetées
    // au casier coûtent 18 et non 24. C'est tout l'intérêt commercial du gros,
    // et le client le lit sur son papier.
    const etat = ajouter(PANIER_VIDE, casier, 1, 3);
    const t = donneesTicketVente(contexte(etat, "USD"));

    expect(t.items[0].unitPrice).toBe(18);
    expect(t.items[0].total).toBe(24); // 18 + 3 x 2
    expect(t.items[0].quantityLabel).toBe("1 casier + 3 bouteilles");
  });

  it("somme ses lignes jusqu'à son propre total, dans les deux devises", () => {
    const etat = ajouter(ajouter(PANIER_VIDE, savon, 0, 2), casier, 1, 3);
    for (const devise of ["CDF", "USD"]) {
      const t = donneesTicketVente(contexte(etat, devise));
      const somme = t.items.reduce((s, i) => s + i.total, 0);
      expect(somme).toBe(t.subtotal);
      expect(t.total).toBe(t.subtotal);
    }
  });
});
