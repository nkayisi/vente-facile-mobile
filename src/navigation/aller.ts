/**
 * Aller à une section du menu sans empiler une seconde coquille.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `router.push` EMPILE, ET SUR UNE TABLETTE C'EST UN DÉFAUT.              │
 * │                                                                          │
 * │ Sur un téléphone, le menu ne s'ouvre que depuis un onglet : `push` vers  │
 * │ un autre onglet y devient un saut d'onglet, et rien ne s'empile. Sur une │
 * │ tablette, la barre latérale reste à l'écran pendant qu'on lit une fiche  │
 * │ poussée par la pile (`/vente/…`). Depuis là, `push("/stock")` pousserait │
 * │ une SECONDE instance de la coquille d'onglets par-dessus la fiche, puis  │
 * │ une troisième au geste suivant : le retour d'Android remonterait toutes  │
 * │ ces coquilles l'une après l'autre.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le geste dépend donc d'OÙ l'on est, et c'est mesuré dans la source embarquée
 * d'expo-router (`getNavigationAction.js`, `StackRouter.js`, `TabRouter.js`) :
 *
 * - **depuis un onglet**, `navigate` : l'action vise le navigateur d'onglets
 *   et devient un saut d'onglet. ⚠ PAS `dismissTo` : il produit un `POP_TO`
 *   que le routeur d'onglets ne sait pas traiter (seul le type `expo-tab` des
 *   onglets natifs le convertit en saut, et ce ne sont pas les nôtres). Vu sur
 *   l'émulateur : l'appui ne faisait RIEN, sans une erreur.
 * - **depuis une fiche de pile**, `dismissTo` : un `POP_TO` sur la pile de
 *   l'application, qui dépile jusqu'à la coquille existante et y choisit
 *   l'onglet. Si la coquille n'est pas dans la pile - une fiche ouverte par un
 *   lien profond -, elle remplace l'écran courant, ce qui est aussi juste.
 *
 * ⚠ RÉSERVÉ AUX ROUTES D'ONGLET. Une destination de pile (une fiche, « Ma
 * journée », un écran de l'appareil) se pousse : on veut pouvoir en revenir.
 */
import { router } from "expo-router";

import { estUneRouteDOnglet, gestePourSection } from "./onglets";

export function allerALaSection(href: string, depuis: string | null | undefined): void {
  if (gestePourSection(depuis) === "navigate") router.navigate(href as never);
  else router.dismissTo(href as never);
}

/** Une section se rejoint, une destination de pile se pousse. */
export function allerA(href: string, depuis: string | null | undefined): void {
  if (estUneRouteDOnglet(href)) allerALaSection(href, depuis);
  else router.push(href as never);
}
