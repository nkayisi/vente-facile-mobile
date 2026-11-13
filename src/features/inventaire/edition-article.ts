/**
 * Modifier un article depuis le terminal (lot L12) : les conversions, PURES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL FORMAT PIVOT : LE CORPS DU SERIALIZER.                           │
 * │                                                                          │
 * │ Le formulaire peut partir de trois sources : la fiche descendue du       │
 * │ serveur, la CRÉATION encore en file (l'article n'existe que dans le      │
 * │ journal), ou la dernière MODIFICATION encore en file. Les trois se       │
 * │ ramènent au corps de `ProductUpdateSerializer`, et le formulaire ne lit  │
 * │ que ce corps. Écrire trois chemins de pré-remplissage serait écrire      │
 * │ trois occasions de diverger - et la seconde correction d'une faute de    │
 * │ frappe repartirait de la valeur d'avant la première.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LES DÉCIMALES VOYAGENT EN CHAÎNE, et le corps aussi : c'est le format du
 *   journal. Seul l'affichage dans un champ retire les zéros de queue
 *   (« 1000.00 » se lit « 1000 »).
 */

export type ModeVente = "retail_only" | "wholesale_only" | "wholesale_and_retail";

/** Le corps envoyé par `product.update`, au format exact du serializer. */
export interface CorpsArticle {
  name: string;
  sku: string;
  barcode: string;
  category: string | null;
  brand: string | null;
  unit: string | null;
  selling_mode: ModeVente;
  selling_price: string;
  cost_price: string;
  units_per_package?: number | null;
  packaging_unit?: string | null;
  wholesale_price?: string | null;
  package_cost_price?: string | null;
  allow_auto_unpacking?: boolean;
  is_taxable: boolean;
  tax_rate: string;
  track_inventory: boolean;
  reorder_point: string;
}

/** Ce que la base locale porte d'un article, colonnes brutes. */
export interface LigneArticle {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string | null;
  brandId: string | null;
  unitId: string | null;
  sellingMode: string;
  sellingPrice: string;
  costPrice: string;
  unitsPerPackage: number | null;
  packagingUnitId: string | null;
  wholesalePrice: string | null;
  packageCostPrice: string | null;
  allowAutoUnpacking: boolean;
  isTaxable: boolean;
  taxRate: string;
  trackInventory: boolean;
  reorderPoint: string;
}

/** Les valeurs d'un formulaire d'article : du texte saisi, et quatre bascules. */
export interface ValeursArticle {
  nom: string;
  sku: string;
  codeBarres: string;
  categorie: string | null;
  marque: string | null;
  unite: string | null;
  mode: ModeVente;
  prixAchat: string;
  prixVente: string;
  parContenant: string;
  uniteContenant: string | null;
  prixAchatGros: string;
  prixVenteGros: string;
  ouvertureAuto: boolean;
  taxable: boolean;
  tauxTva: string;
  suitLeStock: boolean;
  seuil: string;
}

const MODES: readonly ModeVente[] = ["retail_only", "wholesale_only", "wholesale_and_retail"];

/** « 1000.00 » → « 1000 », « 12.50 » → « 12.5 », « 0.000 » → « 0 ». */
export function decimaleLisible(brut: string | null | undefined): string {
  if (brut == null || brut === "") return "";
  const s = String(brut).trim();
  if (!s.includes(".")) return s;
  const sansQueue = s.replace(/0+$/, "").replace(/\.$/, "");
  return sansQueue === "" || sansQueue === "-" ? "0" : sansQueue;
}

/** Une décimale nulle se lit comme un champ VIDE (seuil, taux) : rien n'est réglé. */
function videSiNul(brut: string | null | undefined): string {
  const lisible = decimaleLisible(brut);
  return lisible === "" || Number(lisible) === 0 ? "" : lisible;
}

/** La fiche locale, ramenée au corps du serializer. */
export function corpsDepuisLigne(l: LigneArticle): CorpsArticle {
  const mode = (MODES as readonly string[]).includes(l.sellingMode)
    ? (l.sellingMode as ModeVente)
    : "retail_only";
  return {
    name: l.name,
    sku: l.sku,
    barcode: l.barcode ?? "",
    category: l.categoryId,
    brand: l.brandId,
    unit: l.unitId,
    selling_mode: mode,
    selling_price: l.sellingPrice,
    cost_price: l.costPrice,
    units_per_package: l.unitsPerPackage,
    packaging_unit: l.packagingUnitId,
    wholesale_price: l.wholesalePrice,
    package_cost_price: l.packageCostPrice,
    allow_auto_unpacking: l.allowAutoUnpacking,
    is_taxable: l.isTaxable,
    tax_rate: l.taxRate,
    track_inventory: l.trackInventory,
    reorder_point: l.reorderPoint,
  };
}

/**
 * Un corps (de la fiche, d'une création ou d'une modification en file) devenu
 * les valeurs du formulaire.
 *
 * ⚠ Une CRÉATION en file n'envoie que ce qui était renseigné : les clés
 *   absentes y valent « rien », jamais « inchangé ». D'où les replis.
 */
export function valeursDepuisCorps(c: Partial<CorpsArticle>): ValeursArticle {
  const mode = (MODES as readonly string[]).includes(c.selling_mode ?? "")
    ? (c.selling_mode as ModeVente)
    : "retail_only";
  return {
    nom: c.name ?? "",
    sku: c.sku ?? "",
    codeBarres: c.barcode ?? "",
    categorie: c.category ?? null,
    marque: c.brand ?? null,
    unite: c.unit ?? null,
    mode,
    prixAchat: decimaleLisible(c.cost_price),
    prixVente: decimaleLisible(c.selling_price),
    parContenant: c.units_per_package ? String(c.units_per_package) : "",
    uniteContenant: c.packaging_unit ?? null,
    prixAchatGros: decimaleLisible(c.package_cost_price),
    prixVenteGros: decimaleLisible(c.wholesale_price),
    ouvertureAuto: c.allow_auto_unpacking ?? true,
    taxable: c.is_taxable ?? false,
    tauxTva: c.is_taxable ? videSiNul(c.tax_rate) : "",
    suitLeStock: c.track_inventory ?? true,
    seuil: videSiNul(c.reorder_point),
  };
}

/** Ce que le formulaire a lu, une fois les champs numériques interprétés. */
export interface SaisieModification {
  nom: string;
  sku: string;
  codeBarres: string;
  categorie: string | null;
  marque: string | null;
  unite: string | null;
  mode: ModeVente;
  prixVente: number;
  prixAchat: number;
  prixVenteGros: number | null;
  prixAchatGros: number | null;
  unitesParContenant: number | null;
  uniteContenant: string | null;
  ouvertureAutomatique: boolean;
  taxable: boolean;
  tauxTva: number | null;
  suitLeStock: boolean;
  seuilReassort: number | null;
}

/**
 * Le corps de `product.update`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EN MODIFICATION, UNE CLÉ ABSENTE VEUT DIRE « NE TOUCHE PAS ».            │
 * │                                                                          │
 * │ Le serveur rejoue avec `partial=True`. La création pouvait omettre un    │
 * │ code-barres ou une catégorie vides ; ici, les omettre rendrait           │
 * │ IMPOSSIBLE de les effacer : le marchand vide le champ, enregistre, et    │
 * │ la fiche garde l'ancienne valeur. Tout ce que le formulaire montre part  │
 * │ donc, `null` et chaîne vide compris.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sans `slug` ni `is_active` : le premier n'est dérivé qu'à la création (le
 * back-office fait de même), le second ne se règle pas depuis ce formulaire.
 */
export function corpsModificationArticle(s: SaisieModification): CorpsArticle {
  const conditionne = s.mode !== "retail_only";
  return {
    name: s.nom.trim(),
    sku: s.sku.trim(),
    barcode: s.codeBarres.trim(),
    category: s.categorie,
    brand: s.marque,
    unit: s.unite,
    selling_mode: s.mode,
    selling_price: String(s.prixVente),
    cost_price: String(s.prixAchat),
    ...(conditionne
      ? {
          units_per_package: s.unitesParContenant,
          packaging_unit: s.uniteContenant,
          wholesale_price: s.prixVenteGros != null ? String(s.prixVenteGros) : null,
          package_cost_price: s.prixAchatGros != null ? String(s.prixAchatGros) : null,
          ...(s.mode === "wholesale_and_retail"
            ? { allow_auto_unpacking: s.ouvertureAutomatique }
            : {}),
        }
      : {}),
    is_taxable: s.taxable,
    tax_rate: String(s.taxable ? (s.tauxTva ?? 0) : 0),
    track_inventory: s.suitLeStock,
    reorder_point: String(s.seuilReassort ?? 0),
  };
}
