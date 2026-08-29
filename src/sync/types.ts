/** Contrat de tirage, tel que le serveur le décrit. */

export type ColumnKind =
  | "text"
  | "decimal"
  | "json"
  | "boolean"
  | "integer"
  | "real"
  | "datetime"
  | "date";

export interface ColumnSpec {
  name: string;
  kind: ColumnKind;
  null: boolean;
  pk: boolean;
}

export interface ChildSpec {
  /** Clé sous laquelle l'enfant arrive dans le parent. */
  name: string;
  /** Table locale où le ranger. */
  table: string;
  /** Colonne qui porte le parent. */
  parent_field: string;
  columns: ColumnSpec[];
}

export interface TableSpec {
  name: string;
  has_tombstones: boolean;
  /** Nombre de lignes, seulement si le manifeste a été demandé avec `counts`. */
  row_count: number | null;
  columns: ColumnSpec[];
  children: ChildSpec[];
}

export interface Manifest {
  schema_version: number;
  default_page_size: number;
  tables: TableSpec[];
}

export interface PullPage {
  table: string;
  rows: Record<string, unknown>[];
  deleted_ids: string[];
  next_cursor: string | null;
  next_deleted_cursor: string | null;
  has_more: boolean;
  server_time: string;
  schema_version: number;
}

/** Réponse de la sonde `POST /sync/pull/changed/`. */
export interface ChangedTables {
  /** Noms des tables ayant du neuf depuis les curseurs envoyés. */
  changed: string[];
  /** Nombre total de tables au manifeste, pour information. */
  tables: number;
  server_time: string;
  schema_version: number;
}

/** Ce que l'écran d'attente affiche pendant la première synchronisation. */
export interface PullProgress {
  /** Table en cours. */
  table: string;
  /** Rang de la table dans le manifeste, à partir de 1. */
  index: number;
  tableCount: number;
  /** Lignes reçues pour cette table. */
  received: number;
  /** Total attendu, si le manifeste portait les décomptes. */
  expected: number | null;
  /** Lignes reçues toutes tables confondues. */
  receivedTotal: number;
  expectedTotal: number | null;
}
