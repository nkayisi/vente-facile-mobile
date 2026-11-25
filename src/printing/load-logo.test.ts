/**
 * Le logo des tickets : lu par l'API, gardé hors ligne, jamais retenu sur un échec.
 *
 * ⚠ CE QUI EST TENU, et pourquoi chaque cas compte :
 * - une réponse incomplète vaut « pas de logo » (jamais un format ni une
 *   proportion inventés, qui feraient sortir le logo écrasé) ;
 * - un ÉCHEC RÉSEAU n'est pas retenu comme « chargé » : c'était le défaut qui
 *   empêchait le logo de revenir avant le prochain lancement ;
 * - ce qui est gardé ne vaut que pour SON logo : un logo changé (nom neuf
 *   côté serveur) ne ressort jamais depuis l'ancien.
 */
const mockGet = jest.fn();
const mockLire = jest.fn();
const mockEcrire = jest.fn();

jest.mock("@/api/client", () => ({ api: { get: (...a: unknown[]) => mockGet(...a) } }));
jest.mock("@/api/config", () => ({ API_BASE_URL: "https://vf.test/api/v1" }));
jest.mock("@/data/reglages", () => ({
  lireReglage: (...a: unknown[]) => mockLire(...a),
  ecrireReglage: (...a: unknown[]) => mockEcrire(...a),
}));

// eslint-disable-next-line import/first
import { assurerLogo, CLE_LOGO_RECU } from "./assurer-logo";
// eslint-disable-next-line import/first
import { logoDeLaReponse, urlDuLogo } from "./load-logo";
// eslint-disable-next-line import/first
import { logoCourant, oublierLeLogo } from "./logo-courant";
// eslint-disable-next-line import/first
import { cleDuLogo, logoGardePour } from "./logo-garde";

const REPONSE = {
  path: "organizations/logos/logo-a.png",
  data_url: "data:image/png;base64,AAAA",
  format: "PNG",
  width: 600,
  height: 200,
};

beforeEach(() => {
  jest.clearAllMocks();
  oublierLeLogo();
  mockLire.mockResolvedValue(null);
  mockEcrire.mockResolvedValue(undefined);
});

describe("la réponse du serveur", () => {
  it("rend un PNG à la proportion mesurée", () => {
    expect(logoDeLaReponse(REPONSE)).toEqual({
      dataUrl: "data:image/png;base64,AAAA",
      format: "PNG",
      aspectRatio: 3,
    });
  });

  it("sans logo, ou incomplète, elle ne rend RIEN", () => {
    expect(logoDeLaReponse({ path: null })).toBeNull();
    expect(logoDeLaReponse({ ...REPONSE, width: 0 })).toBeNull();
    expect(logoDeLaReponse({ ...REPONSE, data_url: "https://vf.test/x.png" })).toBeNull();
    expect(logoDeLaReponse(null)).toBeNull();
  });
});

describe("ce qui est gardé", () => {
  it("ne vaut que pour SON logo", () => {
    const cle = cleDuLogo("o1", "/media/organizations/logos/logo-a.png")!;
    const garde = { cle, logo: logoDeLaReponse(REPONSE) };
    expect(logoGardePour(garde, cle)).toEqual(garde.logo);
    expect(logoGardePour(garde, cleDuLogo("o1", "/media/organizations/logos/logo-b.png")!)).toBeUndefined();
    expect(logoGardePour({ cle, logo: null }, cle)).toBeNull();
  });

  it("un établissement sans logo n'a pas de clé", () => {
    expect(cleDuLogo("o1", null)).toBeNull();
    expect(cleDuLogo(null, "/media/x.png")).toBeNull();
  });
});

describe("assurerLogo", () => {
  it("charge depuis le serveur, pose, et garde pour le hors-ligne", async () => {
    mockGet.mockResolvedValue(REPONSE);
    await assurerLogo("o1", "/media/organizations/logos/logo-a.png");
    expect(mockGet).toHaveBeenCalledWith("/organizations/o1/receipt-logo/");
    expect(logoCourant()?.aspectRatio).toBe(3);
    expect(mockEcrire).toHaveBeenCalledWith(CLE_LOGO_RECU, {
      cle: "o1|/media/organizations/logos/logo-a.png",
      logo: logoCourant(),
    });
  });

  it("hors ligne, il imprime ce qui est gardé, sans réseau", async () => {
    const cle = "o1|/media/organizations/logos/logo-a.png";
    mockLire.mockResolvedValue({ cle, logo: logoDeLaReponse(REPONSE) });
    await assurerLogo("o1", "/media/organizations/logos/logo-a.png");
    expect(mockGet).not.toHaveBeenCalled();
    expect(logoCourant()?.dataUrl).toBe(REPONSE.data_url);
  });

  it("un échec réseau n'est PAS retenu : la demande suivante réessaie", async () => {
    mockGet.mockRejectedValueOnce(new Error("réseau")).mockResolvedValueOnce(REPONSE);
    await assurerLogo("o1", "/media/organizations/logos/logo-a.png");
    expect(logoCourant()).toBeNull();
    await assurerLogo("o1", "/media/organizations/logos/logo-a.png");
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(logoCourant()?.aspectRatio).toBe(3);
  });

  it("une fois chargé, il ne redemande rien", async () => {
    mockGet.mockResolvedValue(REPONSE);
    await assurerLogo("o1", "/media/organizations/logos/logo-a.png");
    await assurerLogo("o1", "/media/organizations/logos/logo-a.png");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("deux demandes simultanées n'en font qu'une", async () => {
    mockGet.mockResolvedValue(REPONSE);
    await Promise.all([
      assurerLogo("o1", "/media/organizations/logos/logo-a.png"),
      assurerLogo("o1", "/media/organizations/logos/logo-a.png"),
    ]);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("un logo retiré efface ce qui était imprimé", async () => {
    mockGet.mockResolvedValue(REPONSE);
    await assurerLogo("o1", "/media/organizations/logos/logo-a.png");
    await assurerLogo("o1", null);
    expect(logoCourant()).toBeNull();
    expect(mockEcrire).toHaveBeenLastCalledWith(CLE_LOGO_RECU, null);
  });

  it("un chargement lent de la boutique PRÉCÉDENTE ne repose pas son logo", async () => {
    // La boutique A répond APRÈS la boutique B : sans garde, le ticket de B
    // sortirait sous le logo de A, et `local_settings` garderait celui de A.
    let repondreA: (r: unknown) => void = () => {};
    mockGet
      .mockImplementationOnce(() => new Promise((ok) => (repondreA = ok)))
      .mockResolvedValueOnce({ ...REPONSE, path: "b.png", width: 200, height: 200 });

    const a = assurerLogo("oA", "/media/a.png");
    await new Promise((ok) => setImmediate(ok));
    await assurerLogo("oB", "/media/b.png");
    expect(logoCourant()?.aspectRatio).toBe(1);

    repondreA(REPONSE);
    await a;
    expect(logoCourant()?.aspectRatio).toBe(1);
    expect(mockEcrire).not.toHaveBeenCalledWith(
      CLE_LOGO_RECU,
      expect.objectContaining({ cle: "oA|/media/a.png" })
    );
  });

  it("un logo retiré pendant son chargement ne revient pas", async () => {
    let repondre: (r: unknown) => void = () => {};
    mockGet.mockImplementationOnce(() => new Promise((ok) => (repondre = ok)));
    const enCours = assurerLogo("o1", "/media/a.png");
    await new Promise((ok) => setImmediate(ok));
    await assurerLogo("o1", null);
    repondre(REPONSE);
    await enCours;
    expect(logoCourant()).toBeNull();
  });

  it("sans logo et rien de chargé, chaque réveil n'écrit RIEN", async () => {
    // Appelée à chaque synchronisation : une écriture sans objet réveillerait
    // tous les écrans qui lisent `local_settings`.
    await assurerLogo("o1", null);
    await assurerLogo("o1", null);
    expect(mockEcrire).not.toHaveBeenCalled();
  });
});

describe("urlDuLogo, pour l'aperçu", () => {
  it("préfixe un chemin relatif de la racine de l'API, sans `/api/v1`", () => {
    expect(urlDuLogo("/media/organizations/logos/x.png")).toBe(
      "https://vf.test/media/organizations/logos/x.png"
    );
    expect(urlDuLogo("https://cdn.test/x.png")).toBe("https://cdn.test/x.png");
    expect(urlDuLogo(null)).toBeUndefined();
  });
});
