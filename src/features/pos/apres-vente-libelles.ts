/**
 * Ce que disent les deux panneaux d'après-vente : l'attente d'impression, puis
 * la vente terminée.
 *
 * ⚠ CE MODULE N'IMPORTE NI `@/ui`, NI `@/printing`. `@/ui` tire le thème, qui
 * tire les réglages, qui OUVRE SQLite au chargement : une phrase écrite là-bas
 * ne serait pas éprouvable sans appareil.
 */

/** L'état du ticket. `null` : rien n'a encore été tenté. */
export type StatutImpression = "encours" | "faite" | "echec";

/**
 * Le délai au-delà duquel l'attente propose de continuer sans elle.
 *
 * `imprimer()` n'a aucun délai global : une écriture Bluetooth figée ou une
 * feuille de partage restée ouverte tiendraient sinon le comptoir, client
 * devant le tiroir. Huit secondes couvrent largement un ticket qui sort.
 */
export const DELAI_AVANT_CONTINUER_MS = 8000;

export function titreDeLaVente(credit: boolean): string {
  return credit ? "Vente à crédit enregistrée" : "Vente enregistrée";
}

/**
 * Le bouton d'impression, selon ce qui s'est passé.
 *
 * Après un échec, « Imprimer » et non « Réimprimer » : rien n'est sorti, et le
 * compteur de `print_jobs` n'avance qu'à une impression réussie, donc le
 * prochain ticket sera l'ORIGINAL, pas un duplicata.
 */
export function libelleBoutonImpression(statut: StatutImpression | null): string {
  if (statut === "encours") return "Impression…";
  if (statut === "faite") return "Réimprimer (duplicata)";
  return "Imprimer le reçu";
}

/** Le transport qui a servi : son identifiant, et son libellé lisible. */
export interface TransportUtilise {
  id: string;
  libelle: string;
}

/**
 * La ligne d'état sous le résumé de la vente, ou `null` quand c'est un
 * bandeau qui parle (l'échec) ou qu'il n'y a rien à dire.
 *
 * Le transport est NOMMÉ : il dit au caissier OÙ chercher son papier. Et un
 * ticket parti en PDF n'est pas « imprimé » - il a été remis à la feuille de
 * partage du système, et rien n'est sorti de l'imprimante (relevé sur le
 * rk3568, réglé sur le repli PDF).
 */
export function phraseImpression(
  statut: StatutImpression | null,
  transport: TransportUtilise | null,
): string | null {
  if (statut === "encours") return "Impression du ticket en cours…";
  if (statut !== "faite") return null;
  if (!transport) return "Ticket imprimé.";
  if (transport.id === "pdf") return "Ticket envoyé en PDF.";
  return `Ticket imprimé (${transport.libelle}).`;
}
