/**
 * Met une vraie vente en file, depuis les données locales.
 *
 * TEMPORAIRE, et visible seulement en développement. Sert à éprouver la boucle
 * complète (mise en file, envoi, verdict, relecture) avant que le point de
 * vente n'existe. Disparaît au lot 4, avec l'écran qui l'appelle.
 */
import * as Crypto from "expo-crypto";
import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { paymentMethods, products, registers, stocks, warehouses } from "@/db/schema";
import { enqueue } from "@/sync";

export async function creerVenteDeTest(): Promise<string> {
  const [caisse] = await db.select().from(registers).limit(1);
  const [entrepot] = await db.select().from(warehouses).limit(1);
  const [moyen] = await db.select().from(paymentMethods).limit(1);

  // Un produit RÉELLEMENT en stock. La quantité est rangée en chaîne (« 12.000 »)
  // et se compare donc en texte : « 0.000 » > « 12.000 » lexicographiquement.
  // On la convertit pour la comparer, sans quoi on retombe sur un article à
  // zéro, refusé par le serveur pour stock insuffisant.
  const [ligne] = await db
    .select({ produit: products, stock: stocks })
    .from(stocks)
    .innerJoin(products, eq(products.id, stocks.productId))
    .where(
      and(
        gt(sql`CAST(${stocks.quantity} AS REAL)`, 0),
        eq(products.isActive, true)
      )
    )
    .limit(1);

  if (!caisse || !entrepot || !moyen || !ligne) {
    return "Aucun article en stock : synchronisez, ou approvisionnez d'abord.";
  }

  const prix = ligne.produit.sellingPrice ?? "0";
  const id = Crypto.randomUUID();

  await enqueue(id, "sale.create", {
    id,
    // Référence suffixée par le terminal : définitive dès l'impression, et sans
    // collision possible avec la série du serveur.
    reference: `VT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-TEST-${id.slice(0, 4)}`,
    register: caisse.id,
    warehouse: entrepot.id,
    sale_type: "retail",
    is_pos: false,
    items: [{ product: ligne.produit.id, quantity: "1", unit_price: prix }],
    payments: [{ payment_method: moyen.id, tendered_amount: prix }],
  });

  return `En file : 1 × ${ligne.produit.name} à ${prix}.`;
}
