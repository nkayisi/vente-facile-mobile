/**
 * Lectures du stock.
 *
 * Miroir de `frontend/actions/stock.actions.ts` et `inventory.actions.ts`.
 *
 * **Les décimales voyagent en chaîne** (`quantity`, `avg_cost` sont des `text`
 * en base) : on ne les convertit en nombre qu'au moment d'un calcul, jamais
 * pour les transporter. Un panier en CDF à sept chiffres perd ses unités en
 * virgule flottante.
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { products, stockLocations, stocks, warehouses } from "@/db/schema";

const nb = (v: string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface RelevesStock {
  entrepots: number;
  produitsEnStock: number;
  unitesAuTotal: number;
  stockBas: number;
  enRupture: number;
  valeurTotale: number;
}

/**
 * Les six relevés du bandeau, dans l'ordre EXACT du back-office.
 *
 * La valorisation applique la règle unique du serveur : `avg_cost`, et à défaut
 * `product.cost_price`. Le back-office a longtemps eu deux formules, une par
 * écran, et le même stock ressortait à deux valeurs.
 */
export async function relevesStock(): Promise<RelevesStock> {
  const lignes = await db
    .select({
      productId: stocks.productId,
      quantity: stocks.quantity,
      avgCost: stocks.avgCost,
      costPrice: products.costPrice,
      reorderPoint: products.reorderPoint,
      trackInventory: products.trackInventory,
    })
    .from(stocks)
    .leftJoin(products, eq(products.id, stocks.productId));

  const [{ n: entrepots } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(warehouses);

  const produits = new Set<string>();
  let unites = 0;
  let bas = 0;
  let rupture = 0;
  let valeur = 0;

  for (const l of lignes) {
    produits.add(l.productId);
    const q = nb(l.quantity);
    unites += q;
    // « avg_cost, sinon cost_price » : la règle vit ici et nulle part ailleurs.
    valeur += q * (nb(l.avgCost) || nb(l.costPrice));
    if (q <= 0) rupture += 1;
    // Le critere du serveur est `quantity <= product.reorder_point` ET
    // `track_inventory`, SANS exclure le zero (`inventory/views.py::low_stock`).
    // Un produit epuise compte donc dans les DEUX releves. Ecrire `else if`
    // ici faisait sortir « Stock bas 0 » la ou le back-office affiche 1.
    if (l.trackInventory && l.reorderPoint != null && q <= l.reorderPoint) bas += 1;
  }

  return {
    entrepots,
    produitsEnStock: produits.size,
    unitesAuTotal: unites,
    stockBas: bas,
    enRupture: rupture,
    valeurTotale: valeur,
  };
}

export interface EntrepotResume {
  id: string;
  nom: string;
  code: string;
  adresse: string | null;
  parDefaut: boolean;
  actif: boolean;
  valeurStock: number;
  /**
   * Le dépôt tolère un solde négatif.
   *
   * C'est LUI qui décide, jamais le produit : le serveur tranche au niveau de
   * l'entrepôt partout en aval (`assert_sealed_available`, `Stock.save`), et
   * lire le champ du produit était un bug corrigé au lot 4. Quand il est vrai,
   * aucun avertissement de disponible n'a lieu d'être : le serveur n'oppose
   * alors rien à l'expédition.
   */
  stockNegatifAutorise: boolean;
}

/** Entrepôts, avec la valeur du stock qu'ils portent. */
export async function entrepots(): Promise<EntrepotResume[]> {
  const liste = await db.select().from(warehouses);
  const lignes = await db
    .select({
      warehouseId: stocks.warehouseId,
      quantity: stocks.quantity,
      avgCost: stocks.avgCost,
      costPrice: products.costPrice,
    })
    .from(stocks)
    .leftJoin(products, eq(products.id, stocks.productId));

  const valeurs = new Map<string, number>();
  for (const l of lignes) {
    const v = nb(l.quantity) * (nb(l.avgCost) || nb(l.costPrice));
    valeurs.set(l.warehouseId, (valeurs.get(l.warehouseId) ?? 0) + v);
  }

  return liste.map((w) => ({
    id: w.id,
    nom: w.name,
    code: w.code,
    adresse: w.address?.trim() || null,
    parDefaut: Boolean(w.isDefault),
    actif: Boolean(w.isActive),
    valeurStock: valeurs.get(w.id) ?? 0,
    stockNegatifAutorise: Boolean(w.allowNegativeStock),
  }));
}

// --------------------------------------------------------------- lot 7

export interface DetailEntrepot extends EntrepotResume {
  /** L'entrepôt ne porte ni ville, ni téléphone, ni nom de responsable au
   *  manifeste : seul `manager_id` existe, et `users` n'est pas tiré. On ne
   *  fabrique donc pas ces champs - on les tait, ce qui est la seule chose
   *  honnête à faire d'une donnée qu'on n'a pas. Ils reviendront au lot 10,
   *  avec les utilisateurs. */
  responsableId: string | null;
  /** Nombre de lignes de stock, produits distincts. */
  produits: number;
  unitesAuTotal: number;
  stockBas: number;
  enRupture: number;
}

/**
 * Fiche d'un entrepôt. Miroir de `stock/warehouses/[id]/page.tsx`.
 *
 * `unitesAuTotal` additionne des unités de PRODUITS DIFFÉRENTS : le libellé
 * doit le dire, faute de quoi on lit un nombre de contenants. C'est la
 * correction que le back-office a dû appliquer à sa carte « Unités au total ».
 */
export async function detailEntrepot(id: string): Promise<DetailEntrepot | null> {
  const [w] = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
  if (!w) return null;

  const lignes = await db
    .select({
      quantity: stocks.quantity,
      avgCost: stocks.avgCost,
      costPrice: products.costPrice,
      reorderPoint: products.reorderPoint,
    })
    .from(stocks)
    .leftJoin(products, eq(products.id, stocks.productId))
    .where(eq(stocks.warehouseId, id));

  let valeur = 0;
  let unites = 0;
  let bas = 0;
  let rupture = 0;
  for (const l of lignes) {
    const q = nb(l.quantity);
    const seuil = Number(l.reorderPoint ?? 0);
    unites += q;
    valeur += q * (nb(l.avgCost) || nb(l.costPrice));
    if (q <= 0) rupture += 1;
    else if (seuil > 0 && q <= seuil) bas += 1;
  }

  return {
    id: w.id,
    nom: w.name,
    code: w.code,
    adresse: w.address?.trim() || null,
    responsableId: w.managerId ?? null,
    parDefaut: Boolean(w.isDefault),
    actif: Boolean(w.isActive),
    stockNegatifAutorise: Boolean(w.allowNegativeStock),
    valeurStock: valeur,
    produits: lignes.length,
    unitesAuTotal: unites,
    stockBas: bas,
    enRupture: rupture,
  };
}

export interface EmplacementStock {
  id: string;
  nom: string;
  code: string;
}

/**
 * Les emplacements ACTIFS d'un entrepôt. Miroir de
 * `GET /stock-locations/by-warehouse/{id}/`.
 *
 * `stock_locations` descend au tirage avec `warehouse_path='warehouse_id'` : le
 * terminal n'a que celles de ses entrepôts, exactement le périmètre que le
 * serveur autoriserait. Sans entrepôt, aucune liste : proposer les emplacements
 * d'un dépôt qu'on n'a pas choisi ferait ranger une réception au mauvais rayon.
 */
export async function emplacementsDeLEntrepot(
  entrepot: string | null
): Promise<EmplacementStock[]> {
  if (!entrepot) return [];
  const lignes = await db
    .select({
      id: stockLocations.id,
      nom: stockLocations.name,
      code: stockLocations.code,
    })
    .from(stockLocations)
    .where(and(eq(stockLocations.warehouseId, entrepot), eq(stockLocations.isActive, true)))
    .orderBy(stockLocations.name);
  return lignes.map((l) => ({ id: l.id, nom: l.nom, code: l.code }));
}
