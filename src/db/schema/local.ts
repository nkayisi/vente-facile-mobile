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
  /**
   * Curseur d'écriture, tel que le serveur l'a rendu.
   *
   * Conservé OPAQUE. Il encode un couple `(updated_at, id)`, mais le décomposer
   * ici figerait cette forme des deux côtés : le serveur ne pourrait plus la
   * changer sans casser les clients déjà déployés.
   */
  cursor: text("cursor"),
  /**
   * Curseur des suppressions, distinct.
   *
   * Les mêler ferait sauter les unes ou les autres : une ligne modifiée puis
   * supprimée avancerait le curseur au-delà de sa propre pierre tombale.
   */
  deletedCursor: text("deleted_cursor"),
  /** Vrai tant que le serveur annonce des pages restantes. */
  hasMore: integer("has_more", { mode: "boolean" }).notNull().default(false),
  /** Dernière fois que la table a été tirée JUSQU'AU BOUT. */
  lastFullSyncAt: integer("last_full_sync_at", { mode: "timestamp_ms" }),
  /** Dernière erreur rencontrée, conservée pour l'écran de synchronisation. */
  lastError: text("last_error"),
  /** Lignes reçues au total, pour la progression du premier tirage. */
  rowCount: integer("row_count").notNull().default(0),
  /**
   * Le PÉRIMÈTRE sous lequel ce curseur a été obtenu.
   *
   * ┌──────────────────────────────────────────────────────────────────┐
   * │ SANS LUI, UN CHANGEMENT DE PÉRIMÈTRE PERD DES LIGNES POUR DE BON.│
   * │                                                                  │
   * │ Le serveur applique le périmètre AVANT le curseur. Quand il       │
   * │ s'élargit - un magasinier reçoit un second dépôt - les lignes     │
   * │ devenues éligibles portent un `updated_at` antérieur au point de  │
   * │ reprise : elles sont écartées, et la sonde `pull/changed/`        │
   * │ confirme « rien de neuf ». L'écran annonce « Complet » sur une    │
   * │ table amputée.                                                    │
   * │                                                                  │
   * │ `null` : jamais reçu (serveur antérieur, ou table jamais tirée).  │
   * │ Ce n'est PAS un changement - voir `perimetreAChange`.             │
   * └──────────────────────────────────────────────────────────────────┘
   */
  scopeToken: text("scope_token"),
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

/**
 * Paniers mis en attente au comptoir.
 *
 * Le cas est quotidien : un client s'aperçoit qu'il a oublié quelque chose et
 * repart dans les rayons, la file derrière lui n'a pas à attendre. On range son
 * panier, on sert les suivants, on le reprend à son retour.
 *
 * ON MET EN ATTENTE UN PANIER, PAS UN ENCAISSEMENT. Ni les règlements, ni les
 * points, ni le choix du crédit ne sont conservés : ce sont des décisions de
 * l'écran d'encaissement, prises face au client, sur des soldes qui bougent
 * entre-temps. Les restituer ferait payer avec des points qui ne sont plus là.
 *
 * Le contenu ne porte que des IDENTIFIANTS et les nombres saisis, jamais une
 * copie du produit. Un panier en attente ne met pas le catalogue en cache : il
 * s'y réfère, et le prix comme le stock sont RELUS à la reprise. Autrement, un
 * panier rangé le matin vendrait le soir au prix du matin, sans que personne
 * ne le voie.
 */
export const parkedCarts = sqliteTable(
  "parked_carts",
  {
    id: text("id").primaryKey(),
    /** Ce que le caissier lit dans la liste : un nom de client, une table, un repère. */
    label: text("label").notNull(),
    /** Session de caisse d'origine : un panier ne survit pas à la clôture. */
    registerSessionId: text("register_session_id"),
    /** `ContenuEnAttente` sérialisé. Voir `features/pos/attente.ts`. */
    content: text("content").notNull(),
    lineCount: integer("line_count").notNull().default(0),
    /**
     * Montant AU MOMENT DE LA MISE EN ATTENTE, pour que la liste dise quelque
     * chose. Décimale en chaîne, comme partout. Il est indicatif : la reprise
     * recalcule tout depuis le catalogue du jour.
     */
    totalAmount: text("total_amount").notNull().default("0"),
    totalCurrency: text("total_currency").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("parked_session_idx").on(t.registerSessionId)]
);

/**
 * Documents imprimables, gardés pour la réimpression.
 *
 * Ce n'est PAS une file d'attente au sens du journal d'opérations : l'impression
 * ne se rejoue pas toute seule, elle se redemande. Un ticket qui n'est pas sorti
 * parce que le rouleau était vide doit être réimprimé par un geste du caissier,
 * jamais par un automate qui déciderait de le sortir dix minutes plus tard,
 * alors que le client est parti.
 *
 * On range les DONNÉES du document, pas ses blocs ni ses octets : une
 * réimpression les reconstruit avec la pastille DUPLICATA. Ranger le rendu
 * figerait la mise en page du jour de la vente, et le duplicata cesserait de
 * ressembler à l'original dès la première correction de gabarit.
 *
 * Le numéro, lui, ne bouge JAMAIS : il est alloué à l'émission, et c'est toute
 * la raison de la série dense par appareil. Un client qui revient avec son
 * ticket doit retrouver le même numéro sur le duplicata.
 */
export const printJobs = sqliteTable(
  "print_jobs",
  {
    id: text("id").primaryKey(),
    /** `sale`, `payment`, `cash_session`, `expense`… le type de document. */
    kind: text("kind").notNull(),
    /** Numéro définitif du document, tel qu'imprimé. */
    documentNumber: text("document_number").notNull(),
    /** Ce que le caissier lit dans la liste. */
    label: text("label").notNull(),
    /** Données du document, en JSON, telles que `core/receipt` les attend. */
    data: text("data").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    /** Dernière impression réussie. Nul tant que rien n'est sorti. */
    printedAt: integer("printed_at", { mode: "timestamp_ms" }),
    /** Nombre d'impressions : au-delà de 1, ce sont des duplicata. */
    printCount: integer("print_count").notNull().default(0),
    /** Transport ayant servi la dernière fois, pour le dire au caissier. */
    transport: text("transport"),
  },
  (t) => [index("print_jobs_created_idx").on(t.createdAt)]
);

/**
 * Photos d'articles en attente d'envoi.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE PHOTO NE PEUT PAS PASSER PAR LE JOURNAL, ET C'EST STRUCTUREL.       │
 * │                                                                          │
 * │ `/sync/operations/` transporte du JSON ; `Product.image` est un          │
 * │ `ImageField`, donc du multipart. La photo attend donc ICI, et elle part  │
 * │ par un `PATCH /products/{id}/` séparé, APRÈS que le serveur a l'article. │
 * │                                                                          │
 * │ Ce qui rend la manœuvre possible : `product.create` transmet l'ID du     │
 * │ TERMINAL (`local_id` dans le gestionnaire), et le serveur le conserve.   │
 * │ La photo vise donc le bon article sans avoir à guetter un identifiant    │
 * │ renvoyé.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le fichier est COPIÉ dans le dossier de l'application avant d'être inscrit
 * ici : l'URI que rend le sélecteur pointe vers un cache que le système efface
 * dès que le stockage se tend, et une photo prise le matin partirait le soir
 * sur un fichier disparu.
 */
export const pendingProductPhotos = sqliteTable(
  "pending_product_photos",
  {
    /** L'article visé. C'est l'ID du terminal, que le serveur reprend. */
    productId: text("product_id").primaryKey(),
    /** Chemin du fichier COPIÉ, dans le dossier de l'application. */
    uri: text("uri").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    /** Nombre d'envois tentés : sert la temporisation, et le message d'échec. */
    attempts: integer("attempts").notNull().default(0),
    /** Dernier refus, tel que l'API l'a écrit. Nul tant que rien n'a échoué. */
    lastError: text("last_error"),
  },
  (t) => [index("pending_photos_created_idx").on(t.createdAt)]
);

export type SyncStateRow = typeof syncState.$inferSelect;
export type LocalSetting = typeof localSettings.$inferSelect;
export type OutboxOperation = typeof outboxOperations.$inferSelect;
export type NewOutboxOperation = typeof outboxOperations.$inferInsert;
export type ParkedCart = typeof parkedCarts.$inferSelect;
export type PendingProductPhoto = typeof pendingProductPhotos.$inferSelect;
export type PrintJob = typeof printJobs.$inferSelect;
