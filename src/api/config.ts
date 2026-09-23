/**
 * Adresse de l'API.
 *
 * En développement, on déduit l'IP de la machine depuis l'hôte du bundler Metro
 * plutôt que de la coder en dur : elle changeait à chaque réseau et il fallait
 * l'éditer trois fois par semaine. Le port 8005 est celui que le conteneur
 * expose.
 *
 * En build, `EXPO_PUBLIC_API_URL` est posé par le profil EAS (`eas.json`).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA DÉCISION EST PURE, LE BRANCHEMENT EST EN BAS.                         │
 * │                                                                          │
 * │ Une adresse fausse ne lève pas : elle fait répondre « serveur            │
 * │ injoignable » à chaque requête, indéfiniment, sur le terminal d'un       │
 * │ marchand et jamais sur celui du développeur. Les deux fautes qu'on ne    │
 * │ voit pas en relisant un JSON sont la BARRE FINALE (`.../api/v1/` donne   │
 * │ `//sync/pull/`, que Django redirige ou refuse) et le SCHÉMA CLAIR        │
 * │ (`http://` dans une compilation de diffusion : Android 9+ bloque le      │
 * │ trafic non chiffré par défaut, donc AUCUNE requête ne part et rien ne    │
 * │ le dit). Les deux sont tranchées ici, et testées.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import Constants from "expo-constants";

/** `${API_BASE_URL}${path}` : une barre finale en donnerait deux. */
function sansBarreFinale(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Adresse déduite de l'hôte du bundler Metro, en développement seulement. */
export function urlDepuisMetro(hostUri: string): string {
  const host = String(hostUri).split(":")[0];
  return host ? `http://${host}:8005/api/v1` : "http://127.0.0.1:8005/api/v1";
}

export function resoudreApiBaseUrl(options: {
  fournie: string | undefined;
  dev: boolean;
  hostUri: string;
}): string {
  const fournie = options.fournie?.trim();

  if (!fournie) {
    // Mieux vaut échouer au démarrage qu'envoyer les ventes d'un marchand vers
    // une adresse vide et découvrir le problème une semaine plus tard.
    if (!options.dev) {
      throw new Error(
        "EXPO_PUBLIC_API_URL n'est pas défini. Vérifiez le profil de compilation."
      );
    }
    return urlDepuisMetro(options.hostUri);
  }

  const url = sansBarreFinale(fournie);

  if (!options.dev && !url.startsWith("https://")) {
    throw new Error(
      `EXPO_PUBLIC_API_URL doit être en HTTPS hors développement (reçu : ${url}). ` +
        "Android bloque le trafic en clair dans une compilation de diffusion : " +
        "aucune requête ne partirait, sans message d'erreur."
    );
  }

  return url;
}

function hoteMetro(): string {
  return (
    (Constants.expoConfig as { hostUri?: string } | null)?.hostUri ??
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } })
      .expoGoConfig?.debuggerHost ??
    ""
  );
}

export const API_BASE_URL = resoudreApiBaseUrl({
  fournie: process.env.EXPO_PUBLIC_API_URL,
  dev: __DEV__,
  hostUri: hoteMetro(),
});

/**
 * Délai d'attente d'une requête.
 *
 * Généreux : en 2G congolaise, une réponse peut mettre vingt secondes, et
 * abandonner trop tôt transforme un réseau lent en réseau absent. Le
 * téléversement d'un lot d'opérations a son propre délai, plus long encore.
 */
export const REQUEST_TIMEOUT_MS = 30_000;
export const SYNC_TIMEOUT_MS = 120_000;

/**
 * Adresse du BACK-OFFICE web.
 *
 * Elle ne sert qu'à ouvrir le tunnel de paiement de l'abonnement, qui reste
 * hébergé côté web : Moko passe par une page à lui, et l'embarquer dans une
 * WebView est le motif de refus 4.2 le plus fréquent à la revue App Store. Le
 * lien part donc dans le navigateur du système, où le marchand voit la barre
 * d'adresse avant de saisir un moyen de paiement.
 *
 * Contrairement à `API_BASE_URL`, son absence NE FAIT PAS ÉCHOUER LE DÉMARRAGE :
 * on ne bloque pas un comptoir parce qu'un lien de facturation manque. L'écran
 * d'abonnement se contente de désactiver le bouton et de dire pourquoi. Pour la
 * même raison, un schéma clair n'y lève pas : un navigateur affiche la page,
 * là où Android refuse la requête d'une application.
 */
export function resoudreWebBaseUrl(options: {
  fournie: string | undefined;
  dev: boolean;
  apiBaseUrl: string;
}): string | null {
  const fournie = options.fournie?.trim();
  if (fournie) return sansBarreFinale(fournie);
  if (!options.dev) return null;
  return sansBarreFinale(options.apiBaseUrl.replace(/:8005\/api\/v1$/, ":3005"));
}

export const WEB_BASE_URL: string | null = resoudreWebBaseUrl({
  fournie: process.env.EXPO_PUBLIC_WEB_URL,
  dev: __DEV__,
  apiBaseUrl: API_BASE_URL,
});
