/**
 * Journal des opérations en attente d'envoi.
 *
 * Le client n'envoie pas des lignes de table mais des ACTES métier, rejoués
 * côté serveur par le chemin du back-office. Ce fichier est la file d'attente
 * de ces actes.
 *
 * Ce qu'il ne refait pas, et pourquoi. L'ancienne file relisait sa table
 * ENTIÈRE à chaque écriture locale pour dédupliquer : avec quelques milliers de
 * ventes en attente, chaque encaissement ralentissait. Ici on interroge par
 * index, et rien ne balaie la table.
 */
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { outboxOperations, type NewOutboxOperation, type OutboxOperation } from "@/db/schema";

import { backoffMs } from "./policy";

export type OperationKind =
  | "sale.create"
  | "sale.add_payment"
  | "sale.cancel"
  | "register_session.open"
  | "customer.create"
  | "customer.record_payment"
  // « Avance » n'a PAS d'acte propre : le serveur en a fait un alias de
  // `record_payment`, parce qu'inscrire une avance sans toucher aux factures
  // d'un client endetté faisait diverger son solde de la somme de ses
  // `amount_due`. Un seul acte, donc, et le préfixe du reçu (`RGL` ou `AVC`)
  // dit après coup ce qu'il a été.
  | "customer.adjust_balance"
  | "stock.unpack"
  // Les TRANSITIONS d'un transfert ou d'un ajustement sont des actes à part
  // entière : elles bougent du stock. Un refus y est déterministe (« déjà
  // expédié ») et ne se réessaie donc JAMAIS - il part en quarantaine.
  | "stock_transfer.create"
  | "stock_transfer.approve"
  | "stock_transfer.ship"
  | "stock_transfer.receive"
  | "stock_transfer.cancel"
  | "stock_adjustment.create"
  | "stock_adjustment.approve"
  | "stock_adjustment.reject"
  // COMPTER est le meilleur usage mobile du produit : on compte debout dans le
  // rayon, souvent au fond d'un dépôt sans réseau. Les cinq transitions d'une
  // session passent donc par le journal.
  | "inventory_session.create"
  | "inventory_session.start"
  | "inventory_session.count"
  | "inventory_session.submit"
  | "inventory_session.validate"
  | "inventory_session.cancel"
  | "product.create"
  | "category.create"
  | "brand.create"
  | "unit.create"
  // La CLÔTURE passe par le journal : le Z se tire au comptoir, souvent avant
  // que le réseau ne revienne.
  | "register_session.close"
  | "stock_movement.create"
  | "expense.create"
  | "cash_movement.create";

export type OutboxState = OutboxOperation["state"];

/** Taille d'un envoi. Un lot trop gros sur un lien instable ne se termine jamais. */
export const BATCH_SIZE = 50;

async function nextSeq(): Promise<number> {
  const [row] = await db
    .select({ seq: outboxOperations.seq })
    .from(outboxOperations)
    .orderBy(desc(outboxOperations.seq))
    .limit(1);
  return (row?.seq ?? 0) + 1;
}

export interface EnqueueOptions {
  /** Clés locales créées par l'opération, pour la réconciliation. */
  localIds?: Record<string, string>;
  /** Opérations dont celle-ci dépend : un règlement suit sa vente. */
  dependsOn?: string[];
}

/**
 * Met un acte en file.
 *
 * `id` est fourni par l'appelant et devient la clé d'idempotence côté serveur :
 * c'est ce qui rend le renvoi sûr après une coupure survenue APRÈS que le
 * serveur ait validé, mais avant que la réponse n'arrive.
 */
export async function enqueue(
  id: string,
  kind: OperationKind,
  payload: unknown,
  options: EnqueueOptions = {}
): Promise<OutboxOperation> {
  const row: NewOutboxOperation = {
    id,
    kind,
    seq: await nextSeq(),
    payload: JSON.stringify(payload),
    dependsOn: JSON.stringify(options.dependsOn ?? []),
    localIds: JSON.stringify(options.localIds ?? {}),
    state: "pending",
    attempts: 0,
    occurredAt: new Date(),
  };
  await db.insert(outboxOperations).values(row).onConflictDoNothing();
  const [saved] = await db
    .select()
    .from(outboxOperations)
    .where(eq(outboxOperations.id, id));
  return saved!;
}

/** Opérations prêtes à partir : en attente, et dont la temporisation est passée. */
export async function readyToSend(limit = BATCH_SIZE): Promise<OutboxOperation[]> {
  const now = new Date();
  return db
    .select()
    .from(outboxOperations)
    .where(
      and(
        eq(outboxOperations.state, "pending"),
        or(
          isNull(outboxOperations.nextAttemptAt),
          lte(outboxOperations.nextAttemptAt, now)
        )
      )
    )
    .orderBy(asc(outboxOperations.seq))
    .limit(limit);
}

export async function countByState(): Promise<Record<OutboxState, number>> {
  const rows = await db
    .select({ state: outboxOperations.state, n: sql<number>`count(*)` })
    .from(outboxOperations)
    .groupBy(outboxOperations.state);

  const counts = {
    pending: 0, inflight: 0, done: 0, quarantined: 0, blocked: 0,
  } as Record<OutboxState, number>;
  for (const row of rows) counts[row.state] = Number(row.n);
  return counts;
}

export async function markInflight(ids: string[], batchId: string): Promise<void> {
  if (!ids.length) return;
  await db
    .update(outboxOperations)
    .set({ state: "inflight", batchId })
    .where(inArray(outboxOperations.id, ids));
}

/**
 * Remet en attente ce qui est resté « en vol ».
 *
 * Appelée au démarrage. Une application tuée pendant un envoi laisserait sinon
 * ses opérations bloquées dans cet état pour toujours : c'est précisément le
 * défaut de l'ancienne file, dont les entrées `processing` n'étaient jamais
 * relues par personne.
 */
export async function recoverInflight(): Promise<number> {
  const bloquees = await db
    .select({ id: outboxOperations.id })
    .from(outboxOperations)
    .where(eq(outboxOperations.state, "inflight"));

  if (bloquees.length) {
    await db
      .update(outboxOperations)
      .set({ state: "pending", batchId: null })
      .where(eq(outboxOperations.state, "inflight"));
  }
  return bloquees.length;
}

export async function markDone(id: string): Promise<void> {
  await db
    .update(outboxOperations)
    .set({ state: "done", lastError: null, errorCode: null })
    .where(eq(outboxOperations.id, id));
}

/**
 * Met en quarantaine : refus métier définitif.
 *
 * L'opération n'est JAMAIS réessayée. Elle attend une décision humaine sur
 * l'écran « Opérations à corriger », avec son motif en clair.
 */
export async function markQuarantined(
  id: string,
  code: string,
  message: string
): Promise<void> {
  await db
    .update(outboxOperations)
    .set({ state: "quarantined", errorCode: code, lastError: message })
    .where(eq(outboxOperations.id, id));
}

export async function markBlocked(id: string, message: string): Promise<void> {
  await db
    .update(outboxOperations)
    .set({ state: "blocked", errorCode: "blocked", lastError: message })
    .where(eq(outboxOperations.id, id));
}

/** Programme un nouvel essai. Le compteur ne monte que pour CETTE opération. */
export async function scheduleRetry(
  id: string,
  attempts: number,
  message: string | null
): Promise<void> {
  await db
    .update(outboxOperations)
    .set({
      state: "pending",
      attempts: attempts + 1,
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts + 1)),
      lastError: message,
    })
    .where(eq(outboxOperations.id, id));
}

/** Débloque ce qui attendait une porte fermée : abonnement renouvelé, droits rendus. */
export async function unblockAll(): Promise<void> {
  await db
    .update(outboxOperations)
    .set({ state: "pending", nextAttemptAt: null })
    .where(eq(outboxOperations.state, "blocked"));
}

export async function quarantined(): Promise<OutboxOperation[]> {
  return db
    .select()
    .from(outboxOperations)
    .where(eq(outboxOperations.state, "quarantined"))
    .orderBy(asc(outboxOperations.seq));
}

/** Abandonne une opération mise en quarantaine, sur décision de l'utilisateur. */
export async function discard(id: string): Promise<void> {
  await db.delete(outboxOperations).where(eq(outboxOperations.id, id));
}

/** Purge les opérations abouties. Les refus, eux, ne se purgent jamais. */
export async function purgeDone(): Promise<void> {
  await db.delete(outboxOperations).where(eq(outboxOperations.state, "done"));
}

/**
 * Opérations d'un type donné qui n'ont pas encore abouti.
 *
 * RÈGLE DU DÉPÔT : les tables tirées ne sont écrites que par le TIRAGE. Ce qui
 * n'est pas encore confirmé par le serveur vit ici, et nulle part ailleurs.
 *
 * La tentation inverse est forte : écrire tout de suite la vente ou la session
 * dans sa table, pour que l'écran l'affiche sans attendre. Mais le tirage
 * n'efface jamais rien, il insère et met à jour. Une opération REFUSÉE
 * laisserait donc sa ligne optimiste en place pour toujours : une session de
 * caisse ouverte qui n'existe sur aucun serveur, et sur laquelle le terminal
 * continuerait à vendre. En lisant le journal, l'oubli est automatique, puisque
 * la mise en quarantaine sort l'opération de cette liste.
 *
 * `done` est exclu : l'opération a abouti, sa ligne authentique est arrivée par
 * le tirage et c'est elle qui fait foi. `quarantined` et `blocked` aussi : rien
 * n'en est advenu côté serveur, elles ne doivent donc rien afficher comme acquis.
 */
export async function enAttenteParType<T = unknown>(
  kind: string
): Promise<{ id: string; payload: T; occurredAt: Date }[]> {
  const lignes = await db
    .select({
      id: outboxOperations.id,
      payload: outboxOperations.payload,
      occurredAt: outboxOperations.occurredAt,
    })
    .from(outboxOperations)
    .where(
      and(
        eq(outboxOperations.kind, kind),
        inArray(outboxOperations.state, ["pending", "inflight"])
      )
    )
    .orderBy(asc(outboxOperations.seq));

  return lignes.map((l) => ({
    id: l.id,
    payload: JSON.parse(l.payload) as T,
    occurredAt: l.occurredAt,
  }));
}
