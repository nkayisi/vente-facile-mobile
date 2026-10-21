/**
 * Le logo ne doit être téléchargé QU'UNE FOIS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ `Image.getSize` FAIT SA PROPRE REQUÊTE RÉSEAU.                              │
 * │                                                                              │
 * │ `proportionDe` recevait l'URL DISTANTE, alors que `downloadFileAsync` venait │
 * │ d'écrire les mêmes octets sur le disque : chaque chargement coûtait DEUX     │
 * │ téléchargements. Un logo de deux mégaoctets - le plafond `TAILLE_MAX` - en   │
 * │ valait donc quatre par démarrage à froid, sur les liens 2G que ce produit    │
 * │ vise, avant que le premier ticket ne sorte.                                  │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ SANS CES DOUBLURES, LE `require` PARESSEUX LÈVE ET TOUT PASSE AU VERT. C'est
 * le piège déjà payé sur les pilotes d'impression : un module qui se dégrade en
 * `null` fait passer le chemin sans rien démontrer.
 */
const mockGetSize = jest.fn();
const mockDownload = jest.fn();
const mockDelete = jest.fn();

jest.mock("react-native", () => ({
  Image: { getSize: (...a: unknown[]) => mockGetSize(...a) },
}));

jest.mock("expo-file-system", () => ({
  Directory: class {
    exists = true;
    create() {}
  },
  File: { downloadFileAsync: (...a: unknown[]) => mockDownload(...a) },
  Paths: { cache: "/cache" },
}));

jest.mock("@/api/config", () => ({ API_BASE_URL: "https://vf.test/api/v1" }));

import { chargerLogo, urlDuLogo } from "./load-logo";

const URL_DISTANTE = "https://vf.test/media/logos/boutique.png";

function fichierSimule(uri = "file:///cache/logos/boutique.png") {
  return {
    uri,
    exists: true,
    size: 1024,
    base64: () => Promise.resolve("AAAA"),
    delete: mockDelete,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDownload.mockResolvedValue(fichierSimule());
  mockGetSize.mockImplementation(
    (_uri: string, ok: (l: number, h: number) => void) => ok(200, 100)
  );
});

describe("la mesure du logo", () => {
  it("reçoit le fichier LOCAL, jamais l'URL distante", async () => {
    await chargerLogo("/media/logos/boutique.png");

    expect(mockGetSize).toHaveBeenCalledTimes(1);
    const [vise] = mockGetSize.mock.calls[0];
    expect(vise).toBe("file:///cache/logos/boutique.png");
    expect(vise).not.toBe(URL_DISTANTE);
  });

  it("ne télécharge QU'UNE fois", async () => {
    await chargerLogo("/media/logos/boutique.png");
    expect(mockDownload).toHaveBeenCalledTimes(1);
    //: Et rien de ce qui est mesuré ne porte un schéma réseau : c'est le
    //: contrôle qui attrape un retour à `url`.
    for (const [vise] of mockGetSize.mock.calls) {
      expect(String(vise)).not.toMatch(/^https?:/);
    }
  });

  it("rend bien le logo, avec sa proportion", async () => {
    const logo = await chargerLogo("/media/logos/boutique.png");
    expect(logo).toEqual({
      dataUrl: "data:image/png;base64,AAAA",
      format: "PNG",
      aspectRatio: 2,
    });
  });

  it("une mesure impossible rend `null` plutôt que d'écraser le logo", async () => {
    //: Un rapport faux ferait sortir un logo écrasé ou débordant de la bande
    //: imprimée : mieux vaut aucun logo.
    mockGetSize.mockImplementation(
      (_uri: string, _ok: unknown, ko: () => void) => ko()
    );
    expect(await chargerLogo("/media/logos/boutique.png")).toBeNull();
  });

  it("un logo trop gros est écarté SANS être mesuré", async () => {
    mockDownload.mockResolvedValue({ ...fichierSimule(), size: 5 * 1024 * 1024 });
    expect(await chargerLogo("/media/logos/boutique.png")).toBeNull();
    expect(mockGetSize).not.toHaveBeenCalled();
  });

  it("un format inconnu n'atteint même pas le réseau", async () => {
    //: On ne devine pas le type d'une image, et le modèle n'en déclare que deux.
    expect(await chargerLogo("/media/logos/boutique.svg")).toBeNull();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("le fichier de cache est nettoyé", async () => {
    await chargerLogo("/media/logos/boutique.png");
    expect(mockDelete).toHaveBeenCalled();
  });
});

describe("l'URL du logo", () => {
  it("laisse une URL absolue telle quelle", () => {
    expect(urlDuLogo("https://exemple.test/media/logo.png")).toBe(
      "https://exemple.test/media/logo.png"
    );
    expect(urlDuLogo("http://exemple.test/logo.png")).toBe("http://exemple.test/logo.png");
  });

  it("préfixe un chemin RELATIF, et ce n'est pas défensif", () => {
    // Le serializer rend un chemin relatif quand il n'a pas de requête en
    // contexte, et c'est le cas de la charge utile de session.
    const u = urlDuLogo("/media/organizations/logos/x.png");
    expect(u).toMatch(/^https?:\/\//);
    expect(u).toMatch(/\/media\/organizations\/logos\/x\.png$/);
    // Le préfixe ne porte PAS `/api/v1` : un média n'est pas un endpoint.
    expect(u).not.toMatch(/\/api\/v1/);
  });

  it("ajoute la barre manquante plutôt que de coller les deux morceaux", () => {
    expect(urlDuLogo("media/x.png")).toMatch(/\/media\/x\.png$/);
    expect(urlDuLogo("media/x.png")).not.toMatch(/[^/]media/);
  });

  it("rend `undefined` quand il n'y a pas de logo", () => {
    expect(urlDuLogo(null)).toBeUndefined();
    expect(urlDuLogo(undefined)).toBeUndefined();
    expect(urlDuLogo("")).toBeUndefined();
  });
});
