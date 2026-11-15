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
import { litTousLesEntrepots, type MembrePerimetre } from "@vente-facile/core";

import { products, stocks } from "@/db/schema";

/**
 * Les entrepôts qui bornent le catalogue, ou `null` pour « aucune restriction ».
 *
 * Miroir de `filter_product_queryset` en LECTURE : `null` est le propriétaire,
 * ET le membre à qui la case « Consulter tous les entrepôts » a été cochée -
 * il lit tout, partout, le catalogue compris. `[]` est un membre borné sans
 * aucun dépôt. Deux situations OPPOSÉES, que les écrire pareil confondrait en
 * ouvrant tout au second.
 *
 * Les entrepôts DÉSACTIVÉS comptent : c'est une lecture, et un article qu'on
 * n'a stocké que là reste consultable.
 */
export function entrepotsDuCatalogue(membre: MembrePerimetre): string[] | null {
  if (litTousLesEntrepots(membre)) return null;
  return membre.affectes.map((a) => a.id);
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
