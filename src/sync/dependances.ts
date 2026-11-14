/**
 * Ce qui peut partir dans un lot, compte tenu des dépendances.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE OPÉRATION NE PART PAS SANS CE DONT ELLE DÉPEND.                     │
 * │                                                                          │
 * │ Une vente faite pour un client créé hors ligne DÉPEND de sa création.    │
 * │ Si la création est temporisée (verdict `retry`, prochain essai dans le   │
 * │ futur) ou retenue (`blocked`), la vente partirait SEULE au lot suivant : │
 * │ le serveur ne trouverait pas le client et la refuserait - un refus       │
 * │ définitif, sur une vente dont le ticket est déjà sorti.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Une dépendance encore dans le journal (`pending`, `inflight`, `blocked`)
 * retient ce qui en dépend, SAUF si elle part dans le même lot : le serveur
 * rejoue un lot dans l'ordre de `seq`, et c'est ce qui fait passer ensemble la
 * création d'un client et la vente faite à son nom.
 *
 * Une dépendance absente du journal (appliquée puis purgée) ou en quarantaine
 * ne retient rien : la première est acquise, et pour la seconde c'est au
 * serveur de dire `dependency_rejected`.
 *
 * Module PUR : il décide de ce qui part, il doit s'éprouver sans appareil.
 */

export interface Candidate {
  id: string;
  seq: number;
}

/**
 * `candidats` : les opérations prêtes à partir.
 * `enAttente` : les identifiants de TOUTES les opérations du journal encore à
 * envoyer (`pending`, `inflight`, `blocked`), candidats compris.
 * `dependancesDe` : ce dont une opération dépend.
 */
export function envoyables<T extends Candidate>(
  candidats: T[],
  enAttente: ReadonlySet<string>,
  dependancesDe: (op: T) => string[]
): T[] {
  const retenus: T[] = [];
  const dansLeLot = new Set<string>();
  for (const op of [...candidats].sort((a, b) => a.seq - b.seq)) {
    const pret = dependancesDe(op).every((dep) => dansLeLot.has(dep) || !enAttente.has(dep));
    if (!pret) continue;
    retenus.push(op);
    dansLeLot.add(op.id);
  }
  return retenus;
}
