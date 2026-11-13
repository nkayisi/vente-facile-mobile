import {
  corpsDepuisLigne,
  corpsModificationArticle,
  decimaleLisible,
  valeursDepuisCorps,
  type LigneArticle,
  type SaisieModification,
} from "./edition-article";

const LIGNE: LigneArticle = {
  name: "Savon",
  sku: "SAV-1",
  barcode: "",
  categoryId: "cat-1",
  brandId: null,
  unitId: "u-piece",
  sellingMode: "wholesale_and_retail",
  sellingPrice: "1000.00",
  costPrice: "600.00",
  unitsPerPackage: 12,
  packagingUnitId: "u-carton",
  wholesalePrice: "11000.00",
  packageCostPrice: "7200.00",
  allowAutoUnpacking: false,
  isTaxable: false,
  taxRate: "16.00",
  trackInventory: true,
  reorderPoint: "0.000",
};

describe("decimaleLisible", () => {
  it("retire les zéros de queue sans toucher aux entiers", () => {
    expect(decimaleLisible("1000.00")).toBe("1000");
    expect(decimaleLisible("12.50")).toBe("12.5");
    expect(decimaleLisible("0.000")).toBe("0");
    expect(decimaleLisible("2500")).toBe("2500");
    expect(decimaleLisible(null)).toBe("");
  });
});

describe("la fiche locale devient les valeurs du formulaire", () => {
  it("garde les deux canaux et le conditionnement", () => {
    const v = valeursDepuisCorps(corpsDepuisLigne(LIGNE));
    expect(v).toMatchObject({
      nom: "Savon",
      mode: "wholesale_and_retail",
      prixVente: "1000",
      prixAchat: "600",
      parContenant: "12",
      uniteContenant: "u-carton",
      prixVenteGros: "11000",
      prixAchatGros: "7200",
      ouvertureAuto: false,
      categorie: "cat-1",
      marque: null,
    });
  });

  it("un seuil nul et un taux d'article non taxé se lisent comme des champs vides", () => {
    // ⚠ Un « 0 » pré-rempli se lirait « seuil réglé à zéro », pas « rien réglé ».
    const v = valeursDepuisCorps(corpsDepuisLigne(LIGNE));
    expect(v.seuil).toBe("");
    expect(v.tauxTva).toBe("");
  });

  it("une création en file, qui omet ce qui était vide, retombe sur des valeurs neutres", () => {
    const v = valeursDepuisCorps({ name: "Eau", sku: "EAU", selling_mode: "retail_only", selling_price: "500", cost_price: "300" });
    expect(v.codeBarres).toBe("");
    expect(v.categorie).toBeNull();
    expect(v.suitLeStock).toBe(true);
    expect(v.parContenant).toBe("");
  });
});

const SAISIE: SaisieModification = {
  nom: " Savon de Marseille ",
  sku: "SAV-1",
  codeBarres: "",
  categorie: null,
  marque: null,
  unite: "u-piece",
  mode: "retail_only",
  prixVente: 1200,
  prixAchat: 600,
  prixVenteGros: null,
  prixAchatGros: null,
  unitesParContenant: null,
  uniteContenant: null,
  ouvertureAutomatique: true,
  taxable: false,
  tauxTva: null,
  suitLeStock: true,
  seuilReassort: 2.5,
};

describe("le corps de product.update", () => {
  it("envoie les champs vidés : une clé absente voudrait dire « ne touche pas »", () => {
    const c = corpsModificationArticle(SAISIE);
    expect(c).toHaveProperty("barcode", "");
    expect(c).toHaveProperty("category", null);
    expect(c).toHaveProperty("brand", null);
  });

  it("les décimales voyagent en chaîne, et le nom est rogné", () => {
    const c = corpsModificationArticle(SAISIE);
    expect(c.name).toBe("Savon de Marseille");
    expect(c.selling_price).toBe("1200");
    expect(c.reorder_point).toBe("2.5");
  });

  it("n'envoie ni slug ni is_active, que ce formulaire ne règle pas", () => {
    const c = corpsModificationArticle(SAISIE) as unknown as Record<string, unknown>;
    expect(c).not.toHaveProperty("slug");
    expect(c).not.toHaveProperty("is_active");
  });

  it("le conditionnement ne part qu'en gros, et l'ouverture automatique qu'en gros et détail", () => {
    expect(corpsModificationArticle(SAISIE)).not.toHaveProperty("units_per_package");
    const gros = corpsModificationArticle({ ...SAISIE, mode: "wholesale_only", unitesParContenant: 12, uniteContenant: "u-carton", prixVenteGros: 11000 });
    expect(gros.units_per_package).toBe(12);
    expect(gros.wholesale_price).toBe("11000");
    expect(gros).not.toHaveProperty("allow_auto_unpacking");
    const mixte = corpsModificationArticle({ ...SAISIE, mode: "wholesale_and_retail", unitesParContenant: 12, ouvertureAutomatique: false });
    expect(mixte.allow_auto_unpacking).toBe(false);
  });

  it("un aller-retour corps → formulaire → corps ne perd rien", () => {
    const depart = corpsDepuisLigne({ ...LIGNE, sellingMode: "retail_only", unitsPerPackage: null, packagingUnitId: null, wholesalePrice: null, packageCostPrice: null });
    const v = valeursDepuisCorps(depart);
    const retour = corpsModificationArticle({
      nom: v.nom, sku: v.sku, codeBarres: v.codeBarres, categorie: v.categorie, marque: v.marque,
      unite: v.unite, mode: v.mode, prixVente: Number(v.prixVente), prixAchat: Number(v.prixAchat),
      prixVenteGros: null, prixAchatGros: null, unitesParContenant: null, uniteContenant: null,
      ouvertureAutomatique: v.ouvertureAuto, taxable: v.taxable, tauxTva: null,
      suitLeStock: v.suitLeStock, seuilReassort: null,
    });
    expect(retour.name).toBe(depart.name);
    expect(retour.category).toBe(depart.category);
    expect(Number(retour.selling_price)).toBe(Number(depart.selling_price));
  });
});
