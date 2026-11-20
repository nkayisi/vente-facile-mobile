/**
 * Rangement des secrets.
 *
 * Le défaut central de l'ancienne application était ici : après rotation, elle
 * conservait l'ANCIEN jeton de rafraîchissement, que le backend venait de
 * mettre sur liste noire. Le rafraîchissement suivant échouait, et
 * l'utilisateur était éjecté environ toutes les heures, réseau parfait compris.
 */
import * as SecureStore from "expo-secure-store";

import {
  clearSession,
  clearTokens,
  readDeviceToken,
  readSnapshot,
  readTokens,
  writeDeviceToken,
  writeSnapshot,
  writeTokens,
} from "./storage";

beforeEach(() => {
  (global as unknown as { __resetKeychain: () => void }).__resetKeychain();
});

describe("paire de jetons", () => {
  it("s'écrit et se relit d'un bloc", async () => {
    await writeTokens({ access: "A1", refresh: "R1" });
    expect(await readTokens()).toEqual({ access: "A1", refresh: "R1" });
  });

  it("une rotation remplace LES DEUX", async () => {
    await writeTokens({ access: "A1", refresh: "R1" });
    await writeTokens({ access: "A2", refresh: "R2" });

    // R1 est sur liste noire côté serveur dès qu'il a servi : le conserver
    // condamnerait la session au rafraîchissement suivant.
    expect(await readTokens()).toEqual({ access: "A2", refresh: "R2" });
  });

  it("une paire incomplète ne vaut pas une session", async () => {
    await writeTokens({ access: "A1", refresh: "R1" });
    await clearTokens();
    expect(await readTokens()).toBeNull();
  });
});

describe("instantané", () => {
  it("survit à la perte des jetons", async () => {
    await writeTokens({ access: "A1", refresh: "R1" });
    await writeSnapshot({ organization: { name: "Dépôt Bon Marché" } });

    // C'est ce qui distingue « session expirée » de « déconnecté » : l'écran
    // peut encore nommer la boutique et dire ce qui attend d'être envoyé.
    await clearTokens();

    expect(await readTokens()).toBeNull();
    expect(await readSnapshot()).toEqual({
      organization: { name: "Dépôt Bon Marché" },
    });
  });

  it("rend null plutôt que d'échouer sur un contenu illisible", async () => {
    await SecureStore.setItemAsync("vf.session_snapshot", "{ceci n'est pas du JSON");
    expect(await readSnapshot()).toBeNull();
  });
});

describe("déconnexion", () => {
  it("efface tous les secrets de session", async () => {
    await writeTokens({ access: "A1", refresh: "R1" });
    await writeDeviceToken("D1");
    await writeSnapshot({ x: 1 });

    await clearSession();

    expect(await readTokens()).toBeNull();
    expect(await readDeviceToken()).toBeNull();
    expect(await readSnapshot()).toBeNull();
  });
});

describe("Keystore en panne (carte Rockchip rk3568)", () => {
  // La doublure d'origine (jest.setup.js) range dans une carte en mémoire : on
  // la remet en place, sinon les suites suivantes écriraient dans le vide.
  const ecritureOrigine = (SecureStore.setItemAsync as jest.Mock).getMockImplementation();

  afterEach(async () => {
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(ecritureOrigine);
    await clearSession();
  });

  it("la connexion aboutit, et la session se relit", async () => {
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async () => {
      throw new Error(
        "Call to function 'ExpoSecureStore.setValueWithKeyAsync' has been rejected. Keystore operation failed"
      );
    });

    await writeTokens({ access: "A1", refresh: "R1" });
    await writeDeviceToken("D1");

    expect(await readTokens()).toEqual({ access: "A1", refresh: "R1" });
    expect(await readDeviceToken()).toBe("D1");
  });

  it("la déconnexion efface aussi ce que le repli détient", async () => {
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async () => {
      throw new Error("Keystore operation failed");
    });
    await writeTokens({ access: "A1", refresh: "R1" });

    await clearSession();

    expect(await readTokens()).toBeNull();
  });
});

it("après une panne, le Keystore resservi reprend la main à la connexion suivante", async () => {
  await writeTokens({ access: "A9", refresh: "R9" });
  expect(await SecureStore.getItemAsync("vf.access_token")).toBe("A9");
});
