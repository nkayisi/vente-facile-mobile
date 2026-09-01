import { getPackaging } from "@vente-facile/core";

import {
  cumulerProduits,
  libelleQuantite,
  seVentile,
  vracDe,
  type LigneVendue,
} from "./produits";

const ligne = (p: Partial<LigneVendue> = {}): LigneVendue => ({
  produitId: "p1",
  nom: "Coca 50cl",
  sku: "COCA-50",
  quantite: 0,
  contenants: 0,
  facteurLigne: null,
  total: 0,
  tauxVente: 1,
  ...p,
});

describe("cumul des produits les plus vendus", () => {
  it("le vrac est le RESTE, jamais une division du total", () => {
    // Cinq casiers de 24 plus 120 bouteilles font 240 unités. Redécouper 240
    // au facteur rendrait « 10 casiers », ce qui est faux et a l'air exact.
    const [c] = cumulerProduits([
      ligne({ quantite: 120, contenants: 5, facteurLigne: 24 }),
      ligne({ quantite: 120, contenants: 0 }),
    ]);
    expect(c.quantite).toBe(240);
    expect(c.contenants).toBe(5);
    expect(vracDe(c)).toBe(120);
  });

  it("le facteur FIGÉ SUR LA LIGNE est celui qui compte", () => {
    // Le conditionnement du produit a changé entre les deux ventes : chaque
    // ligne garde le sien, sinon l'historique se réécrit à chaque changement.
    const [c] = cumulerProduits([
      ligne({ quantite: 24, contenants: 1, facteurLigne: 24 }),
      ligne({ quantite: 12, contenants: 1, facteurLigne: 12 }),
    ]);
    expect(c.unitesEnContenants).toBe(36);
    expect(vracDe(c)).toBe(0);
  });

  it("un vrac négatif est ramené à zéro", () => {
    // Un facteur mal renseigné écrirait sinon « 3 casiers + -5 bouteilles »
    // sur le tableau de bord d'un marchand.
    expect(vracDe({ quantite: 10, unitesEnContenants: 40 })).toBe(0);
  });

  it("la recette est RAMENÉE EN DEVISE PRINCIPALE, au taux de chaque vente", () => {
    // Additionner un total en francs et un total en dollars donne un nombre
    // qui n'existe pas : chaque ligne passe par le taux figé sur SA vente.
    // Principale USD, 1 CDF = 0,000357142857 USD (soit 1 USD = 2 800 CDF).
    const taux = 1 / 2800;
    const [c] = cumulerProduits([
      ligne({ quantite: 2, total: 5600, tauxVente: taux }),
      ligne({ quantite: 1, total: 3, tauxVente: 1 }),
      ligne({ quantite: 1, total: 2800, tauxVente: taux }),
    ]);
    expect(c.revenus).toBeCloseTo(6, 10);
  });

  it("le tri porte sur les QUANTITÉS, qui se comparent sans monnaie", () => {
    const r = cumulerProduits([
      ligne({ produitId: "a", nom: "A", quantite: 3, total: 90000, tauxVente: 1 / 2800 }),
      ligne({ produitId: "b", nom: "B", quantite: 40, total: 20, tauxVente: 1 }),
    ]);
    expect(r.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("à quantité égale, l'ordre reste stable par le nom", () => {
    // Un ordre qui dépendrait de l'ordre de lecture ferait sauter les lignes
    // d'une ouverture à l'autre, sur des chiffres identiques.
    const r = cumulerProduits([
      ligne({ produitId: "z", nom: "Zeta", quantite: 5 }),
      ligne({ produitId: "a", nom: "Alpha", quantite: 5 }),
    ]);
    expect(r.map((c) => c.nom)).toEqual(["Alpha", "Zeta"]);
  });

  it("un taux absent garde le montant facturé plutôt que de le perdre", () => {
    // Un taux nul multiplierait la recette par zéro : la ligne disparaîtrait
    // du total en silence, ce qui est pire qu'une conversion approximative.
    const [c] = cumulerProduits([ligne({ quantite: 1, total: 900, tauxVente: 0 })]);
    expect(c.revenus).toBe(900);
  });

  it("rien à cumuler ne rend rien", () => {
    expect(cumulerProduits([])).toEqual([]);
  });
});

describe("choix du rendu", () => {
  it("on ne ventile QUE si des contenants ont été facturés", () => {
    expect(seVentile({ contenants: 3 }, true)).toBe(true);
    // Aucun contenant vendu : le partage n'existe pas, on retombe sur le total.
    expect(seVentile({ contenants: 0 }, true)).toBe(false);
    // Produit vendu à l'unité seule : il n'y a rien à ventiler.
    expect(seVentile({ contenants: 3 }, false)).toBe(false);
  });
});

describe("libellé de la quantité vendue", () => {
  const gros = getPackaging({
    selling_mode: "wholesale",
    units_per_package: 20,
    unit_name: "AMPOULE",
    packaging_unit_name: "BOITE",
  });

  it("un produit SANS conditionnement garde le nom de son unité", () => {
    // `formatPackaged(null, 8)` du noyau rend « 8 » tout court : le nom de
    // l'unité est perdu EN SILENCE, alors que le back-office écrit
    // « 8 PLAQUETTES ». Relevé sur l'émulateur, le tableau de bord alignait
    // « 20 BOITES + 14 AMPOULES » et un « 8 » nu.
    expect(
      libelleQuantite(null, "PLAQUETTE", {
        quantite: 8,
        contenants: 0,
        unitesEnContenants: 0,
      })
    ).toBe("8 PLAQUETTES");
  });

  it("le singulier reste au singulier", () => {
    expect(
      libelleQuantite(null, "FLACON", { quantite: 1, contenants: 0, unitesEnContenants: 0 })
    ).toBe("1 FLACON");
  });

  it("une unité inconnue ne rend jamais un nombre nu", () => {
    expect(
      libelleQuantite(null, null, { quantite: 3, contenants: 0, unitesEnContenants: 0 })
    ).toBe("3 unités");
  });

  it("les décimales ne sont pas ARRONDIES, et la virgule est française", () => {
    // `formatNumber` du noyau rend « 9 » pour 8,5 : une quantité de vente en
    // porte trois, et un demi-flacon vendu ne peut pas devenir un flacon.
    expect(
      libelleQuantite(null, "FLACON", {
        quantite: 8.5,
        contenants: 0,
        unitesEnContenants: 0,
      })
    ).toBe("8,5 FLACONS");
  });

  it("le partage se lit par canal dès qu'un contenant a été facturé", () => {
    expect(
      libelleQuantite(gros, "AMPOULE", {
        quantite: 414,
        contenants: 20,
        unitesEnContenants: 400,
      })
    ).toBe("20 BOITES + 14 AMPOULES");
  });

  it("sans contenant facturé, on retombe sur le total du noyau", () => {
    // Aucun scellé vendu : le partage n'existe pas, et l'inventer serait la
    // division du total que ce module existe pour interdire.
    expect(
      libelleQuantite(gros, "AMPOULE", {
        quantite: 14,
        contenants: 0,
        unitesEnContenants: 0,
      })
    ).toBe("14 AMPOULES");
  });
});
