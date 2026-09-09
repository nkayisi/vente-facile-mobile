/**
 * Ce qu'une session de caisse MONTRE de son état d'envoi.
 *
 * **La TABLE a déménagé dans `features/sync/apparence.ts`**, sous le nom
 * `ETAT_ENVOI`. Elle n'avait rien de caissier : c'est « à quoi ressemblent les
 * trois états d'envoi », question que se posent désormais la feuille de
 * comptage, les retours, les devis et une dizaine d'autres écrans. Le
 * réexport garde le nom local, et `apparence.test.ts` reste vert sans une
 * ligne modifiée : c'est la preuve que le déplacement est neutre.
 */
import type { EtatEnvoi } from "@/sync";

export { ETAT_ENVOI as ETAT_SESSION, type ApparenceEtat } from "@/features/sync/apparence";

/**
 * Pourquoi « Clôturer » est fermé. Chaîne vide quand rien ne l'empêche.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN BOUTON DÉSACTIVÉ SANS RAISON EST UN CUL-DE-SAC.                      │
 * │                                                                          │
 * │ Le bouton se grisait dès que l'ouverture n'était pas confirmée, sans un  │
 * │ mot. Le caissier a compté son tiroir et veut rentrer : il appuie, rien   │
 * │ ne se passe, et rien ne lui dit s'il doit synchroniser, attendre, ou     │
 * │ appeler quelqu'un.                                                       │
 * │                                                                          │
 * │ La raison DIFFÈRE selon l'état, et c'est tout l'enjeu : en file, c'est   │
 * │ du réseau et cela partira seul ; bloqué, c'est une décision, et chercher │
 * │ du réseau n'y changera rien - c'est la règle de `data/envoi.ts`.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function motifClotureFermee(envoi: EtatEnvoi): string {
  if (envoi === "envoye") return "";
  if (envoi === "bloque") {
    return "Le serveur ne connaît pas encore cette session : la clôture attendra que l'abonnement soit réglé ou la permission accordée.";
  }
  return "Le serveur ne connaît pas encore cette session : la clôture sera possible après la prochaine synchronisation.";
}
