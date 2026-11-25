/**
 * La photo d'un article, telle qu'un écran doit l'afficher.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE PHOTO PRISE SUR LE TERMINAL S'AFFICHE AUSSITÔT.                     │
 * │                                                                          │
 * │ Elle part au serveur plus tard, une fois l'article connu de lui          │
 * │ (`features/inventaire/photos.ts`) ; d'ici là elle vit dans                │
 * │ `pending_product_photos`, et aucune liste ne la lisait : le marchand qui │
 * │ venait de photographier un article ne la voyait nulle part, surtout pas  │
 * │ au comptoir, hors ligne. La photo locale PRIME, parce qu'elle est la     │
 * │ plus récente : le marchand vient de dire que c'est celle-là.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ La jointure est en `leftJoin` sur la clé de la table (un article a au plus
 * une photo en attente) : elle ne multiplie aucune ligne, donc aucune somme.
 */
import { eq, sql } from "drizzle-orm";

import { pendingProductPhotos, products } from "@/db/schema";

/** La condition de jointure de la photo en attente. */
export const photoEnAttente = eq(pendingProductPhotos.productId, products.id);

/** La photo à afficher : celle prise ici, sinon celle du serveur, sinon rien. */
export const imageArticle = sql<string | null>`coalesce(${pendingProductPhotos.uri}, nullif(${products.image}, ''))`;

export { pendingProductPhotos };
