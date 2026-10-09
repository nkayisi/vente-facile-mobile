/**
 * Quels ARTICLES un membre a le droit de voir, et sur quel critère.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE BACK-OFFICE BORNAIT SON CATALOGUE PAR ENTREPÔT DEPUIS TOUJOURS, ET   │
 * │ LE TERMINAL MONTRAIT TOUT.                                               │
 * │                                                                          │
 * │ `ProductViewSet` applique `track_inventory = false OU une ligne de stock │
 * │ existe dans un entrepôt accessible` : un caissier de WH-MAIN ne voit pas │
 * │ un article stocké au seul WH-NORD. Mesuré sur la boutique de test : le   │
 * │ propriétaire reçoit 7 articles, le caissier 5, un gérant sans entrepôt 1.│
 * │                                                                          │
 * │ Le terminal, lui, rendait les sept à tout le monde. Un marchand qui      │
 * │ compare les deux surfaces y lit une incohérence, et c'est T5 du retour.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ CE N'EST PAS UN FILTRE AU TIRAGE, ET CE N'EST PAS UN PIS-ALLER. MESURÉ.
 *
 * Deux faits l'interdisent, et le second est dirimant :
 *
 *   - `Stock.save()` ne touche PAS `product.updated_at`, et aucun signal ne le
 *     fait. Le tirage paginant sur un curseur `(updated_at, id)` appliqué
 *     APRÈS le périmètre, un article nouvellement stocké dans mon dépôt
 *     deviendrait éligible avec un horodatage ANTÉRIEUR au point de reprise :
 *     il ne descendrait jamais, et la sonde `pull/changed/` répondrait « rien
 *     de neuf ». Un magasinier recevrait une marchandise qui n'apparaîtrait
 *     pas sur son terminal.
 *   - Et même avec cette écriture en plus, narrower le tirage ne suffirait
 *     PAS : un article qui SORT du périmètre n'émet aucune pierre tombale - il
 *     n'est pas supprimé - et resterait en base locale indéfiniment. Le filtre
 *     de lecture est donc nécessaire de toute façon, et il est suffisant :
 *     toutes les lignes sont là, on choisit ce qu'on montre.
 *
 * La réserve est écrite aussi dans `apps/core/warehouse_scope.py`, sur la
 * fonction serveur dont ce module est le miroir.
 */
import { and, eq, exists, inArray, or, sql } from "drizzle-orm";

import { products, stocks } from "@/db/schema";

/** Le rôle tel que l'instantané de session le porte. */
export type RoleCatalogue = "owner" | "manager" | "stock_keeper" | "cashier";

/**
 * Les entrepôts qui bornent le catalogue, ou `null` pour « aucune restriction ».
 *
 * Miroir strict d'`accessible_warehouse_ids` : `null` est le PROPRIÉTAIRE, dont
 * l'accès vient de son rôle et non d'une affectation, et `[]` est un rôle borné
 * sans aucun dépôt - deux situations OPPOSÉES que les écrire pareil
 * confondrait, en ouvrant tout au second.
 */
export function entrepotsDuCatalogue(
  role: RoleCatalogue | null,
  assignes: { id: string }[]
): string[] | null {
  if (role === "owner") return null;
  return assignes.map((a) => a.id);
}

/**
 * La condition SQL, miroir de `filter_products_by_warehouse_ids`.
 *
 * `exists` plutôt qu'une jointure : la relation est INVERSE (un article porte
 * une ligne de stock par entrepôt), donc une jointure rendrait l'article une
 * fois par dépôt accessible. Le serveur s'en sort par `distinct()` ; ici une
 * sous-requête l'évite à la source, ce qui laisse en outre les compteurs de
 * `count(*)` justes sans précaution.
 *
 * ⚠ UN ARTICLE NON SUIVI RESTE VISIBLE DE TOUS, et ce n'est pas une
 * tolérance : un service, une prestation, un emballage interne n'a de ligne de
 * stock dans AUCUN entrepôt. L'écarter le rendrait invendable partout.
 *
 * Rend `undefined` quand il n'y a rien à borner, pour s'insérer dans un
 * `and(...)` sans condition morte.
 */
export function conditionCatalogue(entrepots: string[] | null) {
  if (entrepots === null) return undefined;

  // Aucun dépôt accessible : seuls les articles non suivis passent. C'est
  // exactement ce que le back-office rend à un membre sans affectation, et
  // c'est une liste courte plutôt qu'un écran vide inexpliqué.
  if (entrepots.length === 0) return eq(products.trackInventory, false);

  return or(
    eq(products.trackInventory, false),
    exists(
      sql`(select 1 from ${stocks} where ${and(
        eq(stocks.productId, products.id),
        inArray(stocks.warehouseId, entrepots)
      )})`
    )
  );
}
