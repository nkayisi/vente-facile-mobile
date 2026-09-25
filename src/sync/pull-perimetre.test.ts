/**
 * Ce que le tirage fait quand le PÉRIMÈTRE d'une table change.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE DÉFAUT NE SE VOIT NULLE PART, ET C'EST LE PIRE.                      │
 * │                                                                          │
 * │ Le périmètre est appliqué AVANT le curseur. Quand il s'élargit, les      │
 * │ lignes devenues éligibles sont derrière le point de reprise : elles ne   │
 * │ descendront jamais. Et la sonde `pull/changed/` applique la MÊME         │
 * │ séquence, donc elle répond « rien de neuf » - l'écran affiche            │
 * │ « Complet, à l'instant » sur une table amputée.                          │
 * │                                                                          │
 * │ `assign_default_warehouse` élargit précisément un périmètre. La lancer   │
 * │ laissait les terminaux pires qu'avant.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Le manifeste tel que le serveur le rend : `columns` et `children` sont
    toujours là, et le tirage les déballe. */
type Spec = { name: string; scope_token?: string };
const gabarit = (s: Spec) => ({
  has_tombstones: false, row_count: null, columns: [], children: [], ...s,
});
const mockApi = {
  changed: [] as string[],
  tables: [] as Spec[],
};
const mockEtats = new Map<string, Record<string, unknown>>();
/** Ce que l'ingestion a reçu, dans l'ordre. */
const mockJournal: string[] = [];

jest.mock("@/api/client", () => ({
  api: {
    get: jest.fn(async (chemin: string) => {
      if (chemin.startsWith("/sync/pull/manifest")) {
        return { tables: mockApi.tables.map(gabarit), schema_version: 1 };
      }
      mockJournal.push(`page:${chemin.split("table=")[1]?.split("&")[0]}`);
      return {
        table: "",
        rows: [],
        deleted_ids: [],
        next_cursor: null,
        next_deleted_cursor: null,
        has_more: false,
        server_time: new Date().toISOString(),
        schema_version: 1,
      };
    }),
    post: jest.fn(async () => ({
      changed: mockApi.changed,
      tables: mockApi.tables.length,
    })),
  },
}));
jest.mock("@/api/errors", () => ({
  ApiError: class extends Error {},
  readableMessage: (brut: string) => brut,
}));
jest.mock("@/db/client", () => ({
  connection: { withTransactionAsync: async (f: () => Promise<void>) => f() },
}));
jest.mock("./ingest", () => ({
  deleteRows: jest.fn(),
  replaceChildren: jest.fn(),
  upsertRows: jest.fn(),
  viderTable: jest.fn(async (t: string) => {
    mockJournal.push(`vide:${t}`);
  }),
}));
jest.mock("./state", () => ({
  readAllStates: jest.fn(async () => [...mockEtats.values()]),
  readState: jest.fn(async (t: string) => mockEtats.get(t) ?? null),
  writeState: jest.fn(async (t: string, patch: Record<string, unknown>) => {
    mockEtats.set(t, { ...(mockEtats.get(t) ?? { table: t }), ...patch });
  }),
}));

import { pullAll } from "./pull";

beforeEach(() => {
  mockEtats.clear();
  mockJournal.length = 0;
  mockApi.changed = [];
  mockApi.tables = [{ name: "sales", scope_token: "T2" }];
  mockEtats.set("sales", {
    table: "sales",
    cursor: "c-sales",
    deletedCursor: null,
    hasMore: false,
    rowCount: 120,
    scopeToken: "T1",
    lastFullSyncAt: new Date(2026, 8, 1),
  });
});

it("un périmètre changé EFFACE la table et la retire en entier", async () => {
  await pullAll();
  expect(mockJournal).toContain("vide:sales");
  expect(mockJournal).toContain("page:sales");
  const etat = mockEtats.get("sales")!;
  expect(etat.scopeToken).toBe("T2");
});

it("le curseur repart de ZÉRO, sinon les lignes anciennes restent derrière", async () => {
  await pullAll();
  // Après le tirage complet, le curseur vaut celui de la dernière page (null
  // ici) - ce qui compte est qu'il n'ait pas gardé `c-sales`.
  expect(mockEtats.get("sales")!.cursor).not.toBe("c-sales");
});

it("LA SONDE NE PEUT PAS COURT-CIRCUITER UN CHANGEMENT DE PÉRIMÈTRE", async () => {
  // C'est l'ordre qui porte tout le correctif : une table dont le périmètre a
  // changé n'a justement « rien de neuf » à annoncer, la sonde appliquant la
  // même séquence que le tirage. Vérifier après elle, c'est ne jamais
  // vérifier.
  mockApi.changed = []; // le serveur dit « rien de neuf » sur TOUT
  await pullAll();
  expect(mockJournal).toContain("vide:sales");
  expect(mockJournal).toContain("page:sales");
});

it("un périmètre INCHANGÉ n'efface rien et laisse la sonde faire son office", async () => {
  mockApi.tables = [{ name: "sales", scope_token: "T1" }];
  mockApi.changed = [];
  const bilan = await pullAll();
  expect(mockJournal).toEqual([]);
  expect(bilan.skipped).toBe(1);
});

it("un serveur qui n'envoie pas de jeton ne déclenche RIEN", async () => {
  // Sinon la mise à jour du serveur ferait re-tirer tout le parc à chaque
  // synchronisation, indéfiniment.
  mockApi.tables = [{ name: "sales" }];
  mockApi.changed = [];
  await pullAll();
  expect(mockJournal).toEqual([]);
});

it("un terminal qui découvre le jeton l'ADOPTE sans rien effacer", async () => {
  mockEtats.set("sales", {
    table: "sales", cursor: "c-sales", hasMore: false, rowCount: 120,
    scopeToken: null,
    // ⚠ Sans lui, `fetchChangedTables` n'envoie AUCUN curseur et rend `null` :
    // la sonde est réputée indisponible, on tire tout, et le test passerait
    // pour une raison qui n'est pas la sienne.
    lastFullSyncAt: new Date(2026, 8, 1),
  });
  mockApi.changed = [];
  await pullAll();
  expect(mockJournal).toEqual([]);
  expect(mockEtats.get("sales")!.scopeToken).toBe("T2");
});
