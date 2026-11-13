/**
 * Accorder un mot à son nombre. PUR, sans dépendance.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « OPÉRATION(S) REFUSÉE(S) » N'EST PAS UNE PHRASE.                        │
 * │                                                                          │
 * │ Le raccourci entre parenthèses se lit comme un formulaire administratif, │
 * │ et il laisse le reste de la phrase sans accord : « 1 opération(s)        │
 * │ refusée(s). Elles ne repartiront pas d'elles-mêmes. » Le nombre est      │
 * │ CONNU au moment d'écrire la phrase ; il n'y a aucune raison de ne pas    │
 * │ accorder. `ui/doctrine.test.ts` refuse désormais ce raccourci dans tout  │
 * │ libellé.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ En français, zéro et un prennent le SINGULIER : « 0 opération », et le
 *   pluriel commence à DEUX - « 1,5 unité ». C'est la règle de
 *   `pluralizeUnit` du noyau ; deux règles d'accord dans la même application
 *   feraient écrire « 1,5 unités » ici et « 1,5 kg » à côté.
 */

/** « 1 opération », « 3 opérations ». */
export function pluriel(n: number, singulier: string, plur: string): string {
  return `${n} ${accord(n, singulier, plur)}`;
}

/** Le mot seul, accordé : pour un verbe ou un pronom qui suit le nombre. */
export function accord(n: number, singulier: string, plur: string): string {
  return Math.abs(n) >= 2 ? plur : singulier;
}
