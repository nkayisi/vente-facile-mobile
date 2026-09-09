/**
 * Le code de la devise principale, lisible HORS de React.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE DEVISE VIDE N'EST PAS UN DÉFAUT D'AFFICHAGE.                        │
 * │                                                                          │
 * │ `money(x, "")` rend le nombre SANS SYMBOLE, en silence : `symbolOf` du   │
 * │ noyau ne se replie sur la devise par défaut que si le code lui EST       │
 * │ ÉGAL, et la chaîne vide ne l'est pas. Dans une application où le même    │
 * │ chiffre vaut soit trois dollars, soit trois francs, « 190 240,5 » est    │
 * │ un montant que personne ne peut lire - et il a l'air correct.            │
 * │                                                                          │
 * │ Pire, `observabilite/rature.ts` ANCRE les montants sur leur devise pour  │
 * │ les raturer avant envoi à Sentry. Un montant sans symbole n'est donc pas │
 * │ raturé et part en clair. Le défaut n'était pas cosmétique, c'était une   │
 * │ fuite de donnée par un chemin que ni le garde-fou ni la rature ne        │
 * │ signalaient.                                                             │
 * │                                                                          │
 * │ Vingt lectures de `data/` fabriquaient pourtant `?? ""`, censément par   │
 * │ prudence : elles produisaient exactement ce qu'elles prétendaient        │
 * │ éviter.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Le repli est la devise PRINCIPALE de l'établissement**, jamais la chaîne
 * vide et jamais `null`. Les lignes d'avant le multi-devise n'ont pas *perdu*
 * leur devise : l'établissement n'en avait qu'une, la sienne. La rétablir ne
 * ment donc pas, elle répare. Le serveur applique désormais la même règle à
 * l'écriture (`CurrencyService.resolve`, appelé dans chaque `save()`), si bien
 * qu'aucune ligne tirée ne devrait plus arriver sans devise : ce repli est une
 * ceinture, pas une bretelle.
 *
 * Module PUR, sans React ni base : il est appelé depuis la couche `data/`, où
 * un hook n'a pas sa place et où un accès asynchrone au stockage coûterait une
 * lecture par ligne de liste.
 */
import { getDefaultCurrency } from "@vente-facile/core";

/**
 * Le code de la devise principale. **Jamais vide.**
 *
 * La valeur est posée au démarrage par `useDeviseParDefaut`, qui appelle
 * `setDefaultCurrency` avec le code de l'établissement ; avant ce montage, le
 * noyau porte « CDF », la devise par défaut du produit. `setDefaultCurrency`
 * n'écrit le code que s'il est non vide, donc le repli ne peut pas dégénérer.
 */
export function devisePrincipale(): string {
  return getDefaultCurrency().code || "CDF";
}

/**
 * Rend `devise` si elle en est une, sinon la principale.
 *
 * Un point de passage unique : c'est ce qui permet au garde-fou de doctrine
 * d'interdire `?? ""` sans avoir à comprendre chaque site d'appel.
 */
export function deviseOuPrincipale(devise: string | null | undefined): string {
  return (devise ?? "").trim() || devisePrincipale();
}

/**
 * Rend `devise` si elle en est une, sinon le `repli` DONNÉ.
 *
 * Pour les cas où la principale globale n'est pas la bonne référence : un
 * rapport porte la devise de son contexte, qui peut différer de celle de la
 * session au moment où on le relit. Le repli reste obligatoire et non vide -
 * c'est tout l'objet.
 */
export function deviseOuRepli(devise: unknown, repli: string): string {
  const v = typeof devise === "string" ? devise.trim() : "";
  return v || repli;
}
