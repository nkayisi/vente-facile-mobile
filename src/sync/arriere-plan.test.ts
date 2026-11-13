/**
 * La tâche de poussée d'arrière-plan (lot L14).
 *
 * Ce qui compte ici n'est pas la décision - elle est pure et éprouvée dans
 * `decision-poussee.test.ts` - mais le CÂBLAGE : qu'une abstention ne fasse
 * aucun appel réseau, qu'une poussée parte sous le verrou, sans relecture, et
 * pour l'organisation de l'instantané.
 */
const mockRegister = jest.fn(async () => undefined);
const mockUnregister = jest.fn(async () => undefined);
const mockIsRegistered = jest.fn(async () => false);
const mockStatus = jest.fn(async () => 2);
const mockGetFirst = jest.fn(async () => ({ n: 3 }));
const mockReadTokens = jest.fn(async (): Promise<unknown> => ({ access: "a", refresh: "r" }));
const mockReadSnapshot = jest.fn(async (): Promise<unknown> => ({
  user: { id: "u1" },
  organization: { id: "o1" },
  device: { id: "d1" },
}));
const mockEstampille = jest.fn(async (): Promise<unknown> => ({ userId: "u1", organizationId: "o1" }));
const mockReady = jest.fn(async (): Promise<unknown[]> => [{ id: "op1" }]);
const mockPushAll = jest.fn(async () => ({ sent: 1 }));
const mockSetOrg = jest.fn();
let mockVerrouLibre = true;

// ⚠ `defineTask` est créé DANS la fabrique : il est appelé au chargement du
//   module, avant que les `const` de ce fichier n'existent.
jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: (...a: unknown[]) => mockIsRegistered(...(a as [])),
}));
jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: () => mockStatus(),
  registerTaskAsync: (...a: unknown[]) => mockRegister(...(a as [])),
  unregisterTaskAsync: (...a: unknown[]) => mockUnregister(...(a as [])),
}));
jest.mock("@/db/client", () => ({ connection: { getFirstAsync: () => mockGetFirst() } }));
jest.mock("../../drizzle/migrations", () => ({
  __esModule: true,
  default: { journal: { entries: [1, 2, 3] }, migrations: {} },
}));
jest.mock("@/session/storage", () => ({
  readTokens: () => mockReadTokens(),
  readSnapshot: () => mockReadSnapshot(),
}));
jest.mock("@/session/estampille", () => ({ lireEstampille: () => mockEstampille() }));
jest.mock("./outbox", () => ({ readyToSend: () => mockReady() }));
jest.mock("./push", () => ({ pushAll: (...a: unknown[]) => mockPushAll(...(a as [])) }));
jest.mock("./verrou", () => ({
  avecVerrou: async (fn: () => Promise<unknown>) => (mockVerrouLibre ? fn() : null),
}));
jest.mock("@/api/client", () => ({ setOrganizationId: (...a: unknown[]) => mockSetOrg(...a) }));

import * as TaskManager from "expo-task-manager";

import {
  executerPoussee,
  inscrireTachePoussee,
  retirerTachePoussee,
  TACHE_POUSSEE,
} from "./arriere-plan";

// Relevé AVANT tout `clearAllMocks` : l'appel a eu lieu à l'import.
const definitions = (TaskManager.defineTask as jest.Mock).mock.calls.slice();

beforeEach(() => {
  jest.clearAllMocks();
  mockVerrouLibre = true;
  mockGetFirst.mockResolvedValue({ n: 3 });
  mockReadTokens.mockResolvedValue({ access: "a", refresh: "r" });
  mockEstampille.mockResolvedValue({ userId: "u1", organizationId: "o1" });
  mockReady.mockResolvedValue([{ id: "op1" }]);
  mockIsRegistered.mockResolvedValue(false);
  mockStatus.mockResolvedValue(2);
});

describe("la tâche de poussée", () => {
  it("est définie au CHARGEMENT du module, sous son nom", () => {
    // Sans appel au chargement, la tâche n'existerait pas au réveil du système.
    expect(definitions).toEqual([[TACHE_POUSSEE, executerPoussee]]);
  });

  it("pousse SANS relecture, pour l'organisation de l'instantané", async () => {
    expect(await executerPoussee()).toBe(1);
    expect(mockSetOrg).toHaveBeenCalledWith("o1");
    expect(mockPushAll).toHaveBeenCalledWith("d1", { relire: false });
  });

  it("une base d'un autre compte : aucun appel, aucune organisation posée", async () => {
    mockEstampille.mockResolvedValue({ userId: "u2", organizationId: "o1" });
    expect(await executerPoussee()).toBe(1);
    expect(mockPushAll).not.toHaveBeenCalled();
    expect(mockSetOrg).not.toHaveBeenCalled();
  });

  it("un schéma en retard : le journal n'est même pas interrogé", async () => {
    mockGetFirst.mockResolvedValue({ n: 2 });
    await executerPoussee();
    expect(mockReady).not.toHaveBeenCalled();
    expect(mockPushAll).not.toHaveBeenCalled();
  });

  it("des jetons illisibles : aucun appel réseau", async () => {
    mockReadTokens.mockRejectedValue(new Error("trousseau fermé"));
    await executerPoussee();
    expect(mockPushAll).not.toHaveBeenCalled();
  });

  it("un cycle déjà en cours n'est pas un échec", async () => {
    mockVerrouLibre = false;
    expect(await executerPoussee()).toBe(1);
  });

  it("une panne d'envoi rend « échec », sans lever", async () => {
    mockPushAll.mockRejectedValueOnce(new Error("réseau"));
    expect(await executerPoussee()).toBe(2);
  });
});

describe("l'inscription", () => {
  it("s'inscrit au plancher de quinze minutes, une seule fois", async () => {
    await inscrireTachePoussee();
    expect(mockRegister).toHaveBeenCalledWith(TACHE_POUSSEE, { minimumInterval: 15 });
    mockIsRegistered.mockResolvedValue(true);
    mockRegister.mockClear();
    await inscrireTachePoussee();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("ne s'inscrit pas quand le système refuse l'arrière-plan", async () => {
    mockStatus.mockResolvedValue(1);
    await inscrireTachePoussee();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("se retire si elle est inscrite", async () => {
    mockIsRegistered.mockResolvedValue(true);
    await retirerTachePoussee();
    expect(mockUnregister).toHaveBeenCalledWith(TACHE_POUSSEE);
  });
});
