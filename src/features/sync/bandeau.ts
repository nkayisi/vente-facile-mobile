/**
 * Ce qu'un bandeau DIT d'un acte qui n'est pas encore arrivé, et s'il propose
 * de l'envoyer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN BANDEAU « ATTEND SON ENVOI » SANS ISSUE EST UN CUL-DE-SAC.           │
 * │                                                                          │
 * │ Vingt écrans annonçaient qu'une opération attendait son envoi, et pas un │
 * │ ne proposait de l'envoyer : le marchand devait deviner qu'il existe un   │
 * │ écran « Synchronisation », le trouver dans le tiroir, y aller, et        │
 * │ revenir. Sur une feuille de comptage, revenir voulait dire perdre son    │
 * │ filtre et sa position dans une liste de deux cents lignes.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR, sans base ni composant : ces phrases et cette décision sont la
 * seule chose que le marchand reçoit, et elles doivent s'éprouver sans
 * appareil. Le rendu vit à côté, dans `bandeau-envoi.tsx`.
 */
import { libelleEnvoi } from "@/data/envoi";
import type { EtatEnvoi } from "@/sync";
import type { BannerTone } from "@/ui";

export interface ContenuBandeau {
  ton: BannerTone;
  titre: string;
  message: string;
  /**
   * Le bandeau porte-t-il « Synchroniser » ?
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ JAMAIS POUR `bloque`, ET C'EST TOUT L'OBJET DE CE MODULE.             │
   * │                                                                        │
   * │ Une opération bloquée n'attend pas le réseau, elle attend une          │
   * │ DÉCISION : un abonnement à régler, un droit à accorder. Le bouton      │
   * │ ferait chercher un réseau déjà là, appuyer, lire « Synchronisation     │
   * │ terminée », et rien ne bougerait. Le marchand peut recommencer des     │
   * │ jours durant. La règle est écrite et testée dans `data/envoi.ts` ;     │
   * │ ici c'est le BOUTON qui la trahirait, pas la phrase.                   │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  offreSynchronisation: boolean;
}

/** Ce que l'écran veut dire de SON acte. */
export interface SujetBandeau {
  /** « Une opération attend son envoi », « Ce retour attend son envoi ». */
  titre: string;
  /** Ce qui n'arrivera qu'après. « Le statut ne changera qu'après. » */
  consequence: string;
}

/** `null` quand il n'y a rien à dire : l'acte est arrivé. */
export function contenuBandeau(
  envoi: EtatEnvoi | undefined,
  sujet: SujetBandeau
): ContenuBandeau | null {
  const l = libelleEnvoi(envoi);
  if (!l) return null;

  if (envoi === "bloque") {
    // ⚠ La `consequence` de l'appelant N'EST PAS reprise ici, et c'est
    // délibéré : elle dit presque toujours « après synchronisation », ce qui
    // est FAUX pour un blocage. C'est par là que le défaut se rouvrirait -
    // par la phrase de l'appelant, pas par la nôtre. Le détail de
    // `libelleEnvoi` nomme, lui, ce qui débloque réellement.
    return {
      ton: "warning",
      titre: `${sujet.titre} : ${l.court.toLowerCase()}`,
      message: l.detail,
      offreSynchronisation: false,
    };
  }

  // « info », pas « warning » : `data/envoi.ts` donne le ton `neutral` à une
  // file, parce que l'acte est NORMAL et qu'il partira seul. L'orange ferait
  // chercher un problème absent - c'est la mesure de `features/sync/apparence.ts`.
  return {
    ton: "info",
    titre: sujet.titre,
    message: `${sujet.consequence} ${l.detail}`,
    offreSynchronisation: true,
  };
}
