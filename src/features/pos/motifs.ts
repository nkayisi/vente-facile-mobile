/**
 * Ce que le comptoir DIT quand il refuse.
 *
 * Module PUR, sans un seul import : ces phrases sont opposées par
 * `etat-panier.ts`, dont la raison d'être est de s'éprouver sans appareil. Les
 * laisser dans `verrou-inventaire.ts` y faisait entrer la base de données, et
 * la suite entière échouait au chargement.
 *
 * Elles sont la seule chose qu'un caissier reçoit quand la vente ne peut pas se
 * faire. Fausses, elles l'envoient chercher au dépôt une marchandise interdite
 * à la vente, ou synchroniser un appareil déjà à jour.
 */

/** La phrase du serveur, ramenée à un seul article. */
export function motifDuVerrou(nomArticle: string, reference: string): string {
  const session = reference ? ` (${reference})` : "";
  return (
    `${nomArticle} est bloqué par un inventaire en cours${session}. ` +
    `Attendez la fin de l'inventaire pour vendre cet article.`
  );
}

/**
 * Un stock INCONNU n'est pas un stock nul, et le message doit le dire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA CARTE DISAIT « STOCK INCONNU », LE REFUS DISAIT « 0 EN STOCK ».      │
 * │                                                                          │
 * │ Le REFUS est juste : sans ligne de stock pour cet entrepôt, le serveur   │
 * │ refuse aussi (`available = stock.available_quantity if stock else 0`).   │
 * │ C'est la PHRASE qui ment. `verifierAjout` lit `null` comme zéro pour     │
 * │ composer son message, et le caissier lit donc deux affirmations          │
 * │ contradictoires sur le même écran, sans savoir laquelle croire ni quoi   │
 * │ faire : article épuisé, ou appareil en retard ?                          │
 * │                                                                          │
 * │ La règle du dépôt est explicite (§5.3, règle 9) : « `null` ne se lit     │
 * │ jamais comme zéro ». Elle vaut pour les refus autant que pour les        │
 * │ étiquettes. Corrigé ICI plutôt que dans `@vente-facile/core` : la        │
 * │ distinction « aucune ligne pour CET entrepôt » est propre au terminal,   │
 * │ qui joint le stock d'un dépôt précis ; le back-office lit un agrégat.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Relevé sur l'émulateur : « Stock insuffisant pour ALDACTONE 100MG CES : 0 en
 * stock. » sous une carte annonçant « Stock inconnu ».
 */
export function motifStockInconnu(nomArticle: string): string {
  return (
    `Aucun stock enregistré pour ${nomArticle} dans cet entrepôt. ` +
    `Synchronisez, ou enregistrez une entrée de stock.`
  );
}
