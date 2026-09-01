/**
 * Ce qu'un écran DIT d'un acte qui n'est pas encore arrivé au serveur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « ATTEND SON ENVOI » EST FAUX POUR UNE OPÉRATION BLOQUÉE.               │
 * │                                                                          │
 * │ Elle n'attend pas le réseau : elle attend une DÉCISION - un abonnement à │
 * │ régler, un droit à accorder - et elle ne partira pas d'elle-même. Le     │
 * │ marchand qui lit « attend son envoi » cherche du réseau, le trouve,      │
 * │ synchronise, et rien ne bouge. Il peut recommencer des jours durant.     │
 * │                                                                          │
 * │ Le vocabulaire est celui d'« Opérations à corriger », qui distingue déjà │
 * │ les deux : deux écrans qui nomment différemment le même état font douter │
 * │ qu'il s'agisse du même.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR, sans base ni composant : ces phrases sont la seule chose que le
 * marchand reçoit, et elles doivent s'éprouver sans appareil.
 */
import type { EtatEnvoi } from "@/sync";

export type TonEnvoi = "neutral" | "warning";

export interface LibelleEnvoi {
  /** Phrase courte, pour une pastille ou une ligne de liste. */
  court: string;
  /** Ce qu'il faut en faire. Vide quand il n'y a rien à faire. */
  detail: string;
  ton: TonEnvoi;
}

const LIBELLES: Record<Exclude<EtatEnvoi, "envoye">, LibelleEnvoi> = {
  en_attente: {
    court: "Attend son envoi",
    detail: "Elle partira à la prochaine synchronisation.",
    ton: "neutral",
  },
  bloque: {
    court: "En attente d'un droit",
    // Ni « réessayez », ni « synchronisez » : les deux sont sans effet, et les
    // proposer envoie le marchand chercher du réseau qui est déjà là.
    detail:
      "Elle repartira seule dès que l'abonnement sera réglé ou la permission accordée.",
    ton: "warning",
  },
};

/** `null` quand il n'y a rien à dire : l'acte est arrivé. */
export function libelleEnvoi(etat: EtatEnvoi | undefined): LibelleEnvoi | null {
  if (!etat || etat === "envoye") return null;
  return LIBELLES[etat];
}

/**
 * L'état le plus INQUIÉTANT d'un ensemble.
 *
 * Un bandeau qui résume plusieurs actes doit annoncer le pire : dire « attend
 * son envoi » sur un lot dont une pièce est bloquée ferait attendre un réseau
 * qui ne débloquera rien.
 */
export function pireEnvoi(etats: (EtatEnvoi | undefined)[]): EtatEnvoi {
  if (etats.some((e) => e === "bloque")) return "bloque";
  if (etats.some((e) => e === "en_attente")) return "en_attente";
  return "envoye";
}
