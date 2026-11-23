/**
 * Une touche du lecteur de codes, au comptoir : scan, ou frappe dans la
 * recherche.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA RÈGLE EST CELLE DU WEB, ET ELLE VIT DANS LE NOYAU.                    │
 * │                                                                          │
 * │ `frapper` et `candidatsDuScan` viennent de `@vente-facile/core/pos` :    │
 * │ quatre caractères à moins de quarante millisecondes, puis Entrée. Ce     │
 * │ module ne fait que tenir le champ de recherche, que le navigateur tient  │
 * │ lui-même sur le web.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Pourquoi le tenir ici : le module natif CONSOMME les touches d'un clavier
 * physique pendant la capture (sans quoi l'Entrée d'un scan validerait aussi
 * la recherche). Une touche tapée dans la recherche doit donc y être ajoutée
 * par nous : c'est ce que le navigateur fait sur le web avant que la page voie
 * la rafale. Le clavier À L'ÉCRAN, lui, n'est jamais touché.
 *
 * Module PUR : l'instant de chaque touche est injecté.
 */
import {
  candidatsDuScan,
  DOUCHETTE_AU_REPOS,
  frapper,
  type EtatDouchette,
} from "@vente-facile/core/pos";

export const COMPTOIR_AU_REPOS: EtatDouchette = DOUCHETTE_AU_REPOS;

/** Le champ de recherche du comptoir, tel qu'il est au moment de la touche. */
export interface Recherche {
  focalisee: boolean;
  terme: string;
}

export type EffetTouche =
  /** Rien à faire : une rafale en cours, ou une frappe hors de la recherche. */
  | { type: "rien" }
  /** La recherche change : une frappe humaine au clavier physique. */
  | { type: "terme"; terme: string }
  /**
   * Un scan. `terme` : le nouveau terme de la recherche (vidé, comme le web),
   * ou `null` quand le scan n'est pas passé par elle.
   */
  | { type: "scan"; candidats: string[]; terme: string | null }
  /** Entrée sans rafale, dans la recherche : la validation habituelle. */
  | { type: "valider"; terme: string };

/** Retire le dernier caractère, sans couper un caractère hors du plan de base. */
function sansDernier(texte: string): string {
  return Array.from(texte).slice(0, -1).join("");
}

export function frapperAuComptoir(
  etat: EtatDouchette,
  touche: string,
  instant: number,
  recherche: Recherche
): { etat: EtatDouchette; effet: EffetTouche } {
  const r = frapper(etat, touche, instant);

  if (touche === "Enter") {
    if (r.code) {
      return {
        etat: r.etat,
        effet: {
          type: "scan",
          // Tapé dans la recherche, le champ porte le code ENTIER : il rattrape
          // une rafale tronquée en tête (le premier caractère arrivé en retard).
          candidats: candidatsDuScan(r.code, recherche.focalisee ? recherche.terme : null),
          terme: recherche.focalisee ? "" : null,
        },
      };
    }
    return {
      etat: r.etat,
      effet: recherche.focalisee ? { type: "valider", terme: recherche.terme } : { type: "rien" },
    };
  }

  if (!recherche.focalisee) return { etat: r.etat, effet: { type: "rien" } };

  if (touche === "Backspace") {
    return { etat: r.etat, effet: { type: "terme", terme: sansDernier(recherche.terme) } };
  }
  if (Array.from(touche).length === 1) {
    return { etat: r.etat, effet: { type: "terme", terme: recherche.terme + touche } };
  }
  return { etat: r.etat, effet: { type: "rien" } };
}

/** Un code reçu par message système : un scan complet, hors de la recherche. */
export function scanDiffuse(code: string): EffetTouche {
  const lu = code.trim();
  return lu ? { type: "scan", candidats: [lu], terme: null } : { type: "rien" };
}

/**
 * ─── Le terme de la recherche, entre deux rendus.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE RAFALE VA PLUS VITE QUE LES RENDUS.                                  │
 * │                                                                          │
 * │ Relevé sur le rk3568 : un lecteur tape dix caractères en quelques        │
 * │ millisecondes, et l'écran n'a pas le temps de se redessiner entre deux.  │
 * │ Relire le terme RENDU à chaque touche repartait donc toujours du même    │
 * │ texte : le champ ne gardait que le dernier caractère, et un scan tronqué │
 * │ en tête annonçait « introuvable » au lieu d'essayer le code entier.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * On retient ce qu'on vient d'écrire. Une valeur rendue qui est l'ancienne,
 * ou l'une de celles qu'on a écrites depuis, est EN RETARD : on garde la
 * dernière écrite. Toute autre vient d'ailleurs (le clavier à l'écran, un
 * effacement de l'écran) et fait foi.
 */
export interface TermeTenu {
  /** Le terme rendu au moment de la première écriture. */
  base: string;
  /** Ce qu'on a écrit depuis, dans l'ordre. */
  emis: string[];
}

export function termeCourant(
  tenu: TermeTenu | null,
  rendu: string
): { tenu: TermeTenu | null; terme: string } {
  if (!tenu) return { tenu: null, terme: rendu };
  const dernier = tenu.emis[tenu.emis.length - 1] ?? tenu.base;
  if (rendu === dernier) return { tenu: null, terme: rendu };
  if (rendu === tenu.base || tenu.emis.includes(rendu)) return { tenu, terme: dernier };
  return { tenu: null, terme: rendu };
}

export function retenirTerme(tenu: TermeTenu | null, rendu: string, valeur: string): TermeTenu {
  const base = tenu ?? { base: rendu, emis: [] };
  return { base: base.base, emis: [...base.emis, valeur] };
}
