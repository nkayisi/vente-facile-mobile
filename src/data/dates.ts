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
 * « 06 septembre 2026 », quantième sur DEUX chiffres.
 *
 * C'est la forme que le back-office compose par
 * `toLocaleDateString("fr-CD", { day: "2-digit", month: "long", year: "numeric" })`,
 * et qu'on ne peut pas recopier : `Intl` est proscrit ici, Hermes n'embarquant
 * pas l'ICU complète - une locale qu'il ne reconnaît pas ne LÈVE PAS, elle se
 * replie sur l'anglais, donc jamais sur la machine du développeur.
 *
 * Les deux chiffres ne sont pas du zèle : ils alignent les noms de sessions
 * d'inventaire quand on les lit en liste.
 */
export function dateLongueFr(d: Date): string {
  return `${deux(d.getDate())} ${monthLong(d.getMonth())} ${d.getFullYear()}`;
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

/**
 * « 2026-08-31 », le jour au format que le serveur attend.
 *
 * Les composantes sont LOCALES : `toISOString()` bascule en UTC, et un acte
 * saisi à 23 h 30 à Kinshasa s'y daterait du lendemain - il tomberait alors
 * dans le rapport du mauvais jour, et personne ne le verrait.
 */
export function jourISO(d: Date): string {
  const deux = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

/**
 * L'inverse de `jourISO` : « 2026-09-02 » vers une date LOCALE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `new Date("2026-09-02")` N'EST PAS LE 2 SEPTEMBRE PARTOUT.              │
 * │                                                                          │
 * │ La forme courte est interprétée en UTC par la spécification, si bien que │
 * │ la date obtenue est minuit UTC : sur un fuseau en retard sur Greenwich   │
 * │ elle se rend « 01 sept. ». L'arrêté d'un rapport daterait donc de la     │
 * │ veille, et le marchand conclurait que ses créances n'ont pas été mises à │
 * │ jour. Kinshasa étant en avance, le défaut ne se verrait jamais ici - ce  │
 * │ qui est précisément ce qui le rend dangereux à laisser.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Rend `null` sur une chaîne qui n'est pas une date : un rapport dont l'arrêté
 * est illisible ne doit pas afficher « Invalid Date » au marchand.
 */
export function dateDepuisJourISO(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Fraîcheur d'un horodatage, en clair.
 *
 * Écrite en double : l'écran Synchronisation en avait une copie privée, et le
 * témoin de la barre du haut en réclamait une. Deux formulations du même
 * chiffre sur deux écrans qui parlent de la MÊME synchronisation feraient
 * douter qu'il s'agisse de la même.
 *
 * `null` se lit « jamais », jamais « à l'instant » : une base qui n'a jamais
 * été tirée n'est pas une base fraîche.
 */
export function ilYA(valeur: Date | null, maintenant: Date = new Date()): string {
  if (!valeur) return "jamais";
  const minutes = Math.round((maintenant.getTime() - valeur.getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} j`;
}
