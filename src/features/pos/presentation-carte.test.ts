import type { ArticlePos } from "./catalogue";
import { etatDeLaCarte, libelleDuBandeau, lieuDeLArticle } from "./presentation-carte";

function article(p: Partial<ArticlePos> = {}): ArticlePos {
  return {
    id: "a",
    name: "Savon",
    sku: null,
    barcode: null,
    image: null,
    categoryId: null,
    categoryName: null,
    selling_price: "10.00",
    wholesale_price: null,
    is_taxable: false,
    tax_rate: null,
    selling_mode: "retail_only",
    units_per_package: null,
    unit_name: "PIECE",
    unit_symbol: "pce",
    packaging_unit_name: null,
    allow_auto_unpacking: false,
    track_inventory: true,
    reorder_point: "3.000",
    stock_quantity: 20,
    stock_packages: null,
    stock_loose: 20,
    reserved_quantity: 0,
    verrou_inventaire: null,
    ailleurs: null,
    ...p,
  };
}

const casier = {
  selling_mode: "wholesale_and_retail",
  units_per_package: 24,
  unit_name: "BOUTEILLE",
  unit_symbol: "btl",
  packaging_unit_name: "CASIER",
  packaging_unit_symbol: "csr",
};

describe("l'état de la carte", () => {
  it("est vert au-dessus du seuil, ambre à partir du seuil, rouge à zéro", () => {
    expect(etatDeLaCarte(article({ stock_quantity: 4 }))).toBe("ok");
    expect(etatDeLaCarte(article({ stock_quantity: 3 }))).toBe("bas");
    expect(etatDeLaCarte(article({ stock_quantity: 0 }))).toBe("epuise");
  });

  it("tient compte de ce qui est déjà au panier", () => {
    expect(etatDeLaCarte(article({ stock_quantity: 4 }), 1)).toBe("bas");
    expect(etatDeLaCarte(article({ stock_quantity: 4 }), 4)).toBe("epuise");
    // Sans quantisation, 0,3 - 0,1 - 0,2 laisserait un reste de 2,7e-17.
    expect(etatDeLaCarte(article({ stock_quantity: 0.3 }), 0.1 + 0.2)).toBe("epuise");
  });

  it("retombe sur le seuil du back-office quand aucun n'est réglé", () => {
    expect(etatDeLaCarte(article({ reorder_point: "0.000", stock_quantity: 5 }))).toBe("bas");
    expect(etatDeLaCarte(article({ reorder_point: null, stock_quantity: 6 }))).toBe("ok");
  });

  it("distingue l'absence de ligne de stock d'un zéro enregistré", () => {
    expect(etatDeLaCarte(article({ stock_quantity: null }))).toBe("aucun");
  });

  it("fait passer le verrou d'inventaire avant tout le reste", () => {
    expect(etatDeLaCarte(article({ verrou_inventaire: "INV-1", stock_quantity: 50 }))).toBe("verrouille");
    expect(etatDeLaCarte(article({ verrou_inventaire: "INV-1", track_inventory: false }))).toBe("verrouille");
  });

  it("ne juge pas le stock d'un article non suivi", () => {
    expect(etatDeLaCarte(article({ track_inventory: false, stock_quantity: 0 }))).toBe("non_suivi");
  });
});

describe("le libellé du bandeau", () => {
  it("ne lit jamais une absence comme « Épuisé »", () => {
    expect(libelleDuBandeau(article({ stock_quantity: null }))).toBe("Aucun stock");
    expect(libelleDuBandeau(article({ stock_quantity: 0 }))).toBe("Épuisé");
    expect(libelleDuBandeau(article({ track_inventory: false }))).toBe("Non suivi");
  });

  it("garde le partage scellé / détail, sans le recalculer", () => {
    const a = article({ ...casier, stock_quantity: 79, stock_packages: 3, stock_loose: 7 });
    expect(libelleDuBandeau(a)).toBe("3 CASIERS + 7 BOUTEILLES");
    // Le partage réel, même quand le vrac dépasse le facteur.
    const b = article({ ...casier, stock_quantity: 102, stock_packages: 3, stock_loose: 30 });
    expect(libelleDuBandeau(b)).toBe("3 CASIERS + 30 BOUTEILLES");
  });

  it("écrit les symboles sur la vignette étroite", () => {
    const a = article({ ...casier, stock_quantity: 79, stock_packages: 3, stock_loose: 7 });
    expect(libelleDuBandeau(a, true)).toBe("3 csr + 7 btl");
  });

  it("n'écrit pas un symbole qui n'est que le nom recopié ou tronqué", () => {
    // Relevé en base : BOITE / BOITE, PLAQUETTE / PLAQUETT.
    const boite = article({ unit_name: "BOITE", unit_symbol: "BOITE", stock_quantity: 6, stock_loose: 6 });
    expect(libelleDuBandeau(boite, true)).toBe("6 BOITES");
    const plaquette = article({ unit_name: "PLAQUETTE", unit_symbol: "PLAQUETT", stock_quantity: 1, stock_loose: 1 });
    expect(libelleDuBandeau(plaquette, true)).toBe("1 PLAQUETTE");
    const kilo = article({ unit_name: "Kilo grame", unit_symbol: "kg", stock_quantity: 2.5, stock_loose: 2.5 });
    expect(libelleDuBandeau(kilo, true)).toBe("2,5 kg");
  });

  it("retombe sur le nom quand l'unité n'a pas de symbole", () => {
    const a = article({ unit_symbol: null, stock_quantity: 2, stock_loose: 2 });
    expect(libelleDuBandeau(a, true)).toBe("2 PIECES");
  });

  it("écrit une demi-unité à la française", () => {
    expect(libelleDuBandeau(article({ stock_quantity: 0.5, stock_loose: 0.5 }), true)).toBe("0,5 pce");
  });
});

describe("le lieu de l'article", () => {
  it("nomme l'emplacement puis l'entrepôt", () => {
    expect(lieuDeLArticle(article({ emplacement: "Rayon A,Rayon B" }), "Boutique")).toBe(
      "Rayon A · Rayon B · Boutique"
    );
    expect(lieuDeLArticle(article(), "Boutique")).toBe("Boutique");
  });

  it("ne nomme pas un entrepôt où l'article n'a aucune ligne", () => {
    expect(lieuDeLArticle(article({ stock_quantity: null }), "Boutique")).toBe("-");
  });
});
