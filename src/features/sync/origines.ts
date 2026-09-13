/**
 * Qui a demandé un cycle, et ce que le terminal a le droit de dire en retour.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE ORIGINE AUTOMATIQUE NE PARLE JAMAIS.                                │
 * │                                                                          │
 * │ La synchronisation devient automatique : elle part à la connexion, au    │
 * │ retour du réseau, après une écriture locale, à l'échéance d'une          │
 * │ temporisation. Si chacun de ces cycles annonçait son résultat, un        │
 * │ marchand en zone morte recevrait un bandeau toutes les minutes, et un    │
 * │ marchand connecté un « Synchronisation terminée » après chaque vente.    │
 * │ À ce rythme on cesse de lire les toasts, y compris celui qui comptait.   │
 * │                                                                          │
 * │ Un toast répond à une DEMANDE. Personne n'a rien demandé ici : c'est     │
 * │ l'indicateur de la barre du haut qui porte l'état, en permanence et      │
 * │ sans interrompre.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : aucune ouverture de base, aucun rendu. Il se teste seul, et
 * c'est voulu - la règle qu'il porte ne lève rien quand on l'enfreint, elle
 * rend simplement l'application bavarde ou muette au mauvais moment.
 */
import type { FailureKind } from "@/api/errors";

/**
 * `ecran` : le bouton de l'écran Synchronisation, qui a déjà sa progression
 * chiffrée et ses compteurs par table.
 * `bandeau` : le bouton d'un `BandeauEnvoi`, sur n'importe quel écran.
 * `indicateur` : l'appui sur le témoin de la barre du haut.
 * `auto` : les cinq déclencheurs automatiques, réunis sous un seul nom - ce
 * qui compte n'est pas lequel a parlé, c'est que personne ne l'a demandé.
 */
export type OrigineSync = "ecran" | "bandeau" | "indicateur" | "auto";

export function estAutomatique(origine: OrigineSync): boolean {
  return origine === "auto";
}

/**
 * Un toast s'annonce-t-il au bout du cycle ?
 *
 * `ecran` ne notifie PAS : sa page rend déjà la progression et l'erreur, et un
 * toast par-dessus serait du bruit. C'est la règle d'origine du fournisseur, et
 * elle ne change pas.
 */
export function doitNotifier(origine: OrigineSync): boolean {
  return origine === "bandeau" || origine === "indicateur";
}

/**
 * L'échec s'inscrit-il dans l'état partagé, que l'écran Synchronisation rend
 * dans son bandeau rouge « Interrompue » ?
 *
 * **Un échec RÉSEAU d'un cycle automatique ne se signale pas.** Il ne dit rien
 * d'autre que « il n'y a pas de réseau », ce que l'indicateur annonce déjà par
 * son nuage barré ; le peindre en rouge apprendrait à ne plus voir les bandeaux
 * rouges, et c'est précisément là qu'un vrai refus se cacherait ensuite.
 *
 * Tout le reste se signale, même en automatique : un 500, un refus de
 * serializer, une table qui ne descend plus. Ceux-là ne se réparent pas en
 * attendant, et le marchand doit pouvoir en parler à quelqu'un.
 */
export function doitSignaler(origine: OrigineSync, kind: FailureKind | null): boolean {
  if (!estAutomatique(origine)) return true;
  return kind !== "network";
}
