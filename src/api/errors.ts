/**
 * Classification des échecs.
 *
 * C'est la pièce qui décide si une session est perdue ou seulement injoignable,
 * et c'est là que l'ancienne application se trompait : `verifyToken()` renvoyait
 * `false` aussi bien pour un jeton expiré que pour une coupure réseau, et
 * l'appelant enchaînait sur `clearAllStorage()`. Démarrer l'application hors
 * réseau déconnectait donc l'utilisateur, sans aucun moyen de revenir.
 *
 * Règle : **une panne de transport n'est jamais une session invalide.**
 */

export type FailureKind =
  /** Rien n'a atteint le serveur : coupure, DNS, délai dépassé. */
  | "network"
  /** Le serveur a répondu, et il refuse l'identité : 401 ou 403 sur l'auth. */
  | "auth"
  /** Le serveur a répondu 5xx : c'est transitoire, on réessaiera. */
  | "server"
  /** Le serveur a répondu et refuse la demande : 400, 403, 404, 409, 422. */
  | "request"
  /** Abonnement expiré : 402. */
  | "subscription"
  /** Trop de requêtes : 429. */
  | "throttled";

export class ApiError extends Error {
  readonly kind: FailureKind;
  readonly status?: number;
  readonly body?: unknown;
  /** Code applicatif renvoyé par le serveur (`device_not_authorized`, …). */
  readonly code?: string;

  constructor(
    kind: FailureKind,
    message: string,
    options: { status?: number; body?: unknown; code?: string } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = options.status;
    this.body = options.body;
    this.code = options.code;
  }
}

/** Classe une réponse HTTP dont le code n'est pas 2xx. */
export function classifyStatus(status: number): FailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "subscription";
  if (status === 429) return "throttled";
  if (status >= 500) return "server";
  return "request";
}

/**
 * Classe une exception levée par `fetch`.
 *
 * Le repli est **`network`**, jamais `auth` : dans le doute, on préfère laisser
 * l'utilisateur travailler hors ligne plutôt que de le mettre dehors.
 */
export function classifyThrown(error: unknown): FailureKind {
  if (error instanceof ApiError) return error.kind;
  if (error instanceof Error && error.name === "AbortError") return "network";
  return "network";
}

/** Vrai quand rien n'a atteint le serveur. On ne touche alors à aucun jeton. */
export const isOffline = (error: unknown) =>
  classifyThrown(error) === "network";

/** Extrait un message lisible d'un corps d'erreur DRF, si possible. */
export function readableMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) return body;
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const key of ["detail", "error", "message"]) {
      if (typeof o[key] === "string") return o[key] as string;
    }
    // DRF renvoie souvent { champ: ["message"] }.
    for (const value of Object.values(o)) {
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
  }
  return fallback;
}
