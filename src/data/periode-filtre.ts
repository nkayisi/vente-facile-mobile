/**
 * La période des MOUVEMENTS DE STOCK, miroir du `PeriodFilter` du back-office.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST LE TROISIÈME MODÈLE DE PÉRIODE DU TERMINAL, ET IL EST LÉGITIME.    │
 * │                                                                          │
 * │ `data/periodes.ts` porte des fenêtres GLISSANTES (jour / 7 j / 30 j /    │
 * │ 12 mois) pour le tableau de bord et l'historique ; `periodes-rapports`   │
 * │ les neuf options des rapports. La page « Mouvements » du web en a un     │
 * │ troisième, et c'est le bon pour l'approvisionnement : un MOIS PRÉCIS y   │
 * │ est un mode à part entière.                                              │
 * │                                                                          │
 * │ « C'est la maille que demandent les commerçants pour l'approvisionnement,│
 * │ et elle évite de leur faire saisir deux dates dont la seconde est        │
 * │ presque toujours mal bornée (30 ou 31) » - `filter_month`, côté serveur. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES BORNES SONT LOCALES, ET LE DOCUMENT EN DÉPEND.                       │
 * │                                                                          │
 * │ `day_bounds()` construit ses bornes en `Africa/Kinshasa` et `date_to` y  │
 * │ est INCLUSIVE. Une entrée saisie à 23h30 est déjà le lendemain en UTC :  │
 * │ la ranger par son horodatage universel la ferait disparaître du rapport  │
 * │ du jour où elle a été faite.                                             │
 * │                                                                          │
 * │ `bornesLocales` DÉRIVE de `parametresPeriode` : la fenêtre du SQL local  │
 * │ et celle du document sont donc la même par construction, et non parce    │
 * │ qu'on les surveille.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il n'ouvre pas la base, et se lit donc sans appareil.
 */
import { monthLong } from "@vente-facile/core";

import { dateDepuisJourISO, jourISO } from "./dates";

export type ModePeriode = "tout" | "jour" | "semaine" | "mois" | "personnalisee";

export interface PeriodeFiltre {
  mode: ModePeriode;
  /** « AAAA-MM », mode `mois` seul. */
  mois?: string;
  /** « AAAA-MM-JJ », mode `personnalisee` seul. */
  debut?: string;
  fin?: string;
}

export const PERIODE_TOUT: PeriodeFiltre = { mode: "tout" };

export const MODES_PERIODE: { valeur: ModePeriode; label: string }[] = [
  { valeur: "tout", label: "Tout l'historique" },
  { valeur: "jour", label: "Aujourd'hui" },
  { valeur: "semaine", label: "7 derniers jours" },
  { valeur: "mois", label: "Un mois précis" },
  { valeur: "personnalisee", label: "Période personnalisée" },
];

/** « AAAA-MM » du mois en cours. */
export function moisCourant(aujourdhui: Date = new Date()): string {
  const m = aujourdhui.getMonth() + 1;
  return `${aujourdhui.getFullYear()}-${m < 10 ? `0${m}` : m}`;
}

/** Les douze derniers mois, le courant en tête. Il n'y a pas de `input month`. */
export function moisRecents(
  aujourdhui: Date = new Date(),
  combien = 12
): { valeur: string; label: string }[] {
  const options: { valeur: string; label: string }[] = [];
  for (let i = 0; i < combien; i += 1) {
    const d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    options.push({
      valeur: `${d.getFullYear()}-${m < 10 ? `0${m}` : m}`,
      // `Intl` est PROSCRIT : Hermes n'embarque pas l'ICU complète et se replie
      // sur l'anglais SANS lever, donc jamais sur la machine du développeur.
      label: `${monthLong(d.getMonth())} ${d.getFullYear()}`,
    });
  }
  return options;
}

/**
 * Les paramètres que le SERVEUR attend. Miroir de `periodToParams`.
 *
 * Régénérer par :
 *   sed -n '54,76p' frontend/components/shared/PeriodFilter.tsx
 */
export function parametresPeriode(
  p: PeriodeFiltre,
  aujourdhui: Date = new Date()
): { month?: string; date_from?: string; date_to?: string } {
  switch (p.mode) {
    case "jour":
      return { date_from: jourISO(aujourdhui), date_to: jourISO(aujourdhui) };
    case "semaine": {
      // Sept jours GLISSANTS, bornes incluses des deux côtés - et non la
      // fenêtre de `data/periodes.ts::bornes`, dont la fin est EXCLUSIVE à
      // demain. Deux modèles distincts pour deux consommateurs distincts.
      const debut = new Date(aujourdhui);
      debut.setDate(debut.getDate() - 6);
      return { date_from: jourISO(debut), date_to: jourISO(aujourdhui) };
    }
    case "mois":
      return { month: p.mois || moisCourant(aujourdhui) };
    case "personnalisee":
      return {
        ...(p.debut ? { date_from: p.debut } : {}),
        ...(p.fin ? { date_to: p.fin } : {}),
      };
    default:
      return {};
  }
}

/** Le premier jour d'un « AAAA-MM », en local. `null` si la forme est fausse. */
function premierDuMois(mois: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mois.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** La dernière milliseconde d'une journée locale : l'équivalent de `time.max`. */
function finDeJournee(d: Date): number {
  const suivant = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return suivant.getTime() - 1;
}

/**
 * Les bornes locales en millisecondes, INCLUSIVES aux deux bouts.
 *
 * Elle passe par `parametresPeriode` : la fenêtre lue en base et celle du
 * document ne peuvent alors pas diverger.
 */
export function bornesLocales(
  p: PeriodeFiltre,
  aujourdhui: Date = new Date()
): { debutMs: number | null; finMs: number | null } {
  const params = parametresPeriode(p, aujourdhui);

  if (params.month) {
    const premier = premierDuMois(params.month);
    if (!premier) return { debutMs: null, finMs: null };
    // Le dernier jour du mois n'est PAS deviné : on prend la veille du premier
    // du mois suivant, ce que fait `filter_month` avec son `< end`. Février
    // 2024 finit donc le 29, sans qu'aucune table de longueurs n'existe ici.
    const moisSuivant = new Date(premier.getFullYear(), premier.getMonth() + 1, 1);
    return { debutMs: premier.getTime(), finMs: moisSuivant.getTime() - 1 };
  }

  const debut = dateDepuisJourISO(params.date_from);
  const fin = dateDepuisJourISO(params.date_to);
  return {
    debutMs: debut ? debut.getTime() : null,
    finMs: fin ? finDeJournee(fin) : null,
  };
}

/** Ce que la période dit en toutes lettres. Miroir de `periodDescription`. */
export function libellePeriodeFiltre(
  p: PeriodeFiltre,
  aujourdhui: Date = new Date()
): string {
  const params = parametresPeriode(p, aujourdhui);

  if (params.month) {
    const premier = premierDuMois(params.month);
    if (premier) return `${monthLong(premier.getMonth())} ${premier.getFullYear()}`;
    return params.month;
  }
  if (params.date_from && params.date_to) {
    return params.date_from === params.date_to
      ? `le ${params.date_from}`
      : `du ${params.date_from} au ${params.date_to}`;
  }
  if (params.date_from) return `à partir du ${params.date_from}`;
  if (params.date_to) return `jusqu'au ${params.date_to}`;
  return "Tout l'historique";
}

/**
 * La même période, mais TOUJOURS en `date_from` / `date_to`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `month` N'EXISTE QUE SUR LES MOUVEMENTS DE STOCK.                       │
 * │                                                                          │
 * │ `StockMovementFilter` déclare `filter_month` ; ni `CashMovementViewSet`  │
 * │ ni `ExpenseViewSet` n'en ont l'équivalent - ils ne lisent que            │
 * │ `date_from` et `date_to` dans leur `get_queryset`. Un `?month=2026-09`   │
 * │ envoyé au livre de caisse serait donc IGNORÉ EN SILENCE : la liste       │
 * │ locale montrerait septembre et le document couvrirait tout l'historique, │
 * │ sous un en-tête qui annonce septembre.                                   │
 * │                                                                          │
 * │ On garde donc le mode « un mois précis », qui est la maille du           │
 * │ commerçant, et on le traduit en deux dates avant l'envoi. Les bornes     │
 * │ viennent de `bornesLocales`, donc du même calcul que le SQL local : le   │
 * │ dernier jour n'est pas deviné, et février 2024 finit bien le 29.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function parametresPeriodeEnDates(
  p: PeriodeFiltre,
  aujourdhui: Date = new Date()
): { date_from?: string; date_to?: string } {
  const params = parametresPeriode(p, aujourdhui);
  if (!params.month) {
    return { date_from: params.date_from, date_to: params.date_to };
  }
  const { debutMs, finMs } = bornesLocales(p, aujourdhui);
  if (debutMs == null || finMs == null) return {};
  return { date_from: jourISO(new Date(debutMs)), date_to: jourISO(new Date(finMs)) };
}
