/**
 * Ce que le terminal dit au serveur en entrant et en sortant.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA DÉCONNEXION POSTAIT UN CORPS VIDE.                                    │
 * │                                                                          │
 * │ Le serveur ne révoque que ce qu'on lui donne : le jeton de               │
 * │ rafraîchissement restait valable sept jours, et l'appareil restait       │
 * │ ACTIF, sur un téléphone qui venait d'en effacer la clé. Rien ne le       │
 * │ signalait - la déconnexion « marchait », côté écran.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const mockPost = jest.fn();
jest.mock("@/api/client", () => ({
  api: { post: (...a: unknown[]) => mockPost(...a) },
  request: jest.fn(),
  setOrganizationId: jest.fn(),
}));
jest.mock("@/data/reglages", () => ({
  identifiantInstallation: () => Promise.resolve("installation-1"),
}));
jest.mock("@/features/mise-a-jour/version-installee", () => ({
  versionInstallee: () => "1.0.0",
}));
jest.mock("expo-device", () => ({ modelName: "NB55", osVersion: "13" }));
const mockStockage = {
  jetons: { access: "a", refresh: "r-1" } as { access: string; refresh: string } | null,
  appareil: "d-1" as string | null,
};
jest.mock("./storage", () => ({
  clearSession: jest.fn(() => Promise.resolve()),
  clearTokens: jest.fn(),
  readDeviceToken: () => Promise.resolve(mockStockage.appareil),
  readSnapshot: jest.fn(),
  readTokens: () => Promise.resolve(mockStockage.jetons),
  writeDeviceToken: jest.fn(() => Promise.resolve()),
  writeSnapshot: jest.fn(() => Promise.resolve()),
  writeTokens: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line import/first
import { enrollDevice, logout } from "./session";

beforeEach(() => {
  mockPost.mockReset();
  mockStockage.jetons = { access: "a", refresh: "r-1" };
  mockStockage.appareil = "d-1";
});

describe("la déconnexion", () => {
  it("transmet le jeton de rafraîchissement ET le jeton d'appareil", async () => {
    mockPost.mockResolvedValue({});
    await logout();
    expect(mockPost).toHaveBeenCalledWith("/auth/logout/", {
      refresh: "r-1",
      device_token: "d-1",
    });
  });

  it("n'envoie pas de clé vide quand un jeton manque", async () => {
    mockStockage.appareil = null;
    mockPost.mockResolvedValue({});
    await logout();
    expect(mockPost).toHaveBeenCalledWith("/auth/logout/", { refresh: "r-1" });
  });

  it("aboutit même quand le serveur est injoignable", async () => {
    mockPost.mockRejectedValue(new Error("réseau"));
    await expect(logout()).resolves.toBeUndefined();
  });
});

describe("l'enrôlement", () => {
  it("dit au serveur de quelle installation il s'agit", async () => {
    mockPost.mockResolvedValue({
      access: "a", refresh: "r", device_token: "d",
      user: {}, organization: {}, membership: {},
    });
    await enrollDevice("org-1").catch(() => undefined);
    expect(mockPost.mock.calls[0][0]).toBe("/auth/devices/enroll/");
    expect(mockPost.mock.calls[0][1]).toMatchObject({ installation_id: "installation-1" });
  });
});
