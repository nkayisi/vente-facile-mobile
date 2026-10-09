/**
 * Le logo de l'établissement, chargé UNE FOIS et lu sans attente.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `chromeDeLaSession` EST SYNCHRONE, ET ELLE DOIT LE RESTER.              │
 * │                                                                          │
 * │ Elle est appelée au moment d'imprimer, par une dizaine de chemins - un   │
 * │ ticket de vente, un reçu de règlement, un Z de caisse, un reçu de        │
 * │ dépense. La rendre asynchrone ferait attendre le premier ticket le temps │
 * │ d'un téléchargement, devant un client, sur une 2G.                       │
 * │                                                                          │
 * │ Le logo est donc chargé au démarrage, comme la devise par défaut l'est   │
 * │ par `useDeviseParDefaut`, et posé ici. Ce qui n'est pas encore chargé    │
 * │ vaut `null` : le bloc disparaît, et le ticket sort sans logo plutôt que  │
 * │ de ne pas sortir.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { LoadedLogo } from "@vente-facile/core/receipt";

/**
 * ⚠ CE MODULE N'IMPORTE NI REACT NI LA SESSION, ET C'EST UNE CONTRAINTE.
 *
 * `features/pos/ticket.ts` le lit, et `ticket.test.ts` comme
 * `proforma.test.ts` sont des tests PURS. Y faire entrer `@/session/provider`
 * tire `@/db/client`, qui OUVRE SQLite au chargement : les deux suites ont
 * cessé de se lancer à la première tentative. Le hook qui charge vit donc à
 * côté, dans `use-logo-etablissement.ts`.
 */

let courant: LoadedLogo | null = null;
/** Le chemin dont `courant` est issu : il sert à ne pas recharger pour rien. */
let charge: string | null = null;

/** Le logo prêt à imprimer, ou `null` tant qu'il n'y en a pas. */
export function logoCourant(): LoadedLogo | null {
  return courant;
}

/** Le chemin actuellement chargé, pour que le hook sache s'il doit agir. */
export function cheminCharge(): string | null {
  return charge;
}

/** Pose ce que le hook a chargé. `null` efface. */
export function poserLogo(chemin: string | null, logo: LoadedLogo | null): void {
  charge = chemin;
  courant = logo;
}

/** Pour les tests : remet l'état du module à neuf. */
export function oublierLeLogo(): void {
  courant = null;
  charge = null;
}
