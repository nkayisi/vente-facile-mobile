/**
 * Mise en attente et reprise d'un panier.
 *
 * La reprise est le moment risqué : elle rejoue une intention rangée il y a
 * une heure contre un catalogue qui a bougé. Un défaut ici ne plante pas, il
 * vend au mauvais prix ou au-delà du stock, et personne ne le voit passer.
 */
import { PANIER_VIDE, reducteurPanier, type EtatPanier } from "./etat-panier";
import {
  analyser,
  etiquetteParDefaut,
  restaurerLignes,
  serialiser,
  type ContenuEnAttente,
} from "./attente-contenu";
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
  verrou_inventaire: null,
} satisfies ArticlePos;

const savon = {
  ...casier,
  id: "p2",
  name: "Savon",
  selling_mode: "retail_only",
  units_per_package: null,
  packaging_unit_name: null,
  wholesale_price: null,
  selling_price: "1500",
  stock_quantity: 10,
  stock_packages: null,
  stock_loose: 10,
} satisfies ArticlePos;

const carte = (...articles: ArticlePos[]) => new Map(articles.map((a) => [a.id, a]));

const ajouter = (etat: EtatPanier, article: ArticlePos, packages: number, loose: number) =>
  reducteurPanier(etat, {
    type: "ajouter",
    article,
    saisie: { packages, loose },
    prix: Number(article.selling_price),
  });

describe("Mise en attente", () => {
  it("range les deux compteurs saisis, jamais leur somme", () => {
    const contenu = serialiser(ajouter(PANIER_VIDE, casier, 2, 3));
    expect(contenu.lignes[0].packages).toBe(2);
    expect(contenu.lignes[0].loose).toBe(3);
    // Le total, lui, ne se range pas : il se refait au facteur du jour.
    expect(contenu.lignes[0]).not.toHaveProperty("quantity");
  });

  it("n'emporte ni règlements, ni points, ni décision de crédit", () => {
    let etat = ajouter(PANIER_VIDE, casier, 1, 0);
    etat = reducteurPanier(etat, { type: "points", points: 40 });
    etat = reducteurPanier(etat, { type: "credit", actif: true, echeance: "2026-09-30" });
    etat = reducteurPanier(etat, {
      type: "reglements",
      reglements: [{ cle: "a", method: "m1", currency: "CDF", amount: "5000" }],
    });

    const contenu = serialiser(etat) as ContenuEnAttente & Record<string, unknown>;
    expect(contenu.points).toBeUndefined();
    expect(contenu.reglements).toBeUndefined();
    expect(contenu.aCredit).toBeUndefined();
    expect(contenu.echeance).toBeUndefined();
  });

  it("ne garde du client que son identifiant", () => {
    const etat = reducteurPanier(ajouter(PANIER_VIDE, casier, 1, 0), {
      type: "client",
      client: {
        id: "c1", name: "Kalume", allow_credit: true,
        credit_limit: "0", current_balance: "120000",
      },
    });
    const contenu = serialiser(etat);
    expect(contenu.clientId).toBe("c1");
    expect(JSON.stringify(contenu)).not.toContain("120000");
  });

  it("relit ce qu'il a écrit", () => {
    const contenu = serialiser(ajouter(PANIER_VIDE, casier, 2, 3));
    expect(analyser(JSON.stringify(contenu))).toEqual(contenu);
  });

  it("rend null sur un contenu illisible plutôt que de lever", () => {
    expect(analyser("{pas du json")).toBeNull();
    expect(analyser(JSON.stringify({ version: 99, lignes: [] }))).toBeNull();
  });
});

describe("Reprise", () => {
  it("refait le total au facteur DU JOUR, pas à celui du rangement", () => {
    const contenu = serialiser(ajouter(PANIER_VIDE, casier, 2, 3));
    // Le casier est repassé de 12 à 6 bouteilles depuis la mise en attente.
    const requalifie = { ...casier, units_per_package: 6, stock_quantity: 60 };

    const { lignes } = restaurerLignes(contenu, carte(requalifie));
    expect(lignes[0].packageQuantity).toBe(2);
    expect(lignes[0].quantity).toBe(15);
  });

  it("garde le prix annoncé au client et signale l'écart", () => {
    const contenu = serialiser(ajouter(PANIER_VIDE, casier, 1, 0));
    const augmente = { ...casier, selling_price: "6000" };

    const { lignes, prixChanges } = restaurerLignes(contenu, carte(augmente));
    expect(lignes[0].unit_price).toBe(5000);
    expect(prixChanges).toEqual(["Primus 65cl"]);
  });

  it("écarte une ligne dont le stock est tombé, en le disant", () => {
    const contenu = serialiser(ajouter(PANIER_VIDE, savon, 0, 8));
    const epuise = { ...savon, stock_quantity: 2, stock_loose: 2 };

    const { lignes, ecartees } = restaurerLignes(contenu, carte(epuise));
    expect(lignes).toHaveLength(0);
    expect(ecartees[0]).toContain("Stock insuffisant");
    expect(ecartees[0]).toContain("Savon");
  });

  it("écarte un article sorti du catalogue sans perdre les autres", () => {
    let etat = ajouter(PANIER_VIDE, casier, 1, 0);
    etat = ajouter(etat, savon, 0, 2);

    const { lignes, ecartees } = restaurerLignes(serialiser(etat), carte(casier));
    expect(lignes).toHaveLength(1);
    expect(lignes[0].product.id).toBe("p1");
    expect(ecartees).toHaveLength(1);
  });

  it("mesure le stock contre les lignes DÉJÀ restaurées, pas contre un panier vide", () => {
    // Deux lignes du même article, chacune tenable seule, impossibles ensemble.
    const contenu: ContenuEnAttente = {
      version: 1,
      lignes: [
        { productId: "p2", packages: 0, loose: 7, unitPrice: 1500, discountPercentage: 0 },
        { productId: "p2", packages: 0, loose: 7, unitPrice: 1500, discountPercentage: 0 },
      ],
      remiseGlobale: 0,
      clientId: null,
      deviseFacture: null,
      deviseMonnaie: null,
    };

    const { lignes, ecartees } = restaurerLignes(contenu, carte(savon));
    expect(lignes).toHaveLength(1);
    expect(ecartees).toHaveLength(1);
  });

  it("conserve la remise de ligne", () => {
    // La remise se pose ICI directement : l'action `remiseLigne` a été retirée
    // faute d'appelant, mais le CHAMP reste - il voyage dans le corps de la
    // vente, et un panier rangé avant ce retrait peut encore en porter un.
    const base = ajouter(PANIER_VIDE, casier, 1, 0);
    const etat = {
      ...base,
      lignes: [{ ...base.lignes[0], discount_percentage: 10 }],
    };

    const { lignes } = restaurerLignes(serialiser(etat), carte(casier));
    expect(lignes[0].discount_percentage).toBe(10);
  });
});

describe("Étiquette", () => {
  it("prend le nom du client quand il y en a un", () => {
    const etat = reducteurPanier(PANIER_VIDE, {
      type: "client",
      client: {
        id: "c1", name: "Kalume", allow_credit: true,
        credit_limit: null, current_balance: null,
      },
    });
    expect(etiquetteParDefaut(etat)).toBe("Kalume");
  });

  it("se rabat sur l'heure, qui sépare deux paniers de la même matinée", () => {
    expect(etiquetteParDefaut(PANIER_VIDE, new Date(2026, 7, 29, 9, 5))).toBe(
      "Panier de 09:05"
    );
  });
});
