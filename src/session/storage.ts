/**
 * Rangement des secrets de session.
 *
 * `expo-secure-store` s'appuie sur le Keystore Android et le Trousseau iOS :
 * les jetons ne sont jamais posés dans la base locale, qui n'est pas chiffrée.
 *
 * Ce qui N'EST PAS ici : le point de reprise de synchronisation, les
 * préférences, le thème. Ce sont des données courantes, écrites souvent, et le
 * Keystore est lent. Elles vivent dans `local_settings`.
 */
import * as SecureStore from "expo-secure-store";

const KEYS = {
  access: "vf.access_token",
  refresh: "vf.refresh_token",
  device: "vf.device_token",
  /** Identité mise en cache : c'est ce qui permet de démarrer sans réseau. */
  snapshot: "vf.session_snapshot",
} as const;

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CLÉS HÉRITÉES : ELLES NE S'ÉCRIVENT PLUS, ET ELLES DOIVENT PARTIR.      │
 * │                                                                          │
 * │ L'application tenait son propre code de déverrouillage ; c'est le verrou │
 * │ de l'appareil qui s'en charge désormais (`session/lock.ts`). Il ne       │
 * │ suffit PAS de cesser d'écrire ces clés : une empreinte de code dort dans │
 * │ le Keystore de chaque installation existante, et un marchand qui ne se   │
 * │ déconnecte jamais la garderait indéfiniment. On la retire une fois au    │
 * │ démarrage, et `clearSession` continue de les viser.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const CLES_HERITEES = [
  "vf.pin_salt",
  "vf.pin_hash",
  "vf.pin_attempts",
  "vf.pin_locked_until",
] as const;

/** Idempotente, et silencieuse : `remove` avale déjà ses erreurs. */
export async function purgerClesHeritees(): Promise<void> {
  await Promise.all(CLES_HERITEES.map(remove));
}

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    // Un Keystore momentanément indisponible (appareil qui se déverrouille)
    // ne doit pas ressembler à une session absente : l'appelant distingue
    // `null` de l'échec par le contexte, et on ne détruit jamais sur cette voie.
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

async function remove(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Rien à faire : la clé n'existait pas.
  }
}

// ------------------------------------------------------------------- jetons

export interface TokenPair {
  access: string;
  refresh: string;
}

export async function readTokens(): Promise<TokenPair | null> {
  const [access, refresh] = await Promise.all([
    read(KEYS.access),
    read(KEYS.refresh),
  ]);
  return access && refresh ? { access, refresh } : null;
}

/**
 * Enregistre LA PAIRE, toujours ensemble.
 *
 * Le backend fait tourner les jetons de rafraîchissement et met l'ancien sur
 * liste noire dès son usage. L'ancienne application conservait l'ancien : le
 * rafraîchissement suivant échouait, et l'utilisateur se retrouvait déconnecté
 * environ toutes les heures, même avec une connexion parfaite. Écrire les deux
 * en même temps est ce qui empêche ce défaut de revenir.
 */
export async function writeTokens(tokens: TokenPair): Promise<void> {
  await Promise.all([
    write(KEYS.access, tokens.access),
    write(KEYS.refresh, tokens.refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([remove(KEYS.access), remove(KEYS.refresh)]);
}

// ---------------------------------------------------------- jeton d'appareil

export const readDeviceToken = () => read(KEYS.device);
export const writeDeviceToken = (token: string) => write(KEYS.device, token);
export const clearDeviceToken = () => remove(KEYS.device);

// ------------------------------------------------------------ instantané

/**
 * Identité mise en cache au dernier réveil réussi.
 *
 * C'est ce qui rend possible un démarrage à froid SANS RÉSEAU : rôle,
 * permissions effectives, identité de la boutique, devises, paramètres de reçu,
 * programme de fidélité. Sans lui, l'application ne saurait ni quoi afficher ni
 * quoi autoriser, et devrait attendre le serveur.
 */
export async function readSnapshot<T>(): Promise<T | null> {
  const raw = await read(KEYS.snapshot);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const writeSnapshot = (value: unknown) =>
  write(KEYS.snapshot, JSON.stringify(value));
export const clearSnapshot = () => remove(KEYS.snapshot);

// -------------------------------------------------------------- verrou local

/**
 * Efface tout ce qui touche à la session.
 *
 * N'EFFACE PAS la base locale. Les ventes non synchronisées survivent à une
 * déconnexion : l'ancienne application appelait `resetDatabase()` en se
 * déconnectant, ce qui détruisait la journée d'un caissier qui voulait
 * simplement changer de compte.
 */
export async function clearSession(): Promise<void> {
  await Promise.all([
    clearTokens(),
    clearDeviceToken(),
    clearSnapshot(),
    // Voir `CLES_HERITEES` : elles ne s'écrivent plus, on continue de les
    // effacer tant qu'un parc peut encore en porter.
    purgerClesHeritees(),
  ]);
}
