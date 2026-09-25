/**
 * Le périmètre sous lequel une table a été tirée, et ce qu'on fait quand il
 * change.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CURSEUR NE DIT PAS SOUS QUEL PÉRIMÈTRE IL A ÉTÉ OBTENU.              │
 * │                                                                          │
 * │ Le serveur applique le périmètre AVANT le curseur. Quand il s'ÉLARGIT -  │
 * │ un magasinier reçoit un second dépôt, `assign_default_warehouse`         │
 * │ rattache un membre - les lignes devenues éligibles portent un            │
 * │ `updated_at` ANTÉRIEUR au point de reprise. Elles sont écartées, et la   │
 * │ sonde `pull/changed/` répond « rien de neuf » : l'écran annonce          │
 * │ « Complet, à l'instant » sur une table amputée, pour toujours.           │
 * │                                                                          │
 * │ Quand il se RESSERRE, les lignes déjà descendues restent : aucune pierre │
 * │ tombale ne viendra les retirer, `read_tombstones` appliquant le          │
 * │ périmètre lui aussi. Elles resteraient visibles à jamais.                │
 * │                                                                          │
 * │ Les deux sens se soignent de la même façon : EFFACER la table, remettre  │
 * │ son curseur à zéro, la retirer en entier.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il ne décide que du verdict. Le câblage vit dans `pull.ts`.
 */

/**
 * Faut-il repartir de zéro sur cette table ?
 *
 * @param stocke Le jeton rangé à côté du curseur. `null` : jamais reçu.
 * @param recu   Celui que le manifeste vient de rendre. `undefined` : le
 *               serveur ne le connaît pas.
 */
export function perimetreAChange(
  stocke: string | null,
  recu: string | undefined
): boolean {
  // ⚠ UN SERVEUR ANTÉRIEUR N'EST PAS UN CHANGEMENT. Lire son silence comme
  // une différence ferait effacer et re-tirer les trente-huit tables à CHAQUE
  // synchronisation, indéfiniment, sur tout un parc.
  if (recu === undefined) return false;

  // ⚠ NI LA PREMIÈRE FOIS QU'ON L'APPREND. À la mise à jour, aucun terminal
  // n'a de jeton : le traiter comme un changement ferait re-tirer tout le parc
  // d'un coup, alors que le périmètre, lui, n'a pas bougé. On l'adopte.
  //
  // Ce qui répare les terminaux DÉJÀ amputés par un changement antérieur n'est
  // pas ce cas-ci mais `SCOPE_RULE_VERSION`, que le serveur incrémente quand
  // la règle change : le jeton bascule alors pour tout le monde, une fois.
  if (stocke === null) return false;

  return stocke !== recu;
}
