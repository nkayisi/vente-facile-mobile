/**
 * Les périodes, pour TOUTE l'application.
 *
 * Module PUR, sans base de données : c'est ce qui le rend testable, et ces
 * définitions doivent l'être. Ce sont celles du SERVEUR
 * (`apps/organizations/views.py::_periode_glissante`), pas celles qu'on
 * trouverait logiques, et une divergence ferait afficher au terminal des
 * chiffres différents du back-office sur le même établissement, sans que rien
 * ne le signale.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL Y AVAIT DEUX MODULES DE PÉRIODES, ET LA COPIE A DÉRIVÉ.              │
 * │                                                                          │
 * │ La règle glissante vivait dans `features/tableau-de-bord/series.ts` ;    │
 * │ l'historique en gardait ici une seconde version, où `semaine` était      │
 * │ glissante et `mois` CALENDAIRE. Quand le tableau de bord est passé en    │
 * │ glissant, cette copie n'a pas suivi - et rien ne pouvait le signaler.    │
 * │                                                                          │
 * │ Relevé à l'écran le 1er septembre 2026, sur des données réelles :        │
 * │ « 7 jours » rendait huit ventes et « Mois » AUCUNE, sous un message      │
 * │ « Essayez une période plus large » - alors que la période la plus large  │
 * │ des deux était celle qui affichait quelque chose. Le marchand y lit une  │
 * │ perte de données, et le défaut revenait les six premiers jours de        │
 * │ CHAQUE mois.                                                             │
 * │                                                                          │
 * │ La règle vit donc ICI, dans le module qui porte les périodes, et les     │
 * │ deux surfaces la lisent. `series.ts` la réexporte pour ses appelants.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les bornes sont en heure LOCALE, comme `day_bounds()` : une vente saisie à
 * 23h30 est déjà le lendemain en UTC et disparaîtrait du rapport du jour.
 */

/** La fenêtre glissante du tableau de bord. Nommée comme les paramètres du serveur. */
export type Fenetre = "day" | "week" | "month" | "year";

/**
 * Bornes des deux périodes, RECOPIÉES du serveur
 * (`apps/organizations/views.py::_periode_glissante`).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES QUATRE PÉRIODES SONT GLISSANTES, ET C'EST LA SEULE FAÇON DE LES      │
 * │ EMBOÎTER.                                                                │
 * │                                                                          │
 * │ Elles ne parlaient pas la même langue : `week` était glissante           │
 * │ (`today - 6`), `month` et `year` calendaires (le 1er du mois, le 1er     │
 * │ janvier). Le 1er septembre, « Mois » couvrait donc UNE SEULE JOURNÉE     │
 * │ pendant que « Semaine » remontait au 26 août : une vente du 28 août      │
 * │ figurait dans « Semaine » et dans « Année », et disparaissait de         │
 * │ « Mois ». Le marchand y lisait une perte de données, et le défaut        │
 * │ revenait les six premiers jours de CHAQUE mois.                          │
 * │                                                                          │
 * │ Tout passer en calendaire n'aurait rien réglé : le 1er septembre, la     │
 * │ semaine calendaire commence le 31 août et déborde encore du mois. Seul   │
 * │ le glissant garantit `jour ⊆ semaine ⊆ mois ⊆ année`, quel que soit le   │
 * │ quantième - et c'est ce qu'un marchand attend, la semaine faisant partie │
 * │ du mois.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'ANNÉE part du 1er d'un mois et non de `aujourdhui - 364` : le graphique
 * groupe par mois, et une fenêtre à cheval rendrait treize seaux dont deux
 * partiels, avec deux étiquettes « sept. » sur le même axe.
 *
 * La borne haute est TOUJOURS aujourd'hui inclus, jamais le futur ; `fin` est
 * donc exclusive et vaut demain. La période précédente s'arrête la veille du
 * début de la courante et a la même longueur, sans quoi la variation
 * comparerait deux fenêtres inégales et inventerait une hausse.
 *
 * `aujourdhui` n'est là que pour les tests : le décalage se prouve sur des
 * quantièmes choisis, dont le 1er d'un mois.
 */
const LONGUEUR_EN_JOURS: Record<Exclude<Fenetre, "year">, number> = {
  day: 1,
  week: 7,
  month: 30,
};

export function bornes(
  p: Fenetre,
  aujourdhui: Date = new Date()
): {
  debut: Date;
  fin: Date;
  debutPrecedent: Date;
  finPrecedent: Date;
} {
  const jour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const plus = (d: Date, j: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + j);
    return r;
  };
  /** Le 1er du mois situé `mois` mois avant celui de `d`. */
  const premierDuMoisRecule = (d: Date, mois: number) =>
    new Date(d.getFullYear(), d.getMonth() - mois, 1);

  const debutDuJour = jour(aujourdhui);
  // Borne haute exclusive : « jusqu'à aujourd'hui inclus » vaut « avant demain ».
  const fin = plus(debutDuJour, 1);

  if (p === "year") {
    const debut = premierDuMoisRecule(debutDuJour, 11);
    return {
      debut,
      fin,
      debutPrecedent: premierDuMoisRecule(debutDuJour, 23),
      finPrecedent: debut,
    };
  }

  const jours = LONGUEUR_EN_JOURS[p] ?? LONGUEUR_EN_JOURS.month;
  const debut = plus(debutDuJour, -(jours - 1));
  return {
    debut,
    fin,
    // `finPrecedent` est EXCLUSIVE ici, là où le serveur nomme un dernier jour
    // inclus : elle vaut donc le début de la période courante.
    debutPrecedent: plus(debut, -jours),
    finPrecedent: debut,
  };
}

/**
 * Périodes de l'historique des ventes.
 *
 * `tout` n'a pas d'équivalent au tableau de bord : un historique se consulte
 * sans borne, un tableau de bord compare toujours deux fenêtres.
 */
export type Periode = "jour" | "semaine" | "mois" | "tout";

/** Correspondance avec la fenêtre glissante. `tout` n'en a aucune. */
const FENETRE: Record<Exclude<Periode, "tout">, Fenetre> = {
  jour: "day",
  semaine: "week",
  mois: "month",
};

/**
 * Le début d'une période de l'historique, ou `null` pour « tout ».
 *
 * Elle DÉLÈGUE à `bornes` plutôt que de recalculer : c'est ce qui rend une
 * divergence impossible par construction, et non plus seulement improbable.
 * La borne haute n'est pas rendue - l'historique ne montre jamais le futur, et
 * une vente ne peut pas être datée d'après-demain (l'horloge de l'acte refuse
 * une avance de plus de cinq minutes).
 */
export function depuisQuand(periode: Periode, maintenant = new Date()): Date | null {
  if (periode === "tout") return null;
  return bornes(FENETRE[periode], maintenant).debut;
}
