/**
 * Ce qui n'a pas encore atteint le serveur, et ce que le document n'en dira pas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « ABSENT » N'EST PAS « EN ATTENTE ».                                     │
 * │                                                                          │
 * │ `envoi` n'existe QUE sur une pièce venue du journal : une vente tirée du │
 * │ serveur n'en porte pas. Tester `envoi !== "envoye"` comptait donc toutes │
 * │ les ventes acquises comme en attente, et l'écran annonçait « 5 ventes    │
 * │ attendent leur envoi » sur cinq ventes que le serveur avait déjà.        │
 * │                                                                          │
 * │ Relevé à l'écran, sur l'émulateur : rien dans le code ne le signalait,   │
 * │ le champ étant simplement optionnel.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ET « BLOQUÉ » N'EST PAS « ATTEND LE RÉSEAU ».                            │
 * │                                                                          │
 * │ Une opération bloquée manque au document tout autant - on la compte donc │
 * │ - mais elle n'attend pas le réseau : elle attend une DÉCISION, un        │
 * │ abonnement à régler ou un droit à accorder. « Synchronisez pour          │
 * │ l'obtenir complet » envoie alors le marchand chercher un réseau déjà là, │
 * │ appuyer, lire « Synchronisation terminée », et recommencer des jours     │
 * │ durant. C'est la règle que `features/sync/bandeau.ts` fait respecter sur │
 * │ les bandeaux ; ici c'est la QUEUE de la phrase qui la trahissait.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : ces phrases sont la seule chose que le marchand reçoit, et
 * elles doivent s'éprouver sans appareil.
 */
import { lotEnAttente, type LotEnAttente } from "@/features/sync/attente";
import type { EtatEnvoi } from "@/sync";

/**
 * Ce qui attend dans un lot de pièces LUES À L'ÉCRAN, et dans quel état.
 *
 * Rend un `LotEnAttente` et non un nombre nu : c'est l'état qui décide de la
 * phrase, et un compteur seul l'aurait jetée. Les écrans qui lisent déjà le
 * journal (les mouvements de stock) tiennent ce lot de première main et n'ont
 * pas à passer par ici.
 */
export function compterEnFile(
  ventes: { envoi?: EtatEnvoi | null }[]
): LotEnAttente {
  return lotEnAttente(
    ventes
      .filter((v) => v.envoi && v.envoi !== "envoye")
      .map((v) => ({ envoi: v.envoi as EtatEnvoi }))
  );
}

/**
 * Ce que le document ne dira pas, dit avant le partage.
 *
 * `null` quand il n'y a rien à annoncer : un avertissement permanent finit par
 * ne plus se lire, et celui-ci doit se voir le jour où il compte.
 *
 * Le message est FABRIQUÉ et non recopié par écran : c'est un accord en genre
 * et en nombre sur trois mots à la fois (« ventes attendent leur », « ne
 * figureront »), et deux copies de cette phrase finiraient par n'en accorder
 * que deux. Le nom de la pièce est le seul paramètre.
 */
function avertissement(
  lot: LotEnAttente,
  singulier: string,
  pluriel: string
): string | null {
  if (lot.nombre <= 0) return null;
  const p = lot.nombre > 1;
  const tete =
    `${lot.nombre} ${p ? `${pluriel} attendent leur` : `${singulier} attend son`} envoi et ` +
    `${p ? "ne figureront" : "ne figurera"} pas dans ce document.`;
  return `${tete} ${queue(lot.envoi)}`;
}

/**
 * Ce qu'il faut faire pour obtenir le document complet.
 *
 * ⚠ La queue de blocage NE REPREND PAS `libelleEnvoi("bloque").detail` mot
 * pour mot : « Elle repartira seule… » s'accorde avec une « opération »
 * féminine singulière, et l'écran des mouvements dirait « 3 mouvements…
 * Elle repartira ». Elle est donc écrite SANS GENRE ni NOMBRE.
 *
 * Le PIRE l'emporte (`pireEnvoi`, doctrine déjà posée), et la formulation le
 * supporte : sur un lot mixte, au moins une pièce est bloquée, donc
 * synchroniser seul ne rendra effectivement pas le document complet.
 */
function queue(envoi: EtatEnvoi | undefined): string {
  if (envoi === "bloque") {
    return (
      "L'envoi attend un droit : l'abonnement doit être réglé ou la " +
      "permission accordée. Synchroniser n'y suffira pas."
    );
  }
  return "Synchronisez pour l'obtenir complet.";
}

export function avertissementDeFile(lot: LotEnAttente): string | null {
  return avertissement(lot, "vente", "ventes");
}

/**
 * Le même écart, sur les mouvements de stock.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN NE MONTRE PAS SES PROPRES MOUVEMENTS EN FILE, ET LE DOCUMENT  │
 * │ NON PLUS.                                                                │
 * │                                                                          │
 * │ `stock_movements` est une table TIRÉE : une saisie hors ligne vit dans   │
 * │ le journal, pas dans la table, donc elle n'est ni dans la liste ni dans  │
 * │ le fichier. Les deux sont cohérents, mais le magasinier qui vient de     │
 * │ saisir une entrée doit savoir POURQUOI il ne la retrouve pas - sans      │
 * │ quoi il conclut que sa saisie est perdue et la refait, ce qui ferait     │
 * │ entrer la marchandise deux fois.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function avertissementDeMouvementsEnFile(
  lot: LotEnAttente
): string | null {
  return avertissement(lot, "mouvement", "mouvements");
}
