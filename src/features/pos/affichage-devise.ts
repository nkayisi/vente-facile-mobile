/**
 * Afficher un prix de catalogue dans une AUTRE devise, au taux en vigueur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ T10 DU RETOUR DE TEST : « convertir les produits selon le taux ».       │
 * │                                                                          │
 * │ Un marchand dont le catalogue est tenu en dollars doit pouvoir annoncer  │
 * │ un prix en francs à son client, sans calculer de tête. C'est tout ce que │
 * │ cette demande couvre.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ C'EST UN AFFICHAGE, PAS UNE DEVISE PAR PRODUIT, et la distinction est
 * structurelle. Vérifié : le catalogue n'a AUCUNE colonne de devise, et toute
 * l'arithmétique de marge repose sur la convention « le coût est déjà en devise
 * principale », précisément parce qu'il n'est jamais converti. Ajouter une
 * devise par produit serait un changement de schéma qui toucherait la marge,
 * les vingt et un agrégats de rapports, les exports et les documents imprimés -
 * c'est-à-dire des chiffres déjà sortis sur du papier remis à des clients.
 *
 * ⚠ RIEN N'EST ADDITIONNÉ ICI. La règle du dépôt - « aucun écran n'additionne
 * deux monnaies » - tient : on convertit UN prix pour le montrer, le panier
 * continue de totaliser en principale, et la facture reste libellée en
 * principale. Le ticket n'est pas touché.
 */
import type { MoneyHelpers } from "@vente-facile/core";

/** La clé du réglage, propre à l'APPAREIL : c'est un confort de comptoir. */
export const CLE_DEVISE_AFFICHAGE = "pos.devise_affichage";

export interface PrixAffiche {
  /** Le prix tel qu'il sera FACTURÉ, en devise principale. Toujours là. */
  facture: string;
  /**
   * La conversion, quand une autre devise est choisie. `null` sinon.
   *
   * ⚠ ELLE NE REMPLACE JAMAIS `facture`. Un prix converti affiché seul se lit
   * comme le prix de vente, et le ticket sortirait alors dans une autre
   * monnaie que celle annoncée au client.
   */
  converti: string | null;
  /** La parité employée : « 1 USD = 2 300 FC ». `null` sans conversion. */
  parite: string | null;
}

/**
 * Les devises qu'on peut proposer à l'affichage.
 *
 * La principale EN TÊTE : c'est la devise de facturation, donc le défaut, et
 * l'ordre dit lequel des deux chiffres est le prix.
 */
export function devisesAffichables(money: MoneyHelpers): string[] {
  const autres = money.currencies
    .map((c) => c.currency_code)
    .filter((c) => c && c !== money.primaryCode);
  return [money.primaryCode, ...[...new Set(autres)].sort()];
}

/**
 * Le prix à montrer, et sa conversion s'il y a lieu.
 *
 * ⚠ UNE DEVISE INCONNUE NE CONVERTIT RIEN. `rateOf` rend 1 pour une devise
 * qu'elle ne connaît pas : convertir quand même afficherait le même nombre
 * sous un autre symbole, c'est-à-dire un prix faux présenté comme exact.
 */
export function prixAffiche(
  prix: number,
  deviseAffichage: string | null,
  money: MoneyHelpers
): PrixAffiche {
  const facture = money.money(prix, money.primaryCode);
  // ⚠ Pas de `?? ""` : la chaîne vide est le motif que le garde-fou « aucun
  // montant sans devise » traque, et il a raison de le traquer même ici - un
  // jour, quelqu'un passerait cette variable à `money()`. `undefined` dit la
  // même chose sans porter le motif.
  const cible = deviseAffichage?.trim();

  if (!cible || cible === money.primaryCode) {
    return { facture, converti: null, parite: null };
  }
  if (!money.currencies.some((c) => c.currency_code === cible)) {
    return { facture, converti: null, parite: null };
  }

  return {
    facture,
    converti: money.money(money.convMoney(prix, money.primaryCode, cible), cible),
    // La parité est NOMMÉE : un marchand annonce un prix sur un taux, et il
    // doit savoir lequel - les taux changent, et le sien peut être périmé.
    parite: money.rateLabel(money.primaryCode, cible),
  };
}

/**
 * La devise d'affichage retenue, parmi celles qui existent.
 *
 * Un réglage rangé hier peut désigner une devise que le marchand a depuis
 * retirée : on retombe alors sur la principale plutôt que de ne rien convertir
 * en silence - ou, pire, de convertir à un taux de 1.
 */
export function deviseAffichageValide(
  choisie: string | null | undefined,
  money: MoneyHelpers
): string {
  const c = choisie?.trim();
  return c && devisesAffichables(money).includes(c) ? c : money.primaryCode;
}
