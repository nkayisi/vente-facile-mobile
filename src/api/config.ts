/**
 * Adresse de l'API.
 *
 * En développement, on déduit l'IP de la machine depuis l'hôte du bundler Metro
 * plutôt que de la coder en dur : elle changeait à chaque réseau et il fallait
 * l'éditer trois fois par semaine. Le port 8005 est celui que le conteneur
 * expose.
 *
 * En build, `EXPO_PUBLIC_API_URL` est posé par le profil EAS.
 */
import Constants from "expo-constants";

function devBaseUrl(): string {
  const hostUri =
    (Constants.expoConfig as { hostUri?: string } | null)?.hostUri ??
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } })
      .expoGoConfig?.debuggerHost ??
    "";
  const host = String(hostUri).split(":")[0];
  return host ? `http://${host}:8005/api/v1` : "http://127.0.0.1:8005/api/v1";
}

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? devBaseUrl() : "");

if (!API_BASE_URL) {
  // Mieux vaut échouer au démarrage qu'envoyer les ventes d'un marchand vers
  // une adresse vide et découvrir le problème une semaine plus tard.
  throw new Error(
    "EXPO_PUBLIC_API_URL n'est pas défini. Vérifiez le profil de compilation."
  );
}

/**
 * Délai d'attente d'une requête.
 *
 * Généreux : en 2G congolaise, une réponse peut mettre vingt secondes, et
 * abandonner trop tôt transforme un réseau lent en réseau absent. Le
 * téléversement d'un lot d'opérations a son propre délai, plus long encore.
 */
export const REQUEST_TIMEOUT_MS = 30_000;
export const SYNC_TIMEOUT_MS = 120_000;
