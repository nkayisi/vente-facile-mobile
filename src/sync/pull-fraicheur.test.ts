/**
 * Ce qu'une table SAUTÉE par la sonde apprend quand même.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « RIEN DE NEUF » EST UNE CONFIRMATION, ET ELLE SE PERDAIT.               │
 * │                                                                          │
 * │ La sonde `pull/changed/` (session 2026-08-29) a divisé par trente-deux   │
 * │ le coût d'une synchronisation sans changement. Mais une table sautée ne  │
 * │ touchait plus à son état du tout : l'écran de synchronisation annonçait  │
 * │ donc « Complet il y a 3 j » sur TRENTE tables sur trente et une, à       │
 * │ l'instant où la synchronisation venait de réussir, et le comptoir        │
 * │ annonçait un verrou d'inventaire « arrêté au 30 août » trente secondes   │
 * │ après l'avoir vérifié.                                                   │
 * │                                                                          │
 * │ Un chiffre de fraîcheur faux est pire qu'aucun : il fait appuyer sur     │
 * │ « Synchroniser » sans effet, et il empêche de distinguer « à jour » de   │
 * │ « jamais synchronisé », qui appellent deux gestes opposés.               │
 * │                                                                          │
 * │ Le CURSEUR, lui, ne bouge pas : l'avancer sans avoir tiré sauterait des  │
 * │ lignes pour toujours. C'est ce que ces tests séparent.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Réponses de l'API, par chemin. */
const mockApi = {
  changed: [] as string[],
  tables: [] as { name: string }[],
};
/** L'état local simulé, et ce que le tirage y écrit. */
const mockEtats = new Map<string, Record<string, unknown>>();

jest.mock("@/api/client", () => ({
  api: {
    get: jest.fn(async () => ({ tables: mockApi.tables, schema_version: 1 })),
    post: jest.fn(async () => ({ changed: mockApi.changed, tables: mockApi.tables.length })),
  },
}));
jest.mock("@/api/errors", () => ({ ApiError: class extends Error {} }));
jest.mock("@/db/client", () => ({ connection: {} }));
jest.mock("./ingest", () => ({
  deleteRows: jest.fn(), replaceChildren: jest.fn(), upsertRows: jest.fn(),
}));
jest.mock("./state", () => ({
  readAllStates: jest.fn(async () => [...mockEtats.values()]),
  readState: jest.fn(async (t: string) => mockEtats.get(t) ?? null),
  writeState: jest.fn(async (t: string, patch: Record<string, unknown>) => {
    mockEtats.set(t, { ...(mockEtats.get(t) ?? { table: t }), ...patch });
  }),
}));

import { pullAll } from "./pull";

const AVANT_HIER = new Date(2026, 7, 29, 14, 48);

beforeEach(() => {
  mockEtats.clear();
  mockApi.tables = [{ name: "inventory_sessions" }, { name: "products" }];
  mockEtats.set("inventory_sessions", {
    table: "inventory_sessions",
    cursor: "c-inv",
    deletedCursor: "d-inv",
    hasMore: false,
    lastFullSyncAt: AVANT_HIER,
  });
  mockEtats.set("products", {
    table: "products",
    cursor: "c-prod",
    deletedCursor: "d-prod",
    hasMore: false,
    lastFullSyncAt: AVANT_HIER,
  });
});

describe("une table sans changement", () => {
  it("voit sa FRAÎCHEUR avancer", async () => {
    mockApi.changed = [];
    const avant = Date.now();

    const bilan = await pullAll();

    expect(bilan.skipped).toBe(2);
    const etat = mockEtats.get("inventory_sessions")!;
    expect((etat.lastFullSyncAt as Date).getTime()).toBeGreaterThanOrEqual(avant);
  });

  it("garde son CURSEUR intact", async () => {
    mockApi.changed = [];

    await pullAll();

    // L'avancer sans avoir tiré sauterait des lignes pour toujours : c'est le
    // défaut exact de l'ancien `/sync/`, et il ne doit pas revenir par la
    // porte de la fraîcheur.
    const etat = mockEtats.get("inventory_sessions")!;
    expect(etat.cursor).toBe("c-inv");
    expect(etat.deletedCursor).toBe("d-inv");
  });

  it("efface son erreur précédente", async () => {
    mockEtats.set("products", { ...mockEtats.get("products")!, lastError: "coupure" });
    mockApi.changed = [];

    await pullAll();

    // Le serveur vient de répondre pour cette table : conserver l'erreur de la
    // fois d'avant ferait porter un rouge permanent à une table saine.
    expect(mockEtats.get("products")!.lastError).toBeNull();
  });

  it("ne touche à rien quand la sonde est INDISPONIBLE", async () => {
    // Sonde en échec : on retombe sur « tirer tout », et la fraîcheur se
    // gagne alors par le tirage réel, pas par une confirmation qu'on n'a pas.
    const { api } = jest.requireMock("@/api/client");
    api.post.mockRejectedValueOnce(new Error("hors ligne"));
    api.get.mockResolvedValueOnce({ tables: [], schema_version: 1 });

    const bilan = await pullAll();
    expect(bilan.skipped).toBe(0);
  });
});
