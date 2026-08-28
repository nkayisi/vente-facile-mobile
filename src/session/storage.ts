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
  pinSalt: "vf.pin_salt",
  pinHash: "vf.pin_hash",
  pinAttempts: "vf.pin_attempts",
  pinLockedUntil: "vf.pin_locked_until",
} as const;

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

export interface PinRecord {
  salt: string;
  hash: string;
}

export async function readPin(): Promise<PinRecord | null> {
  const [salt, hash] = await Promise.all([read(KEYS.pinSalt), read(KEYS.pinHash)]);
  return salt && hash ? { salt, hash } : null;
}

export async function writePin(record: PinRecord): Promise<void> {
  await Promise.all([
    write(KEYS.pinSalt, record.salt),
    write(KEYS.pinHash, record.hash),
  ]);
}

export const clearPin = () =>
  Promise.all([remove(KEYS.pinSalt), remove(KEYS.pinHash)]).then(() => undefined);

export async function readPinAttempts(): Promise<number> {
  return Number((await read(KEYS.pinAttempts)) ?? "0");
}

export const writePinAttempts = (n: number) => write(KEYS.pinAttempts, String(n));

/**
 * Fin de la temporisation après des essais ratés, en millisecondes.
 *
 * Persistée : redémarrer l'application ne doit pas remettre le compteur à zéro,
 * sinon la temporisation ne coûte rien à qui essaie des codes au hasard.
 */
export async function readPinLockedUntil(): Promise<number> {
  return Number((await read(KEYS.pinLockedUntil)) ?? "0");
}

export const writePinLockedUntil = (at: number) =>
  write(KEYS.pinLockedUntil, String(at));

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
    clearPin(),
    remove(KEYS.pinAttempts),
    remove(KEYS.pinLockedUntil),
  ]);
}
