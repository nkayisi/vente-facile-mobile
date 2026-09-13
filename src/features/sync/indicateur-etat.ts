/**
 * Ce que le témoin de la barre du haut montre, et ce qu'il annonce à voix haute.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ICÔNE DIT L'ÉTAT COURANT, JAMAIS LE PROCHAIN.                         │
 * │                                                                          │
 * │ Un glyphe qui annonce ce qu'on obtiendra en appuyant se lit à l'envers   │
 * │ une fois sur deux. C'est la règle déjà posée par la bascule de thème,    │
 * │ son voisin immédiat dans la barre : ici aussi, le dessin dit où l'on en  │
 * │ est, et l'étiquette d'accessibilité porte le geste.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il ne connaît ni le temps qui passe, ni le rendu. La durée
 * minimale d'affichage de la rotation est une règle de RENDU et vit dans le
 * composant ; ici on ne décrit qu'un état.
 */
import { libelleEnvoi } from "@/data/envoi";
import type { OutboxState } from "@/sync";

/** Les seuls glyphes que ce module peut demander. Tous sont déjà au registre. */
export type IconeIndicateur =
  | "RefreshCw"
  | "AlertTriangle"
  | "CloudOff"
  | "Clock"
  | "CheckCircle2";

/** Jetons du thème, jamais une couleur littérale. */
export type CouleurIndicateur = "primary" | "mutedForeground" | "warning" | "destructive";

export interface EtatIndicateur {
  icone: IconeIndicateur;
  couleur: CouleurIndicateur;
  /** La rotation ne tourne que pendant un cycle. */
  anime: boolean;
  /** Décompte en pastille, ou `null` quand il n'y a rien à compter. */
  badge: string | null;
  /** Étiquette d'accessibilité : l'état PUIS le geste le plus utile. */
  libelle: string;
  hint: string;
}

/** Au-delà, le nombre exact n'apprend plus rien et ne tient plus dans la pastille. */
export const PLAFOND_BADGE = 99;

const HINT = "Pression longue pour le détail de la synchronisation.";

/**
 * Accord en nombre. « +1 nouveaux » ne s'accorde pas, et le dépôt a déjà dû
 * corriger cette faute sur le tableau de bord : on ne compose pas une phrase
 * française en collant un « (s) ».
 */
function accord(n: number, un: string, plusieurs: string): string {
  return n <= 1 ? `${n} ${un}` : `${n} ${plusieurs}`;
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PASTILLE COMPTE TOUT CE QUI N'EST PAS ARRIVÉ, QUARANTAINE COMPRISE.  │
 * │                                                                          │
 * │ La tentation est de n'y mettre que ce qui partira tout seul, et de       │
 * │ laisser les refus à l'écran « Opérations à corriger ». Ce serait         │
 * │ répéter un défaut que ce dépôt a déjà payé : une opération bloquée était │
 * │ invisible, le compteur d'attente ne descendait jamais, et personne ne    │
 * │ savait pourquoi.                                                         │
 * │                                                                          │
 * │ Le nombre répond à UNE question - « combien de mes actes ne sont pas     │
 * │ chez le serveur » - et chacun d'eux appelle quelque chose : le réseau,   │
 * │ un droit, ou une correction. C'est l'ICÔNE qui dit lequel domine.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `done` n'y entre pas : l'opération est arrivée, sa trace attend seulement
 * d'être purgée.
 */
function pastille(c: Record<OutboxState, number>): string | null {
  const total = c.pending + c.inflight + c.blocked + c.quarantined;
  if (total <= 0) return null;
  return total > PLAFOND_BADGE ? `${PLAFOND_BADGE}+` : String(total);
}

export function etatIndicateur(e: {
  cycleEnCours: boolean;
  enLigne: boolean;
  compteurs: Record<OutboxState, number>;
}): EtatIndicateur {
  const c = e.compteurs;
  const badge = pastille(c);
  const enAttente = c.pending + c.inflight;

  // Un cycle qui tourne prime sur tout : c'est la seule information que
  // l'utilisateur ne peut deviner d'aucune autre façon, et elle est fugace.
  if (e.cycleEnCours) {
    return {
      icone: "RefreshCw",
      couleur: "primary",
      anime: true,
      badge,
      libelle: "Synchronisation en cours.",
      hint: HINT,
    };
  }

  // Un refus vient EN PREMIER, avant même l'absence de réseau : il ne se
  // répare pas en attendant, il demande une décision humaine, et il ne
  // repartira jamais de lui-même.
  if (c.quarantined > 0) {
    return {
      icone: "AlertTriangle",
      couleur: "destructive",
      anime: false,
      badge,
      libelle: `${accord(c.quarantined, "opération refusée", "opérations refusées")} par le serveur. Pression longue pour les corriger.`,
      hint: HINT,
    };
  }

  // Bloqué n'est pas refusé : l'opération est conservée et repartira seule dès
  // que l'abonnement sera réglé ou la permission accordée. On reprend le
  // vocabulaire de `data/envoi.ts` : deux écrans qui nomment différemment le
  // même état font douter qu'il s'agisse du même.
  if (c.blocked > 0) {
    const l = libelleEnvoi("bloque");
    return {
      icone: "AlertTriangle",
      couleur: "warning",
      anime: false,
      badge,
      libelle: `${accord(c.blocked, "opération", "opérations")} ${l ? l.court.toLowerCase() : "en attente d'un droit"}.`,
      hint: HINT,
    };
  }

  if (!e.enLigne) {
    return {
      icone: "CloudOff",
      couleur: "mutedForeground",
      anime: false,
      badge,
      libelle:
        enAttente > 0
          ? `Hors ligne. ${accord(enAttente, "opération attend", "opérations attendent")} le réseau.`
          : "Hors ligne.",
      hint: HINT,
    };
  }

  if (enAttente > 0) {
    return {
      icone: "Clock",
      couleur: "mutedForeground",
      anime: false,
      badge,
      libelle: `${accord(enAttente, "opération attend son envoi", "opérations attendent leur envoi")}. Appuyer pour synchroniser.`,
      hint: HINT,
    };
  }

  // Rien à signaler. Le témoin reste VISIBLE et discret : il est le chemin
  // permanent vers une synchronisation manuelle, et un bouton qui disparaît
  // quand tout va bien est un bouton qu'on ne trouve plus quand il le faut.
  return {
    icone: "CheckCircle2",
    couleur: "mutedForeground",
    anime: false,
    badge: null,
    libelle: "Tout est synchronisé. Appuyer pour vérifier.",
    hint: HINT,
  };
}
