/**
 * Dates courtes en français, SANS `Intl`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `Intl` EST PROSCRIT DANS CETTE APPLICATION, ET LE REPLI EST SILENCIEUX. │
 * │                                                                          │
 * │ C'est la raison d'être d'`intl-fr.ts` dans `@vente-facile/core` : une    │
 * │ locale que le moteur ne reconnaît pas ne lève PAS, elle se replie sur    │
 * │ l'anglais. « lundi 31 août » sortirait « Monday, August 31 » sur le      │
 * │ terminal d'un marchand, et jamais sur la machine du développeur ni sur   │
 * │ l'émulateur qui a servi à écrire l'écran. Le défaut ne se découvre donc  │
 * │ qu'en production, sur un parc qu'on ne voit pas.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le noyau couvre déjà « 31 août 2026 » (`formatDateFr`), « 31 août, 14:07 »
 * (`formatDateTimeFr`) et « 14:07 » (`formatTimeFr`). Ce module ne porte que
 * les deux formes NUMÉRIQUES qui lui manquent, et il les rend **au caractère
 * près** comme le faisaient les appels qu'il remplace : la migration ne doit
 * rien changer à ce que le marchand lit.
 */
import { monthLong, weekdayLong } from "@vente-facile/core";

const deux = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** « 31/08/2026 ». Rendu de `toLocaleDateString("fr-CD")`. */
export function dateCourteFr(d: Date): string {
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** « 31/08/2026 14:07:09 ». Rendu de `toLocaleString("fr-FR")`. */
export function dateHeureCourteFr(d: Date): string {
  return `${dateCourteFr(d)} ${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`;
}

/**
 * « Lundi 31 août », première lettre en capitale.
 *
 * Le jour de la semaine est en tête parce que c'est ce qu'un marchand vérifie
 * d'un coup d'œil sur un écran de journée : il sait quel jour on est, il veut
 * confirmer que l'écran parle bien d'aujourd'hui.
 */
export function jourEnLettresFr(d: Date): string {
  const s = `${weekdayLong(d.getDay())} ${d.getDate()} ${monthLong(d.getMonth())}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
