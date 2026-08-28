/**
 * Tirage des données depuis le serveur.
 *
 * Une table à la fois, page par page, en rebouclant tant que le serveur annonce
 * qu'il en reste. Le point de reprise n'avance qu'une fois la table épuisée :
 * c'est ce qui distingue « j'ai tout reçu » de « la connexion a lâché au
 * milieu », deux situations que l'ancienne synchronisation confondait.
 */
import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import { connection } from "@/db/client";

import { deleteRows, replaceChildren, upsertRows } from "./ingest";
import { readState, writeState } from "./state";
import type { Manifest, PullPage, PullProgress, TableSpec } from "./types";

/** Le manifeste est demandé une fois par cycle, il ne change pas en cours de route. */
export async function fetchManifest(withCounts = false): Promise<Manifest> {
  return api.get<Manifest>(
    `/sync/pull/manifest/${withCounts ? "?counts=1" : ""}`
  );
}

interface PullOptions {
  onProgress?: (progress: PullProgress) => void;
  /** Permet d'interrompre proprement : l'écran quitté, on arrête. */
  signal?: AbortSignal;
  pageSize?: number;
}

/**
 * Tire une table jusqu'au bout.
 *
 * Retourne le nombre de lignes reçues. Une interruption laisse le point de
 * reprise sur la dernière page RÉUSSIE : reprendre ne rejoue rien et ne saute
 * rien.
 */
export async function pullTable(
  spec: TableSpec,
  options: PullOptions & { received?: (n: number) => void } = {}
): Promise<number> {
  const { signal, pageSize = 500 } = options;
  const state = await readState(spec.name);

  let cursor = state?.cursor ?? null;
  let deletedCursor = state?.deletedCursor ?? null;
  let total = 0;

  for (;;) {
    if (signal?.aborted) return total;

    const params = new URLSearchParams({
      table: spec.name,
      limit: String(pageSize),
    });
    if (cursor) params.set("cursor", cursor);
    if (deletedCursor) params.set("deleted_cursor", deletedCursor);

    let page: PullPage;
    try {
      page = await api.get<PullPage>(`/sync/pull/?${params.toString()}`, { signal });
    } catch (error) {
      // On NE touche PAS au point de reprise : la table reprendra où elle en
      // était. Une erreur ne doit jamais faire sauter une fenêtre de données.
      await writeState(spec.name, {
        lastError: error instanceof ApiError ? error.message : String(error),
      });
      throw error;
    }

    // Tout ce qu'une page contient s'écrit ensemble, ou pas du tout. Une
    // vente sans ses lignes est pire qu'une vente absente.
    await connection.withTransactionAsync(async () => {
      await upsertRows(spec.name, spec.columns, page.rows);

      for (const child of spec.children) {
        const parentIds = page.rows.map((row) => String(row.id));
        const childRows = page.rows.flatMap(
          (row) => (row[child.name] as Record<string, unknown>[]) ?? []
        );
        await replaceChildren(child, parentIds, childRows);
      }

      if (page.deleted_ids.length) {
        await deleteRows(spec.name, page.deleted_ids);
      }
    });

    total += page.rows.length;
    cursor = page.next_cursor;
    deletedCursor = page.next_deleted_cursor;

    // Le point de reprise avance page par page : une coupure au milieu d'un
    // catalogue de 20 000 produits ne fait pas tout recommencer.
    await writeState(spec.name, {
      cursor,
      deletedCursor,
      hasMore: page.has_more,
      lastError: null,
    });

    options.received?.(page.rows.length);
    if (!page.has_more) break;
  }

  await writeState(spec.name, {
    hasMore: false,
    lastFullSyncAt: new Date(),
    lastError: null,
    rowCount: (state?.rowCount ?? 0) + total,
  });
  return total;
}

/**
 * Tire toutes les tables, dans l'ordre du manifeste.
 *
 * L'ordre porte du sens : l'organisation, les moyens de paiement, les produits
 * et les stocks d'abord, parce que le point de vente s'ouvre dès qu'ils sont
 * là. Le reste continue derrière.
 */
export async function pullAll(options: PullOptions = {}): Promise<{
  tables: number;
  rows: number;
  interrupted: boolean;
}> {
  const manifest = await fetchManifest(true);
  const expectedTotal = manifest.tables.reduce(
    (sum, t) => sum + (t.row_count ?? 0),
    0
  );

  let receivedTotal = 0;
  let done = 0;

  for (const [index, spec] of manifest.tables.entries()) {
    if (options.signal?.aborted) {
      return { tables: done, rows: receivedTotal, interrupted: true };
    }

    let received = 0;
    const report = () =>
      options.onProgress?.({
        table: spec.name,
        index: index + 1,
        tableCount: manifest.tables.length,
        received,
        expected: spec.row_count,
        receivedTotal,
        expectedTotal: expectedTotal || null,
      });

    report();
    await pullTable(spec, {
      ...options,
      received: (n) => {
        received += n;
        receivedTotal += n;
        report();
      },
    });
    done += 1;
  }

  return { tables: done, rows: receivedTotal, interrupted: false };
}
