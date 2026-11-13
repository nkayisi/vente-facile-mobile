/**
 * `relire: false` : l'envoi d'arrière-plan ne relit aucune table (lot L14).
 *
 * `push.test.ts` lit les TABLES DÉCLARÉES ; celui-ci exécute `pushOnce` avec
 * des doublures, parce que l'option ne se voit qu'à l'exécution : un envoi qui
 * relirait quand même tirerait des pages entières depuis une tâche que le
 * système peut couper à tout instant.
 */
const mockFetchManifest = jest.fn(async () => ({
  tables: [{ name: "sales", columns: [], children: [] }],
}));
const mockPullTable = jest.fn(async () => undefined);

jest.mock("expo-crypto", () => ({ randomUUID: () => "lot-1" }));
jest.mock("@/api/config", () => ({ SYNC_TIMEOUT_MS: 1000 }));
jest.mock("@/api/client", () => ({
  api: {
    post: async () => ({ results: [{ operation_id: "op1", verdict: "applied" }] }),
  },
}));
jest.mock("./outbox", () => ({
  BATCH_SIZE: 50,
  readyToSend: jest.fn(async (n: number) =>
    n === 1
      ? []
      : [{
          id: "op1", kind: "sale.create", seq: 1, dependsOn: "[]",
          occurredAt: new Date("2026-11-13T09:00:00Z"), payload: "{}", attempts: 0,
        }]
  ),
  markInflight: jest.fn(async () => undefined),
  markDone: jest.fn(async () => undefined),
  markQuarantined: jest.fn(async () => undefined),
  markBlocked: jest.fn(async () => undefined),
  scheduleRetry: jest.fn(async () => undefined),
  recoverInflight: jest.fn(async () => 0),
}));
jest.mock("./pull", () => ({
  fetchManifest: () => mockFetchManifest(),
  pullTable: (...a: unknown[]) => mockPullTable(...(a as [])),
}));

import { pushOnce } from "./push";

beforeEach(() => jest.clearAllMocks());

describe("la relecture après envoi", () => {
  it("relit les tables touchées par défaut", async () => {
    await pushOnce("d1");
    expect(mockPullTable).toHaveBeenCalled();
  });

  it("ne relit RIEN quand l'envoi vient de l'arrière-plan", async () => {
    await pushOnce("d1", { relire: false });
    expect(mockFetchManifest).not.toHaveBeenCalled();
    expect(mockPullTable).not.toHaveBeenCalled();
  });
});
