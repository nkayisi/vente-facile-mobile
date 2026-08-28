/**
 * Rangement des secrets.
 *
 * Le défaut central de l'ancienne application était ici : après rotation, elle
 * conservait l'ANCIEN jeton de rafraîchissement, que le backend venait de
 * mettre sur liste noire. Le rafraîchissement suivant échouait, et
 * l'utilisateur était éjecté environ toutes les heures, réseau parfait compris.
 */
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
    const SecureStore = require("expo-secure-store");
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
