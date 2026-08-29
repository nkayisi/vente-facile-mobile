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
import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { products, stocks, warehouses } from "@/db/schema";

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
  }));
}
