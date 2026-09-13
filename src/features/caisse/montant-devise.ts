/**
 * Ce qu'un changement de devise fait au montant déjà tapé.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON CONVERTIT, ON N'EFFACE JAMAIS.                                       │
 * │                                                                          │
 * │ C'est la règle de `CurrencyAmountInput.selectCurrency` du back-office,   │
 * │ et son commentaire la dit mieux que nous : « changer de devise ne doit   │
 * │ pas changer la valeur voulue par le marchand ». Un caissier qui tape     │
 * │ 46 000 en francs puis bascule en dollars veut toujours la même somme,    │
 * │ pas un champ vide ni quarante-six mille dollars.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON LIT PAR `lireNombre`, ET SURTOUT PAS PAR `parseFloat`.               │
 * │                                                                          │
 * │ Le web fait `parseFloat`, et c'est inoffensif chez lui : son champ est   │
 * │ un `<input type="number">` où l'espace ne se tape pas. Au pouce, sur un  │
 * │ pavé décimal, « 12 500 » s'écrit tous les jours - et `parseFloat` en     │
 * │ tire DOUZE. Le montant serait converti à partir d'une valeur fausse,     │
 * │ sans que rien ne le signale.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il décide de ce qui part au serveur, il doit s'éprouver sans
 * appareil. Aucune arithmétique n'y est écrite - `convMoney` vient du noyau,
 * qui est la seule vérité sur les taux (§5.1).
 */
import { lireNombre } from "@/data/nombres";

/** Ce que le noyau fournit, réduit à ce dont ce module a besoin. */
export interface Conversion {
  /** `money.convMoney` : convertit par la devise principale, puis arrondit. */
  convertir: (montant: number, de: string, vers: string) => number;
  /** Décimales de la devise, pour ne pas rendre « 46000.000000001 ». */
  decimales: (code: string) => number;
}

/**
 * Le montant tapé, ré-exprimé dans la devise choisie.
 *
 * Rend TOUJOURS une chaîne : les décimales voyagent en texte, jamais en
 * nombre (§5.3 règle 3). Une saisie vide, illisible ou nulle est rendue
 * VERBATIM - c'est ce que fait le web, et c'est ce qui permet de basculer de
 * devise avant d'avoir tapé quoi que ce soit.
 */
export function convertirSaisie(
  saisie: string,
  de: string,
  vers: string,
  conv: Conversion
): string {
  if (de === vers) return saisie;

  const lecture = lireNombre(saisie);
  if (!lecture.ok || lecture.valeur == null || lecture.valeur <= 0) return saisie;

  const converti = conv.convertir(lecture.valeur, de, vers);
  if (!Number.isFinite(converti)) return saisie;

  // `toFixed` puis retrait des zéros de queue : « 46000 » et non « 46000.00 »
  // pour une devise à deux décimales dont le montant tombe rond, et jamais la
  // notation exponentielle que `String(1e21)` produirait.
  const texte = converti.toFixed(Math.max(0, Math.min(20, conv.decimales(vers))));
  return texte.includes(".") ? texte.replace(/\.?0+$/, "") : texte;
}

/**
 * Faut-il montrer le repère « = 46 000 FC · 1 USD = 2 300 FC » ?
 *
 * Les trois conditions du web (`showConversion`), dans le même ordre :
 * l'établissement est multi-devise, la devise choisie n'est pas la principale,
 * et le montant lu est strictement positif. Un repère affiché sur un champ
 * vide ne renseigne personne et occupe une ligne.
 */
export function montrerConversion(
  saisie: string,
  devise: string,
  principale: string,
  nombreDeDevises: number
): boolean {
  if (nombreDeDevises <= 1 || devise === principale) return false;
  const lecture = lireNombre(saisie);
  return lecture.ok && lecture.valeur != null && lecture.valeur > 0;
}
