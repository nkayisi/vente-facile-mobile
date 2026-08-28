/**
 * Point de reprise, une ligne par table.
 *
 * La règle qui gouverne ce fichier : **le point de reprise n'avance que si la
 * table a été tirée en entier.** L'ancienne synchronisation avançait son
 * horodatage même quand une table avait échoué et renvoyé une liste vide : la
 * fenêtre était alors perdue pour toujours, sans qu'aucun message ne le dise.
 */
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { syncState, type SyncStateRow } from "@/db/schema";

export async function readState(table: string): Promise<SyncStateRow | null> {
  const rows = await db.select().from(syncState).where(eq(syncState.table, table));
  return rows[0] ?? null;
}

export async function readAllStates(): Promise<SyncStateRow[]> {
  return db.select().from(syncState);
}

interface StatePatch {
  cursor?: string | null;
  deletedCursor?: string | null;
  hasMore?: boolean;
  lastFullSyncAt?: Date | null;
  lastError?: string | null;
  rowCount?: number;
}

export async function writeState(table: string, patch: StatePatch): Promise<void> {
  await db
    .insert(syncState)
    .values({ table, hasMore: false, rowCount: 0, ...patch })
    .onConflictDoUpdate({ target: syncState.table, set: patch });
}

/** Efface tous les points de reprise : le prochain tirage repart de zéro. */
export async function resetAllStates(): Promise<void> {
  await db.delete(syncState);
}
