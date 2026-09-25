/**
 * Doublures des modules natifs.
 *
 * On ne simule que ce qui touche le matériel : le trousseau, le hachage, la
 * biométrie. Toute la logique testée reste la vraie.
 */

// Trousseau : une carte en mémoire, remise à zéro entre les tests.
// Le préfixe `mock` n'est pas décoratif : jest hisse les `jest.mock()` au-dessus
// des déclarations, et n'autorise une fabrique à voir une variable extérieure
// que sous ce préfixe.
const mockKeychain = new Map();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k) => (mockKeychain.has(k) ? mockKeychain.get(k) : null)),
  setItemAsync: jest.fn(async (k, v) => void mockKeychain.set(k, v)),
  deleteItemAsync: jest.fn(async (k) => void mockKeychain.delete(k)),
}));

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { HEX: "hex" },
  // Hachage déterministe : le test vérifie la POLITIQUE d'essais, pas la
  // qualité cryptographique, qui n'est de toute façon pas la défense ici.
  digestStringAsync: jest.fn(async (_algo, data) => {
    let h = 0;
    for (let i = 0; i < data.length; i++) h = (h * 31 + data.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(64, "0");
  }),
  // De vrais octets aléatoires : un sel figé rendrait indémontrable la règle
  // qui veut que deux terminaux au même code n'aient pas la même empreinte.
  getRandomBytes: jest.fn((n) =>
    Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256))
  ),
  randomUUID: jest.fn(() => "00000000-0000-4000-8000-000000000000"),
}));

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  supportedAuthenticationTypesAsync: jest.fn(async () => []),
  authenticateAsync: jest.fn(async () => ({ success: false, error: "user_cancel" })),
  // Le niveau de verrou de l'APPAREIL, celui qui décide du démarrage. Par
  // défaut `NONE` : une suite qui n'en parle pas ne doit pas dépendre d'un
  // verrou qu'aucun test n'a posé.
  getEnrolledLevelAsync: jest.fn(async () => 0),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
  // ⚠ UN OBJET LITTÉRAL, JAMAIS UN RÉ-EXPORT DE L'ENUM RÉELLE.
  // `SecurityLevel.BIOMETRIC` y est un accesseur déprécié qui `console.warn` à
  // chaque lecture : la suite se couvrirait d'avertissements sans que rien
  // d'autre ne change.
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: "127.0.0.1:8081" } },
}));

jest.mock("expo-device", () => ({ modelName: "Test", osVersion: "1" }));
jest.mock("expo-application", () => ({ nativeApplicationVersion: "1.0.0" }));

global.__resetKeychain = () => mockKeychain.clear();
