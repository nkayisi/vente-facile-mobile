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

/** Profondeur maximale explorée dans un corps d'erreur DRF. */
const PROFONDEUR_MAX = 4;

/**
 * La première phrase d'un corps d'erreur DRF, et la LIGNE qu'elle désigne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN REFUS DE LIGNE RESSORTAIT EN « rejected », SANS SA PHRASE.            │
 * │                                                                          │
 * │ L'ancienne lecture ne descendait que d'UN niveau : sur                   │
 * │ `{ champ: ["message"] }` elle trouvait sa phrase, sur                    │
 * │ `{ lines: { 1: { quantity: ["…"] } } }` le premier membre était un OBJET, │
 * │ aucune branche ne mordait, et on retombait sur le code technique.        │
 * │                                                                          │
 * │ Ce n'est pas un cas de bord : c'est la forme de TOUT serializer imbriqué.│
 * │ Une livraison de masse est un seul acte - son refus condamne les          │
 * │ quarante lignes - et c'est le message qui doit dire LAQUELLE corriger.    │
 * │ `sale.create` avec un article fautif rendait `{ items: [{ … }] }`, donc   │
 * │ le même silence, et c'est bien par là qu'il passait depuis toujours.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ ON NOMME LA LIGNE, PAS LE CHAMP. Un indice numérique est la seule clé qui
 * veuille dire quelque chose au magasinier - « ligne 2 » lui dit où regarder,
 * « quantity » ne lui dit rien qu'il puisse chercher à l'écran. Et il est rendu
 * en base 1 : le serveur indexe à partir de zéro, le marchand compte à partir
 * de un.
 */
function premierePhrase(
  valeur: unknown,
  profondeur = 0
): { phrase: string; ligne?: number } | null {
  if (profondeur > PROFONDEUR_MAX) return null;
  if (typeof valeur === "string") {
    return valeur.trim() ? { phrase: valeur } : null;
  }
  if (Array.isArray(valeur)) {
    for (let i = 0; i < valeur.length; i += 1) {
      const trouve = premierePhrase(valeur[i], profondeur + 1);
      // ⚠ Un tableau de serializers EST une liste de lignes : son indice
      //   compte, celui d'une liste de messages du même champ non.
      if (trouve) {
        return trouve.ligne === undefined && typeof valeur[i] !== "string"
          ? { ...trouve, ligne: i + 1 }
          : trouve;
      }
    }
    return null;
  }
  if (valeur && typeof valeur === "object") {
    for (const [cle, membre] of Object.entries(valeur as Record<string, unknown>)) {
      const trouve = premierePhrase(membre, profondeur + 1);
      if (!trouve) continue;
      const indice = Number(cle);
      if (trouve.ligne === undefined && Number.isInteger(indice) && cle !== "") {
        return { ...trouve, ligne: indice + 1 };
      }
      return trouve;
    }
  }
  return null;
}

/**
 * Message de refus, tel qu'un commerçant doit le lire.
 *
 * DRF rend souvent `{ champ: ["message"] }`, et `{ lines: { 1: { … } } }` dès
 * qu'un serializer est imbriqué. Afficher ce JSON brut, ou pire
 * « [object Object] », n'apprend rien sur ce qu'il faut corriger - et retomber
 * sur le code technique n'apprend pas davantage.
 */
export function messageOf(result: {
  errors: { code?: string; detail?: string; errors?: unknown } | null;
}): string {
  const e = result.errors;
  if (!e) return "Refusé par le serveur.";
  if (typeof e.detail === "string") return e.detail;
  const trouve = premierePhrase(e.errors);
  if (trouve) {
    return trouve.ligne === undefined
      ? trouve.phrase
      : `Ligne ${trouve.ligne} : ${trouve.phrase}`;
  }
  return e.code ?? "Refusé par le serveur.";
}
