/**
 * Politique de la file d'envoi.
 *
 * Pure : aucune base, aucun réseau. Séparée de `outbox.ts` et de `push.ts`, qui
 * ouvrent la base au chargement du module et ne sont donc pas testables sans
 * appareil. Ce sont pourtant ces règles-là qui décident du comportement en
 * situation dégradée, et elles méritent d'être éprouvées.
 */

/**
 * Temporisation avant nouvel essai.
 *
 * La gigue n'est pas un détail : sans elle, douze terminaux d'un même marché
 * qui ont perdu le réseau ensemble le retrouvent ensemble et repartent en
 * chœur, ce qui reproduit la panne côté serveur.
 */
export function backoffMs(attempts: number): number {
  const base = Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 15 * 60_000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

/**
 * Message de refus, tel qu'un commerçant doit le lire.
 *
 * DRF rend souvent `{ champ: ["message"] }`. Afficher ce JSON brut, ou pire
 * « [object Object] », n'apprend rien sur ce qu'il faut corriger.
 */
export function messageOf(result: {
  errors: { code?: string; detail?: string; errors?: unknown } | null;
}): string {
  const e = result.errors;
  if (!e) return "Refusé par le serveur.";
  if (typeof e.detail === "string") return e.detail;
  if (e.errors) {
    const premier = Object.values(e.errors as Record<string, unknown>)[0];
    if (Array.isArray(premier) && typeof premier[0] === "string") return premier[0];
    if (typeof premier === "string") return premier;
  }
  return e.code ?? "Refusé par le serveur.";
}
