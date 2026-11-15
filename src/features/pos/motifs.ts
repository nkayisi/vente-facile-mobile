/**
 * Ce que le comptoir DIT quand il refuse.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES PHRASES VIVENT DANS LE NOYAU, ET CE MODULE NE FAIT QUE LES RENDRE.  │
 * │                                                                          │
 * │ Le terminal avait sa copie : « …pour vendre cet article » d'un côté,     │
 * │ « …pour l'encaisser » au comptoir web. Deux comptoirs du même            │
 * │ établissement disaient deux choses du même verrou, et un caissier qui    │
 * │ passe de l'un à l'autre se demandait si c'était le même problème.        │
 * │                                                                          │
 * │ Le stock inconnu ne propose plus de synchroniser : la synchronisation    │
 * │ part d'elle-même au retour du réseau et l'indicateur dit son état, et ce │
 * │ qui lève vraiment ce refus est une ENTRÉE DE STOCK dans l'entrepôt de la │
 * │ caisse - c'est ce que la phrase du noyau nomme.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module sans dépendance de plateforme : ces phrases sont opposées par
 * `etat-panier.ts`, dont la raison d'être est de s'éprouver sans appareil.
 */
export { motifDuVerrou, motifStockInconnu } from "@vente-facile/core/pos";
