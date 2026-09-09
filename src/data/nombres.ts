/**
 * Lire un nombre TAPÉ À LA MAIN, sur un pavé décimal de terminal.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS ÉCRANS LISAIENT UNE SAISIE, DE TROIS FAÇONS DIFFÉRENTES.          │
 * │                                                                          │
 * │ L'ouverture de caisse envoyait la chaîne telle quelle, et le serveur     │
 * │ refusait la virgule ; la clôture faisait `replace(",", ".")` ; le devis  │
 * │ faisait de même mais tombait sur les ESPACES, un « 12 500 » donnant      │
 * │ `NaN`, ramené à zéro, puis silencieusement refusé par un bouton qui ne   │
 * │ réagissait pas. Trois lectures pour un seul geste : taper un nombre.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Le MOTIF est rendu, pas la phrase.** Un fonds de caisse négatif et une
 * quantité négative ne se disent pas de la même façon, et la phrase qu'un
 * marchand lit appartient à l'écran qui la lui montre. Ce module tranche la
 * seule chose qui ne dépend pas du contexte : ce que la chaîne VAUT.
 *
 * Module PUR : il décide de ce qui part au serveur, il doit s'éprouver sans
 * appareil.
 */

export type MotifRefus = "negatif" | "illisible";

export type LectureNombre =
  /** `valeur` à `null` : la saisie est VIDE. À l'appelant de dire ce que ça veut dire. */
  | { ok: true; valeur: number | null }
  | { ok: false; motif: MotifRefus };

/** Espace fine, espace insécable et espace ordinaire : les trois séparateurs de milliers. */
const ESPACES = /[\s  ]/g;

export function lireNombre(saisie: string): LectureNombre {
  const brut = saisie.replace(ESPACES, "");
  if (brut === "") return { ok: true, valeur: null };
  if (brut.startsWith("-")) return { ok: false, motif: "negatif" };

  // Une seule virgule est remplacée : « 12,500,50 » reste illisible, et doit
  // le rester. En français la virgule est décimale, pas un séparateur de
  // milliers, et deviner laquelle des deux le marchand voulait écrirait un
  // montant faux qui a l'air juste.
  const normalise = brut.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalise)) return { ok: false, motif: "illisible" };

  const n = Number(normalise);
  if (!Number.isFinite(n)) return { ok: false, motif: "illisible" };
  return { ok: true, valeur: n };
}
