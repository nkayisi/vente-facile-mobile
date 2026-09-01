/**
 * Les produits qu'un inventaire en cours interdit de vendre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE REFUS EXISTAIT DÉJÀ. IL ARRIVAIT SEULEMENT TROP TARD.                │
 * │                                                                          │
 * │ Une vraie vente a été encaissée, le ticket imprimé, puis REFUSÉE par le  │
 * │ serveur : ses produits étaient bloqués par un inventaire en cours        │
 * │ (`SaleCreateSerializer.validate`). Le client était parti avec un papier  │
 * │ qui ne désignait rien, et le caissier n'avait plus qu'à le rappeler.     │
 * │                                                                          │
 * │ Ce module déplace ce refus AVANT l'impression, avec le motif et la       │
 * │ référence de la session, pour que le caissier sache quoi dire.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON LIT LA FEUILLE DE COMPTAGE, PAS LE PÉRIMÈTRE.                        │
 * │                                                                          │
 * │ Le serveur calcule le verrou depuis le PÉRIMÈTRE de la session (tout     │
 * │ l'entrepôt, un sous-arbre de catégories, ou une liste de produits). Ces  │
 * │ M2M ne descendent pas au tirage et ne le peuvent pas : `describe_table`  │
 * │ n'itère que les champs concrets, et les tables de liaison n'ont ni       │
 * │ `organization` ni `updated_at`, donc rien à quoi accrocher un curseur.   │
 * │                                                                          │
 * │ L'approximation honnête est la FEUILLE : `inventory_counts` descend      │
 * │ imbriquée dans sa session, et elle porte exactement les produits que le  │
 * │ serveur a retenus au démarrage. C'est la même liste, prise en aval.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Écarts connus, et assumés :
 *
 * 1. **Sur un périmètre CATÉGORIE ou PRODUIT, un article sans stock est
 *    verrouillé côté serveur et pas ici** : `target_products` n'engendre pas
 *    de ligne pour lui, alors que `get_locked_product_ids` le compte. Sans
 *    conséquence au comptoir : `verifierAjout` le refuse déjà pour stock nul.
 *    Le périmètre TOTAL, lui, est lu exactement (voir plus bas) - il fallait
 *    qu'il le soit : une réception pendant l'inventaire y crée une ligne de
 *    stock que le serveur verrouille aussitôt, et que la feuille, figée au
 *    démarrage, ne connaîtrait jamais.
 * 2. **Une session démarrée DEPUIS CE TERMINAL et pas encore poussée ne
 *    verrouille rien.** La feuille est engendrée par le SERVEUR au démarrage ;
 *    tant qu'il n'a pas répondu, aucune ligne n'existe nulle part. C'est la
 *    même limite que l'écran de comptage annonce déjà.
 * 3. **L'état est celui du dernier TIRAGE.** D'où `arreteA` : le comptoir dit
 *    de quand date ce qu'il oppose, plutôt que de se présenter en autorité.
 * 4. **Une annulation ou une validation EN FILE ne lève PAS le verrou**, et
 *    c'est délibéré. Le journal porte bien l'intention, mais elle peut être
 *    refusée par le serveur (session déjà validée ailleurs, droit manquant) :
 *    lever le verrou sur une décision non confirmée laisserait passer des
 *    ventes que le serveur refusera, c'est-à-dire la direction PERMISSIVE, la
 *    seule que ce chantier s'interdit. Le comptoir reste donc bloqué jusqu'à
 *    la synchronisation, et le bandeau propose précisément de la lancer. La
 *    règle diffère de celle des ventes en file (`reserve-locale.ts`), qui sont
 *    autoritaires parce qu'elles ne peuvent que RESSERRER le disponible.
 */
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { inventoryCounts, inventorySessions, stocks } from "@/db/schema";
import { readState } from "@/sync/state";

/** Identifiant de produit → référence de la session qui le bloque. */
export type VerrouInventaire = Map<string, string>;

/**
 * Les produits bloqués dans cet entrepôt, avec la session qui les bloque.
 *
 * Carte VIDE sans entrepôt : un verrou porte sur un dépôt, et l'appliquer
 * partout bloquerait une caisse qui vend le stock d'un autre.
 */
export async function produitsVerrouilles(
  warehouseId: string | null | undefined
): Promise<VerrouInventaire> {
  if (!warehouseId) return new Map();

  const sessions = await db
    .select({
      id: inventorySessions.id,
      reference: inventorySessions.reference,
      scopeType: inventorySessions.scopeType,
    })
    .from(inventorySessions)
    .where(
      and(
        eq(inventorySessions.warehouseId, warehouseId),
        eq(inventorySessions.isStockLocked, true),
        // Les deux mêmes états que `get_all_locked_product_ids`. Une session en
        // brouillon ne verrouille rien, une session validée ou annulée non plus.
        inArray(inventorySessions.status, ["in_progress", "review"]),
        eq(inventorySessions.isDeleted, false)
      )
    );

  if (sessions.length === 0) return new Map();

  const verrou: VerrouInventaire = new Map();
  // Première session rencontrée : le serveur nomme toutes les sessions
  // bloquantes, mais au comptoir une seule référence suffit à savoir quoi
  // attendre, et deux références dans un message le rendent illisible.
  const bloquer = (productId: string, reference: string) => {
    if (!verrou.has(productId)) verrou.set(productId, reference);
  };

  // ── Périmètre TOTAL : la lecture est EXACTE, pas approchée ───────────────
  //
  // `get_locked_product_ids` bloque, pour une session `full`, tout produit
  // ayant une ligne de stock dans l'entrepôt - et il le RECALCULE à chaque
  // appel. S'en tenir à la feuille de comptage, figée au démarrage, laisserait
  // vendable un produit approvisionné DEPUIS : le comptoir accepterait, le
  // serveur refuserait après impression. C'est précisément le défaut que ce
  // lot referme, et le laisser sur un chemin aussi ordinaire qu'une réception
  // en cours d'inventaire n'aurait pas de sens.
  //
  // Un produit à stock nul est ainsi verrouillé comme chez le serveur, et sa
  // carte annonce l'inventaire plutôt qu'« Épuisé » : c'est la bonne raison.
  const totales = sessions.filter((s) => s.scopeType === "full");
  if (totales.length > 0) {
    const enRayon = await db
      .select({ productId: stocks.productId })
      .from(stocks)
      .where(eq(stocks.warehouseId, warehouseId));
    for (const ligne of enRayon) bloquer(ligne.productId, totales[0].reference);
  }

  // ── Périmètres CATÉGORIE et PRODUIT : la feuille, faute de mieux ─────────
  //
  // Leurs M2M de portée ne descendent pas au tirage et ne le peuvent pas
  // (voir l'en-tête). `inventory_counts` porte exactement les produits retenus
  // au démarrage : la même liste, prise en aval.
  const partielles = sessions.filter((s) => s.scopeType !== "full");
  if (partielles.length > 0) {
    const references = new Map(partielles.map((s) => [s.id, s.reference]));
    const lignes = await db
      .select({ sessionId: inventoryCounts.sessionId, productId: inventoryCounts.productId })
      .from(inventoryCounts)
      .where(inArray(inventoryCounts.sessionId, [...references.keys()]));
    for (const ligne of lignes) {
      bloquer(ligne.productId, references.get(ligne.sessionId) ?? "");
    }
  }

  return verrou;
}

/**
 * Quand l'état des sessions d'inventaire a été relevé pour la dernière fois.
 *
 * `null` si la table n'a jamais été tirée en entier. Le comptoir l'affiche :
 * un verrou est l'instantané d'un état concurrent, pas une autorité, et le
 * dire est ce qui distingue « attendez » de « votre appareil est en retard ».
 */
export async function arreteA(): Promise<Date | null> {
  const etat = await readState("inventory_sessions");
  return etat?.lastFullSyncAt ?? null;
}
