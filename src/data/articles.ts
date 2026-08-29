/**
 * Lectures du catalogue. Miroir de `frontend/actions/products.actions.ts`.
 *
 * La lisibilité gros/détail passe par `@vente-facile/core` et jamais par un
 * calcul local : `getPackaging` décide s'il y a un conditionnement,
 * `formatPackagedSplit` rend un partage DÉJÀ connu sans jamais le redécouper.
 * Redécouper au facteur du jour donnerait « 10 casiers » pour cinq casiers plus
 * cent vingt bouteilles, et le facteur a pu changer depuis.
 */
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { formatPackagedSplit, getPackaging, pluralizeUnit } from "@vente-facile/core";

import { db } from "@/db/client";
import { brands, categories, products, stocks, units } from "@/db/schema";

export interface ArticleListe {
  id: string;
  nom: string;
  sku: string | null;
  categorie: string | null;
  marque: string | null;
  actif: boolean;
  suitLeStock: boolean;
  /** « 3 casiers + 7 bouteilles », ou « 147 bouteilles », ou null si non suivi. */
  stockAffiche: string | null;
  prix: string | null;
}

export interface FiltresArticles {
  recherche?: string;
  limite?: number;
  offset?: number;
}

export async function listeArticles(
  f: FiltresArticles = {}
): Promise<{ elements: ArticleListe[]; total: number }> {
  const terme = (f.recherche ?? "").trim();
  const motif = `%${terme.toLowerCase()}%`;
  const filtre = terme
    ? or(
        like(sql`lower(${products.name})`, motif),
        like(sql`lower(${products.sku})`, motif),
        like(sql`lower(${products.barcode})`, motif)
      )
    : undefined;

  const [{ n: total } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(and(eq(products.isDeleted, false), filtre));

  const lignes = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      isActive: products.isActive,
      trackInventory: products.trackInventory,
      sellingPrice: products.sellingPrice,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      categorie: categories.name,
      marque: brands.name,
      unite: units.name,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(units, eq(units.id, products.unitId))
    .where(and(eq(products.isDeleted, false), filtre))
    .orderBy(products.name)
    .limit(f.limite ?? 50)
    .offset(f.offset ?? 0);

  // Les compteurs de stock, en une requête plutôt qu'une par article.
  const ids = lignes.map((l) => l.id);
  const compteurs = new Map<string, { paquets: number; vrac: number; total: number }>();
  if (ids.length > 0) {
    const s = await db
      .select({
        productId: stocks.productId,
        quantity: stocks.quantity,
        packageQuantity: stocks.packageQuantity,
        looseQuantity: stocks.looseQuantity,
      })
      .from(stocks);
    for (const r of s) {
      if (!ids.includes(r.productId)) continue;
      const c = compteurs.get(r.productId) ?? { paquets: 0, vrac: 0, total: 0 };
      c.paquets += Number(r.packageQuantity ?? 0);
      c.vrac += Number(r.looseQuantity ?? 0);
      c.total += Number(r.quantity ?? 0);
      compteurs.set(r.productId, c);
    }
  }

  const elements: ArticleListe[] = lignes.map((l) => {
    const conditionnement = getPackaging({
      selling_mode: l.sellingMode,
      units_per_package: l.unitsPerPackage,
      unit_name: l.unite,
    });
    const c = compteurs.get(l.id);

    let stockAffiche: string | null = null;
    if (!l.trackInventory) {
      // Le back-office écrit « - » pour un produit non suivi, et « Non suivi »
      // sur sa fiche. On ne dit JAMAIS « 0 » : ce serait affirmer une rupture.
      stockAffiche = null;
    } else if (!c) {
      stockAffiche = null;
    } else if (conditionnement) {
      stockAffiche = formatPackagedSplit(conditionnement, c.paquets, c.vrac);
    } else {
      stockAffiche = `${c.total} ${pluralizeUnit(l.unite ?? "unité", c.total)}`;
    }

    return {
      id: l.id,
      nom: l.name,
      sku: l.sku ?? null,
      categorie: l.categorie ?? null,
      marque: l.marque ?? null,
      actif: Boolean(l.isActive),
      suitLeStock: Boolean(l.trackInventory),
      stockAffiche,
      prix: l.sellingPrice ?? null,
    };
  });

  return { elements, total };
}

/** Compteurs des liens rapides de rubrique : Catégories, Marques, Unités. */
export async function compteursRubriques(): Promise<{
  categories: number;
  marques: number;
  unites: number;
}> {
  const un = async (t: typeof categories | typeof brands | typeof units) => {
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(t);
    return n;
  };
  return {
    categories: await un(categories),
    marques: await un(brands),
    unites: await un(units),
  };
}
