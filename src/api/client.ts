/**
 * Client HTTP.
 *
 * Trois exigences, dans cet ordre :
 *
 * 1. **Ne jamais mettre l'utilisateur dehors pour une panne réseau.** Toute la
 *    logique de rafraîchissement distingue « le serveur refuse cette identité »
 *    de « le serveur est injoignable ». La seconde ne touche à aucun jeton.
 * 2. **Enregistrer le nouveau jeton de rafraîchissement avant de le consommer.**
 *    Le backend fait tourner les jetons et met l'ancien sur liste noire ; garder
 *    l'ancien condamne la session à la requête suivante.
 * 3. **Un seul rafraîchissement à la fois.** Six requêtes qui reçoivent 401
 *    ensemble ne doivent pas lancer six rafraîchissements, dont cinq
 *    utiliseraient un jeton que le premier vient d'invalider.
 */
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "./config";
import { ApiError, classifyStatus, readableMessage } from "./errors";
import { tokenExpiry } from "./jwt";
import {
  clearTokens,
  readDeviceToken,
  readTokens,
  writeTokens,
  type TokenPair,
} from "@/session/storage";

/** Marge avant expiration : on rafraîchit sans attendre le premier 401. */
const REFRESH_MARGIN_MS = 60_000;

let organizationId: string | null = null;

/** Posée par le fournisseur de session à l'ouverture. */
export function setOrganizationId(id: string | null) {
  organizationId = id;
}

/**
 * Appelée quand la session est DÉFINITIVEMENT perdue : le serveur a répondu et
 * refuse à la fois le jeton de rafraîchissement et le jeton d'appareil.
 * Jamais sur une panne réseau.
 */
let onSessionLost: ((reason: string) => void) | null = null;
export function setSessionLostHandler(handler: ((reason: string) => void) | null) {
  onSessionLost = handler;
}

// ------------------------------------------------------------------ requêtes

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  /** Ajoute le jeton d'accès. */
  auth?: boolean;
  /** Ajoute l'en-tête `X-Organization-ID`. */
  org?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function rawRequest<T>(
  path: string,
  options: RequestOptions,
  accessToken: string | null
): Promise<T> {
  const {
    method = "GET",
    body,
    headers = {},
    org = true,
    timeoutMs = REQUEST_TIMEOUT_MS,
    signal,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener("abort", () => controller.abort());

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(org && organizationId ? { "X-Organization-ID": organizationId } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const parsed = text ? safeJson(text) : undefined;

    if (!response.ok) {
      throw new ApiError(
        classifyStatus(response.status),
        readableMessage(parsed, `Erreur ${response.status}`),
        {
          status: response.status,
          body: parsed,
          code:
            parsed && typeof parsed === "object"
              ? (parsed as { code?: string }).code
              : undefined,
        }
      );
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Tout ce qui n'est pas une réponse du serveur est une panne de transport.
    // On ne suppose JAMAIS que la session est morte sur cette voie.
    throw new ApiError("network", "Le serveur est injoignable.", {});
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// --------------------------------------------------------- rafraîchissement

let inFlightRefresh: Promise<TokenPair> | null = null;

async function refreshWithToken(refresh: string): Promise<TokenPair> {
  const data = await rawRequest<{ access: string; refresh?: string }>(
    "/auth/token/refresh/",
    { method: "POST", body: { refresh }, org: false },
    null
  );

  // Le serveur fait TOURNER le jeton : celui qu'on vient d'utiliser est déjà
  // sur liste noire. On garde le nouveau, et on l'enregistre AVANT de rendre
  // la main, pour qu'un plantage entre les deux ne laisse pas un jeton mort.
  const pair: TokenPair = { access: data.access, refresh: data.refresh ?? refresh };
  await writeTokens(pair);
  return pair;
}

async function openSessionWithDevice(): Promise<TokenPair> {
  const deviceToken = await readDeviceToken();
  if (!deviceToken) {
    throw new ApiError("auth", "Aucun appareil enrôlé.", { code: "no_device" });
  }

  const data = await rawRequest<{ access: string; refresh: string }>(
    "/auth/devices/session/",
    { method: "POST", body: { device_token: deviceToken }, org: false },
    null
  );

  const pair: TokenPair = { access: data.access, refresh: data.refresh };
  await writeTokens(pair);
  return pair;
}

/**
 * Rend une paire de jetons utilisable, ou lève.
 *
 * Escalade : jeton de rafraîchissement, puis jeton d'appareil. La session n'est
 * déclarée perdue que si le serveur a répondu et refusé les deux.
 */
async function ensureFreshTokens(force = false): Promise<TokenPair> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async (): Promise<TokenPair> => {
    const current = await readTokens();

    if (!force && current) {
      const expiry = tokenExpiry(current.access);
      if (expiry === null || expiry - Date.now() > REFRESH_MARGIN_MS) {
        return current;
      }
    }

    if (current) {
      try {
        return await refreshWithToken(current.refresh);
      } catch (error) {
        // Panne réseau : on remonte tel quel. Les jetons restent en place, et
        // l'application continue hors ligne.
        if (error instanceof ApiError && error.kind !== "auth") throw error;
        // Refus du serveur : on tente le jeton d'appareil.
      }
    }

    try {
      return await openSessionWithDevice();
    } catch (error) {
      if (error instanceof ApiError && error.kind !== "auth") throw error;

      // Le serveur a répondu et refuse les deux : la session est bien perdue.
      // On efface les jetons, et RIEN D'AUTRE : la base locale et les
      // opérations en attente survivent, ce sont les ventes de la journée.
      await clearTokens();
      const reason =
        error instanceof ApiError && error.code === "no_device"
          ? "no_device"
          : ((error as ApiError).code ?? "device_not_authorized");
      onSessionLost?.(reason);
      throw error;
    }
  })().finally(() => {
    inFlightRefresh = null;
  });

  return inFlightRefresh;
}

// ---------------------------------------------------------------- interface

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { auth = true } = options;

  if (!auth) return rawRequest<T>(path, options, null);

  const tokens = await ensureFreshTokens();

  try {
    return await rawRequest<T>(path, options, tokens.access);
  } catch (error) {
    // Un 401 malgré un jeton frais : l'horloge a dérivé, ou le jeton a été
    // invalidé côté serveur. On force UNE relance, jamais plus : boucler ici
    // enverrait l'appareil marteler le serveur.
    if (error instanceof ApiError && error.status === 401) {
      const renewed = await ensureFreshTokens(true);
      return rawRequest<T>(path, options, renewed.access);
    }
    throw error;
  }
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "DELETE" }),
};

export { ensureFreshTokens, tokenExpiry };
