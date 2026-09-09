/**
 * Réexport depuis `@vente-facile/core/report`.
 *
 * Ces bornes vivaient ici ; elles vivent désormais dans le paquet partagé,
 * parce que le DOCUMENT les porte : un rapport annonce son périmètre en tête,
 * et deux surfaces qui calculeraient la fenêtre séparément finiraient par en
 * annoncer deux. Relevé en comparant les deux fichiers exportés : le terminal
 * écrivait « Du 2026-08-04 au 2026-09-02 », le back-office « ( au ) ».
 *
 * Ce fichier n'existe plus que pour laisser inchangés les sites d'import de
 * `@/data/periodes-rapports`. Toute évolution se fait dans le paquet.
 */
export {
  PERIODES_RAPPORT,
  GROUPEMENTS,
  bornesRapport,
  libellePeriode,
} from "@vente-facile/core/report";
export type { PeriodeRapport, GroupBy } from "@vente-facile/core/report";
