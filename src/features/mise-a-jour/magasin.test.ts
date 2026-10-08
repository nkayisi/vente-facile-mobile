/**
 * L'ouverture du magasin.
 *
 * ⚠ Ce que ce fichier protège avant tout : l'ABSENCE de `canOpenURL`. Le
 * manifeste engendré ne déclare `<queries>` que pour `https`, donc
 * `canOpenURL("market://…")` rend faux même sur un terminal qui a le Play Store,
 * et le bouton disparaîtrait sur exactement les appareils capables de mettre à
 * jour. C'est une régression qu'aucun type ne verrait.
 */
const mockOpenURL = jest.fn();
const mockCanOpenURL = jest.fn();

// ⚠ LES DOUBLURES SONT APPELÉES PAR UNE FLÈCHE, JAMAIS POSÉES DIRECTEMENT.
// `jest.mock` est hissé au-dessus des imports, donc la fabrique s'exécute quand
// `react-native` est requis pour la première fois - avant que ces deux `const`
// ne soient initialisés. Posée en direct, `openURL` vaudrait `undefined`,
// l'appel lèverait, le `catch` de `ouvrirMagasin` l'avalerait, et le test
// échouerait en accusant le code plutôt que son propre harnais.
jest.mock("react-native", () => ({
  Linking: {
    openURL: (url: string) => mockOpenURL(url),
    canOpenURL: (url: string) => mockCanOpenURL(url),
  },
}));

// eslint-disable-next-line import/first
import { ouvrirMagasin } from "./magasin";

beforeEach(() => {
  mockOpenURL.mockReset();
  mockCanOpenURL.mockReset();
});

describe("ouvrirMagasin", () => {
  it("s'arrête à la PREMIÈRE adresse qui s'ouvre", () => {
    mockOpenURL.mockResolvedValue(undefined);
    return ouvrirMagasin(["market://x", "https://y"]).then((ouvert) => {
      expect(ouvert).toBe(true);
      expect(mockOpenURL).toHaveBeenCalledTimes(1);
      expect(mockOpenURL).toHaveBeenCalledWith("market://x");
    });
  });

  it("passe à la suivante quand une adresse est refusée", async () => {
    // Un `market://` refusé est le cas ORDINAIRE d'un terminal de comptoir sans
    // Play Store, pas une anomalie.
    mockOpenURL
      .mockRejectedValueOnce(new Error("no activity"))
      .mockResolvedValueOnce(undefined);

    await expect(ouvrirMagasin(["market://x", "https://y"])).resolves.toBe(true);
    expect(mockOpenURL).toHaveBeenNthCalledWith(2, "https://y");
  });

  it("rend false quand aucune adresse ne répond", async () => {
    // L'appelant NOMME alors l'échec, plutôt que de laisser croire à un bouton
    // en panne.
    mockOpenURL.mockRejectedValue(new Error("no activity"));
    await expect(ouvrirMagasin(["market://x", "https://y"])).resolves.toBe(false);
    expect(mockOpenURL).toHaveBeenCalledTimes(2);
  });

  it("n'appelle RIEN sur une liste vide", async () => {
    await expect(ouvrirMagasin([])).resolves.toBe(false);
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it("n'appelle JAMAIS canOpenURL", async () => {
    mockOpenURL.mockResolvedValue(undefined);
    await ouvrirMagasin(["market://x"]);
    mockOpenURL.mockRejectedValue(new Error("no activity"));
    await ouvrirMagasin(["market://x", "https://y"]);
    expect(mockCanOpenURL).not.toHaveBeenCalled();
  });
});
