/**
 * Verrou local de l'application.
 *
 * Ce que ce verrou protège, et ce qu'il ne protège pas. Il empêche un passant
 * d'encaisser sur un terminal laissé sur le comptoir. Il ne résiste pas à un
 * attaquant qui a l'appareil, le temps, et les droits root.
 *
 * Autant le dire franchement plutôt que de se donner l'air de faire mieux : un
 * code à quatre ou six chiffres, c'est 10 000 à 1 000 000 de possibilités.
 * AUCUNE fonction de dérivation ne rend cet espace résistant à une attaque
 * hors ligne. Alourdir le hachage donnerait une fausse assurance, et
 * `expo-crypto` n'expose de toute façon pas de PBKDF2 : l'imiter en JavaScript
 * imposerait 150 000 passages du pont natif, soit des minutes d'attente à
 * chaque déverrouillage.
 *
 * Les trois défenses réelles sont ailleurs :
 *   1. l'empreinte vit dans le Keystore Android ou le Trousseau iOS, adossés au
 *      matériel, et ne s'extrait pas sans compromettre l'appareil ;
 *   2. les essais sont comptés et temporisés, ici, et la temporisation survit
 *      au redémarrage de l'application ;
 *   3. le gérant révoque le terminal depuis le back-office, ce qui coupe l'accès
 *      serveur quoi qu'il arrive au verrou local.
 */
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";

import {
  clearPin,
  readPin,
  readPinAttempts,
  readPinLockedUntil,
  writePin,
  writePinAttempts,
  writePinLockedUntil,
} from "./storage";

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

/** Nombre d'essais avant la première temporisation. */
const FREE_ATTEMPTS = 5;
/** Au-delà, une connexion en ligne par mot de passe est exigée. */
const MAX_ATTEMPTS = 10;
const BASE_DELAY_MS = 30_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
}

export async function hasPin(): Promise<boolean> {
  return (await readPin()) !== null;
}

/** Définit ou remplace le code. Remet les compteurs d'essais à zéro. */
export async function setPin(pin: string): Promise<void> {
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    throw new Error(
      `Le code doit compter entre ${PIN_MIN_LENGTH} et ${PIN_MAX_LENGTH} chiffres.`
    );
  }
  const salt = toHex(Crypto.getRandomBytes(16));
  await writePin({ salt, hash: await hashPin(pin, salt) });
  await Promise.all([writePinAttempts(0), writePinLockedUntil(0)]);
}

export async function removePin(): Promise<void> {
  await clearPin();
  await Promise.all([writePinAttempts(0), writePinLockedUntil(0)]);
}

export type UnlockOutcome =
  | { status: "ok" }
  | { status: "wrong"; remaining: number }
  | { status: "delayed"; retryInMs: number }
  | { status: "exhausted" }
  | { status: "no_pin" };

/** Temps restant avant de pouvoir réessayer, 0 si la voie est libre. */
export async function unlockDelayRemaining(): Promise<number> {
  const until = await readPinLockedUntil();
  return Math.max(0, until - Date.now());
}

export async function verifyPin(pin: string): Promise<UnlockOutcome> {
  const record = await readPin();
  if (!record) return { status: "no_pin" };

  const delay = await unlockDelayRemaining();
  if (delay > 0) return { status: "delayed", retryInMs: delay };

  const attempts = await readPinAttempts();
  if (attempts >= MAX_ATTEMPTS) return { status: "exhausted" };

  const candidate = await hashPin(pin, record.salt);
  if (candidate === record.hash) {
    await Promise.all([writePinAttempts(0), writePinLockedUntil(0)]);
    return { status: "ok" };
  }

  const next = attempts + 1;
  await writePinAttempts(next);

  if (next >= MAX_ATTEMPTS) return { status: "exhausted" };

  if (next >= FREE_ATTEMPTS) {
    // Doublement à chaque série : 30 s, 1 min, 2 min. On ne détruit rien, on
    // fait seulement perdre du temps. Effacer la base après des essais ratés
    // serait le défaut de l'ancienne application, déguisé en mesure de sécurité.
    const wait = BASE_DELAY_MS * 2 ** (next - FREE_ATTEMPTS);
    await writePinLockedUntil(Date.now() + wait);
    return { status: "delayed", retryInMs: wait };
  }

  return { status: "wrong", remaining: MAX_ATTEMPTS - next };
}

// ---------------------------------------------------------------- biométrie

export interface BiometricSupport {
  available: boolean;
  /** Vrai quand l'utilisateur a réellement enregistré une empreinte ou un visage. */
  enrolled: boolean;
  label: string;
}

/**
 * Double garde volontaire : beaucoup de terminaux POS d'entrée de gamme n'ont
 * pas de lecteur, et beaucoup de ceux qui en ont un ne l'ont jamais configuré.
 * Proposer la biométrie dans ces cas-là mène à un bouton qui ne fait rien.
 */
export async function biometricSupport(): Promise<BiometricSupport> {
  try {
    const [available, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    const face = types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
    );
    return {
      available,
      enrolled,
      label: face ? "Reconnaissance faciale" : "Empreinte digitale",
    };
  } catch {
    return { available: false, enrolled: false, label: "Biométrie" };
  }
}

export async function unlockWithBiometrics(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Déverrouiller Vente Facile",
      cancelLabel: "Utiliser le code",
      // Le repli système est écarté : c'est NOTRE code que l'on veut, avec
      // notre compteur d'essais, pas celui de l'appareil.
      disableDeviceFallback: true,
    });
    if (result.success) {
      await Promise.all([writePinAttempts(0), writePinLockedUntil(0)]);
    }
    return result.success;
  } catch {
    return false;
  }
}
