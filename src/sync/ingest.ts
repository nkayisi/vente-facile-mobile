/**
 * Écriture des lignes reçues dans la base locale.
 *
 * Générique, pilotée par le manifeste : 31 tables et 464 colonnes, écrire une
 * fonction d'ingestion par table serait 31 occasions de se tromper et 31
 * endroits à corriger quand le serveur ajoute un champ.
 */
import { connection } from "@/db/client";

import { coerce } from "./coerce";
import type { ChildSpec, ColumnSpec } from "./types";

/**
 * Nombre de lignes par instruction.
 *
 * SQLite plafonne le nombre de paramètres liés. On borne le produit
 * `colonnes × lignes` plutôt que le nombre de lignes : une table à 45 colonnes
 * et une table à 7 n'ont pas la même marge.
 */
const MAX_BOUND_PARAMS = 800;

function chunkSize(columnCount: number): number {
  return Math.max(1, Math.floor(MAX_BOUND_PARAMS / Math.max(1, columnCount)));
}

/**
 * Insère ou remplace des lignes.
 *
 * `INSERT OR REPLACE` et non `INSERT` : le serveur peut renvoyer une ligne déjà
 * connue, notamment quand elle a été modifiée pendant un tirage et s'est
 * déplacée vers la fin de l'ordre. La réécrire à l'identique est exactement le
 * comportement voulu.
 */
export async function upsertRows(
  table: string,
  columns: ColumnSpec[],
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;

  const names = columns.map((c) => c.name);
  const quoted = names.map((n) => `"${n}"`).join(", ");
  const size = chunkSize(names.length);

  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const placeholders = slice
      .map(() => `(${names.map(() => "?").join(", ")})`)
      .join(", ");
    const values: unknown[] = [];
    for (const row of slice) {
      for (const col of columns) values.push(coerce(row[col.name], col.kind));
    }
    await connection.runAsync(
      `INSERT OR REPLACE INTO "${table}" (${quoted}) VALUES ${placeholders}`,
      values as never[]
    );
  }
}

/** Retire des lignes par identifiant. */
export async function deleteRows(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += MAX_BOUND_PARAMS) {
    const slice = ids.slice(i, i + MAX_BOUND_PARAMS);
    await connection.runAsync(
      `DELETE FROM "${table}" WHERE "id" IN (${slice.map(() => "?").join(", ")})`,
      slice as never[]
    );
  }
}

/**
 * Vide une table tirée, et TOUTES ses tables enfants.
 *
 * ⚠ LES ENFANTS PARTENT AVEC LE PARENT, sinon ils restent orphelins pour
 * toujours. `replaceChildren` ne sait les retirer que par identifiant de
 * parent : une fois le parent effacé, plus rien ne les désigne, et aucune
 * pierre tombale ne circule pour eux (ils n'ont pas de suppression douce).
 *
 * Employé quand le PÉRIMÈTRE d'une table a changé : ni le curseur ni les
 * pierres tombales ne peuvent rattraper un tel changement, dans un sens comme
 * dans l'autre. Voir `sync/jeton-perimetre.ts`.
 */
export async function viderTable(
  table: string,
  enfants: readonly { table: string }[] = []
): Promise<void> {
  await connection.withTransactionAsync(async () => {
    for (const enfant of enfants) {
      await connection.runAsync(`DELETE FROM "${enfant.table}"`);
    }
    await connection.runAsync(`DELETE FROM "${table}"`);
  });
}

/**
 * Remplace en bloc les enfants des parents reçus.
 *
 * Les lignes de vente et les règlements n'ont pas de suppression douce côté
 * serveur : aucune pierre tombale ne circule pour eux. Les remplacer en bloc
 * est ce qui fait qu'une ligne retirée d'une vente disparaît vraiment, au lieu
 * de rester à jamais dans la base locale.
 */
export async function replaceChildren(
  child: ChildSpec,
  parentIds: string[],
  rows: Record<string, unknown>[]
): Promise<void> {
  if (parentIds.length === 0) return;

  for (let i = 0; i < parentIds.length; i += MAX_BOUND_PARAMS) {
    const slice = parentIds.slice(i, i + MAX_BOUND_PARAMS);
    await connection.runAsync(
      `DELETE FROM "${child.table}" WHERE "${child.parent_field}" IN (${slice
        .map(() => "?")
        .join(", ")})`,
      slice as never[]
    );
  }
  await upsertRows(child.table, child.columns, rows);
}
