/**
 * Quel entrepôt une dépense doit porter, et ce que ça change pour son auteur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE DÉPENSE SANS ENTREPÔT EST INVISIBLE À SON PROPRE AUTEUR.            │
 * │                                                                          │
 * │ `ExpenseViewSet.get_queryset` appelle `restrict_visibility_for_request`  │
 * │ avec `include_null_warehouse=False`, et c'est DÉLIBÉRÉ côté serveur :    │
 * │ les charges d'établissement - loyer, salaires - restent au propriétaire. │
 * │ Mais ni le back-office ni le terminal n'envoyaient d'entrepôt, si bien   │
 * │ qu'un GÉRANT qui saisit une dépense la perd de vue à la seconde où elle  │
 * │ part. Elle n'est pas perdue, elle est invisible - ce qui est pire, parce │
 * │ qu'il la ressaisit.                                                      │
 * │                                                                          │
 * │ Un membre borné par auteur voit ses propres lignes sans entrepôt :       │
 * │ l'entrepôt ne change rien à SA visibilité. Il décide en revanche si le   │
 * │ gérant qui doit approuver verra jamais son brouillon.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DÉFAUT SE PREND DANS LES ENTREPÔTS ACTIONNABLES, JAMAIS DANS TOUTE   │
 * │ LA TABLE.                                                                │
 * │                                                                          │
 * │ `create_expense` oppose `exiger_entrepot_actionnable` dès qu'un          │
 * │ entrepôt est présent : un entrepôt hors périmètre lève une erreur de     │
 * │ validation, donc verdict `rejected`, donc quarantaine. Un                │
 * │ `entrepotParDefaut(tousLesEntrepots)` naïf enverrait donc TOUTES les     │
 * │ dépenses d'un gérant affecté à la boutique B vers la quarantaine, parce  │
 * │ que la boutique A porte `is_default`.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il décide de ce qui part au serveur, il doit s'éprouver sans
 * appareil.
 */
import { estBorneParAuteur, litTousLesEntrepots } from "@vente-facile/core";

import { entrepotParDefaut } from "@/data/entrepot-defaut";
import {
  entrepotsActionnablesDuMembre,
  type EntrepotNomme,
  type MembreDuTerminal,
} from "@/features/perimetre/entrepots";

export type { EntrepotNomme, MembreDuTerminal };

/**
 * L'entrepôt à proposer d'emblée, pris dans les seuls ACTIONNABLES.
 *
 * Rend `null` quand il y a plusieurs dépôts et aucun principal : deviner ferait
 * rattacher la dépense au mauvais établissement, et le marchand ne s'en
 * apercevrait qu'en cherchant une pièce qu'il ne retrouve pas.
 *
 * ⚠ ACTIONNABLES, PAS LISIBLES : un membre « Consulter tous » lit tous les
 * dépôts, et lui proposer le principal d'un autre ferait refuser sa dépense en
 * `consultation_seule`, donc la ferait partir en quarantaine.
 */
export function entrepotDeLaDepense(
  membre: MembreDuTerminal,
  tous: EntrepotNomme[]
): string | null {
  return entrepotParDefaut(entrepotsActionnablesDuMembre(membre, tous));
}

/**
 * Cette dépense échappera-t-elle à la vue de son auteur une fois envoyée ?
 *
 * C'est la règle du serveur (`borner_visibilite`), prise à l'envers : une
 * dépense SANS entrepôt n'est lue que par qui lit tout (propriétaire, case
 * « Consulter tous ») et par son AUTEUR quand il est borné par auteur. Un
 * gérant, qui lit le travail de ses collègues, ne la reverrait pas.
 *
 * Le propriétaire n'est jamais averti : `null` lui est licite, et c'est même le
 * seul moyen d'enregistrer une charge d'établissement.
 */
export function depenseSeraitInvisible(
  membre: MembreDuTerminal,
  entrepotChoisi: string | null
): boolean {
  if (entrepotChoisi !== null || membre.role === null) return false;
  if (litTousLesEntrepots(membre)) return false;
  return !estBorneParAuteur(membre, "lecture");
}

/**
 * Le membre ne peut-il saisir AUCUNE dépense utile ?
 *
 * Vrai quand il n'a aucun entrepôt où agir ET qu'une dépense sans entrepôt lui
 * serait invisible. Le formulaire le DIT au lieu de laisser enregistrer une
 * pièce que personne ne reverra : c'est « `null` ne se lit jamais comme zéro »
 * appliqué à la visibilité. Le MOTIF (aucune affectation, ou seulement des
 * entrepôts désactivés) vient de `verrouEntrepot` du noyau.
 */
export function saisieSansIssue(
  membre: MembreDuTerminal,
  tous: EntrepotNomme[]
): boolean {
  return (
    entrepotsActionnablesDuMembre(membre, tous).length === 0 &&
    depenseSeraitInvisible(membre, null)
  );
}
