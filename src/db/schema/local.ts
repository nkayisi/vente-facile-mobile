/**
 * Tables purement locales : jamais envoyées au serveur, jamais reçues de lui.
 *
 * Elles portent l'état de l'appareil, pas celui de l'organisation. Un effacement
 * de compte les emporte, une synchronisation ne les touche jamais.
 */
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Point de reprise de la synchronisation, une ligne par table tirée.
 *
 * Le curseur est un COUPLE `(sync_updated_at, id)` et non un simple horodatage :
 * deux lignes écrites dans la même milliseconde seraient sinon soit sautées,
 * soit renvoyées en boucle. `has_more` distingue une table tirée en entier
 * d'une table interrompue, et c'est ce qui autorise, ou non, à avancer.
 */
export const syncState = sqliteTable("sync_state", {
  /** Nom de la table côté serveur : `products`, `stocks`, `customers`… */
  table: text("table").primaryKey(),
  cursorUpdatedAt: text("cursor_updated_at"),
  cursorId: text("cursor_id"),
  /** Vrai tant que le serveur annonce des pages restantes. */
  hasMore: integer("has_more", { mode: "boolean" }).notNull().default(false),
  /** Dernière fois que la table a été tirée JUSQU'AU BOUT. */
  lastFullSyncAt: integer("last_full_sync_at", { mode: "timestamp_ms" }),
  /** Dernière erreur rencontrée, conservée pour l'écran de synchronisation. */
  lastError: text("last_error"),
  rowCount: integer("row_count").notNull().default(0),
});

/**
 * Préférences de l'appareil : thème, imprimante, largeur de papier, dernier
 * entrepôt choisi. Sur le compte, deux caissiers qui se partagent un terminal
 * se voleraient leurs réglages ; ici chacun retrouve le terminal tel qu'il est.
 */
export const localSettings = sqliteTable("local_settings", {
  key: text("key").primaryKey(),
  /** Toujours du JSON : une seule règle de lecture, quel que soit le réglage. */
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * Journal des opérations en attente d'envoi.
 *
 * Le client n'envoie pas des lignes de table mais des ACTES métier, rejoués
 * côté serveur par le même chemin que le back-office. Voir `src/sync/`.
 *
 * Les index sur `state` et `next_attempt_at` ne sont pas décoratifs :
 * l'ancienne application relisait toute sa file à chaque écriture locale, si
 * bien qu'avec quelques milliers de ventes en attente, chaque encaissement
 * ralentissait.
 */
export const outboxOperations = sqliteTable(
  "outbox_operations",
  {
    /** Identifiant de l'opération : c'est LUI qui porte l'idempotence. */
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    /** Compteur strictement croissant par appareil : l'ordre d'envoi. */
    seq: integer("seq").notNull(),
    /** Corps attendu par le serializer serveur, en JSON. */
    payload: text("payload").notNull(),
    /** Identifiants d'opérations dont celle-ci dépend, en JSON. */
    dependsOn: text("depends_on").notNull().default("[]"),
    /** Clés locales créées par l'opération, en JSON. */
    localIds: text("local_ids").notNull().default("{}"),
    state: text("state", {
      enum: ["pending", "inflight", "done", "quarantined", "blocked"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    errorCode: text("error_code"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    batchId: text("batch_id"),
  },
  (t) => [
    index("outbox_state_idx").on(t.state),
    index("outbox_next_attempt_idx").on(t.nextAttemptAt),
    index("outbox_seq_idx").on(t.seq),
  ]
);

export type SyncStateRow = typeof syncState.$inferSelect;
export type LocalSetting = typeof localSettings.$inferSelect;
export type OutboxOperation = typeof outboxOperations.$inferSelect;
export type NewOutboxOperation = typeof outboxOperations.$inferInsert;
