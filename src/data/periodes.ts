/**
 * Bornes des périodes de filtrage.
 *
 * Module PUR, sans base de données : c'est ce qui le rend testable, et ces
 * définitions doivent l'être. Ce sont celles du SERVEUR
 * (`apps/organizations/views.py::dashboard`), pas celles qu'on trouverait
 * logiques, et une divergence ferait afficher au terminal des chiffres
 * différents du back-office sur le même établissement, sans que rien ne le
 * signale. Le lot 5bis s'est déjà fait prendre exactement là.
 *
 * Les bornes sont en heure LOCALE, comme `day_bounds()` : une vente saisie à
 * 23h30 est déjà le lendemain en UTC et disparaîtrait du rapport du jour.
 */

/** Périodes de l'historique, reprises du `PeriodFilter` du back-office. */
export type Periode = "jour" | "semaine" | "mois" | "tout";

export function depuisQuand(periode: Periode, maintenant = new Date()): Date | null {
  const d = maintenant;
  switch (periode) {
    case "jour":
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    case "semaine": {
      // SEPT DERNIERS JOURS, pas la semaine calendaire.
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      s.setDate(s.getDate() - 6);
      return s;
    }
    case "mois":
      // Du 1er à aujourd'hui, là encore comme le serveur.
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case "tout":
      return null;
  }
}
