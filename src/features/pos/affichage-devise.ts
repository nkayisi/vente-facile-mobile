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

export interface PrixAvecEquivalent {
  /** Le prix tel qu'il sera FACTURÉ, en devise principale. Toujours là. */
  facture: string;
  /**
   * Le même prix dans l'AUTRE devise de l'établissement, au taux en vigueur.
   * `null` sur un établissement mono-devise.
   *
   * ⚠ IL NE REMPLACE JAMAIS `facture`, il le suit entre parenthèses. Un prix
   * converti affiché seul se lit comme le prix de vente, et le ticket
   * sortirait alors dans une autre monnaie que celle annoncée au client.
   */
  equivalent: string | null;
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
 * La devise dans laquelle la carte donne l'équivalent d'un prix.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉQUIVALENT EST TOUJOURS LÀ, ET IL N'Y A PLUS RIEN À CHOISIR.           │
 * │                                                                          │
 * │ La rangée « Afficher en » du comptoir faisait choisir une devise         │
 * │ d'affichage, rangée par appareil : le caissier devait savoir qu'elle     │
 * │ existait, et un terminal réglé hier sur la principale n'annonçait plus  │
 * │ rien en francs. L'équivalent suit désormais le prix sur chaque carte.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La première autre devise ACTIVE, dans l'ordre de `devisesAffichables`. Une
 * devise désactivée n'est pas proposée : le marchand l'a retirée de sa caisse,
 * et l'annoncer au client serait lui promettre un règlement qu'on refusera.
 */
export function deviseEquivalente(money: MoneyHelpers): string | null {
  const actives = new Set(
    money.currencies
      .filter((c) => c.is_active !== false)
      .map((c) => c.currency_code),
  );
  return devisesAffichables(money).find((c) => c !== money.primaryCode && actives.has(c)) ?? null;
}

/**
 * Le prix facturé et son équivalent dans l'autre devise.
 *
 * ⚠ UNE DEVISE INCONNUE NE CONVERTIT RIEN. `rateOf` rend 1 pour une devise
 * qu'elle ne connaît pas : convertir quand même afficherait le même nombre
 * sous un autre symbole, c'est-à-dire un prix faux présenté comme exact.
 */
export function prixAvecEquivalent(prix: number, money: MoneyHelpers): PrixAvecEquivalent {
  const facture = money.money(prix, money.primaryCode);
  const cible = deviseEquivalente(money);
  if (!cible) return { facture, equivalent: null };
  return {
    facture,
    equivalent: money.money(money.convMoney(prix, money.primaryCode, cible), cible),
  };
}
