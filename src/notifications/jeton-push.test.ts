/**
 * Ce que le terminal dit de la permission de notification.
 *
 * ⚠ Le cas qui compte est celui d'Android 13 : une permission jamais demandée
 * se lit `denied` avec `canAskAgain`, exactement comme après un premier refus.
 * Le réveil déclarait alors `push_refused` au serveur avant toute invite.
 */
import { Platform } from "react-native";

const mockPermissions = { status: "denied", canAskAgain: true };
const mockReglages = new Map<string, unknown>();

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: () => Promise.resolve({ ...mockPermissions }),
  requestPermissionsAsync: () => Promise.resolve({ ...mockPermissions }),
  getExpoPushTokenAsync: () => Promise.resolve({ data: "ExponentPushToken[x]" }),
  setNotificationChannelAsync: () => Promise.resolve(null),
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
}));

jest.mock("@/data/reglages", () => ({
  lireReglage: (cle: string, defaut: unknown) =>
    Promise.resolve(mockReglages.has(cle) ? mockReglages.get(cle) : defaut),
  ecrireReglage: (cle: string, valeur: unknown) => {
    mockReglages.set(cle, valeur);
    return Promise.resolve();
  },
}));

import { demanderPush, etatPush } from "./jeton-push";

beforeEach(() => {
  mockReglages.clear();
  mockPermissions.status = "denied";
  mockPermissions.canAskAgain = true;
  Platform.OS = "android";
});

describe("etatPush sur Android 13", () => {
  it("une permission jamais demandée est « à demander », pas « refusée »", async () => {
    await expect(etatPush()).resolves.toEqual({ etat: "a_demander" });
  });

  it("après une invite refusée, c'est un refus redemandable", async () => {
    await demanderPush();
    await expect(etatPush()).resolves.toEqual({ etat: "refuse" });
  });

  it("un refus définitif ne dépend pas du drapeau", async () => {
    mockPermissions.canAskAgain = false;
    await expect(etatPush()).resolves.toEqual({ etat: "refuse_definitivement" });
  });

  it("`undetermined` reste « à demander »", async () => {
    mockPermissions.status = "undetermined";
    await expect(etatPush()).resolves.toEqual({ etat: "a_demander" });
  });
});

describe("etatPush sur iOS", () => {
  it("`denied` y veut toujours dire qu'on a demandé", async () => {
    Platform.OS = "ios";
    await expect(etatPush()).resolves.toEqual({ etat: "refuse" });
  });
});
