/**
 * Découpage temporel et géométrie des graphiques du tableau de bord.
 *
 * Module PUR : ni base de données, ni React. C'est ce qui rend ces règles
 * testables, et elles doivent l'être - un axe mal découpé ne lève rien, il
 * dessine simplement une courbe fausse.
 *
 * Les BORNES des quatre périodes y vivent aussi : elles décident de ce que le
 * découpage doit couvrir, et les séparer ferait porter la même règle à deux
 * fichiers dont un seul serait testé.
 *
 * Le regroupement suit celui du SERVEUR (`organizations/views.py::dashboard`) :
 * par MOIS sur l'année - elle en couvre douze, d'où son départ au 1er d'un
 * mois - et par JOUR partout ailleurs, la journée restant un seul seau.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE DIFFÉRENCE ASSUMÉE AVEC LE BACK-OFFICE : LES SEAUX VIDES RESTENT.   │
 * │                                                                          │
 * │ Le serveur agrège en `values().annotate()`, qui ne rend QUE les jours    │
 * │ portant une ligne. Une semaine vendue le lundi et le vendredi dessine    │
 * │ donc deux points, et le trait tiré entre eux passe au-dessus de trois    │
 * │ journées vides comme si elles avaient vendu. C'est la règle déjà posée   │
 * │ sur le `BarChart` : une valeur nulle garde un filet visible, parce       │
 * │ qu'une barre absente se lit comme une donnée manquante, pas comme un     │
 * │ zéro. Le total de la période, lui, est identique des deux côtés.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les étiquettes viennent de `@vente-facile/core` et non de `toLocaleDateString`
 * : **Hermes n'embarque pas l'ICU complète**, et une locale non reconnue s'y
 * replie sur l'anglais SANS lever. « lun. » sortirait « Mon » sur le terminal
 * d'un marchand, et jamais sur la machine du développeur.
 */
import { monthShort, weekdayLong } from "@vente-facile/core";

export type Periode = "day" | "week" | "month" | "year";

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
const LONGUEUR_EN_JOURS: Record<Exclude<Periode, "year">, number> = {
  day: 1,
  week: 7,
  month: 30,
};

export function bornes(
  p: Periode,
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

export interface Seau {
  /** Clé de regroupement, stable et comparable. */
  cle: string;
  /** Étiquette telle qu'elle s'écrit sous l'axe. */
  label: string;
}

const deuxChiffres = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Clé du seau qui contient cette date. Le `year` groupe par mois, sinon par jour. */
export function cleDeSeau(d: Date, p: Periode): string {
  if (p === "year") return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}`;
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
}

/**
 * Étiquette d'un seau.
 *
 * Sur la SEMAINE, le jour de la semaine se lit mieux qu'un quantième : un
 * marchand reconnaît « son samedi » sans compter les dates. Ailleurs le
 * quantième est nécessaire, deux mardis d'un même mois se confondraient.
 */
export function labelDeSeau(d: Date, p: Periode): string {
  if (p === "year") return monthShort(d.getMonth());
  if (p === "week") return weekdayLong(d.getDay()).slice(0, 3);
  if (p === "day") return `${deuxChiffres(d.getDate())} ${monthShort(d.getMonth())}`;
  return deuxChiffres(d.getDate());
}

/**
 * Les seaux d'une période, du plus ancien au plus récent, vides compris.
 *
 * `fin` est EXCLUSIVE, comme les bornes du serveur : « jusqu'à aujourd'hui
 * inclus » y vaut « avant demain ». Un seau n'est engendré que s'il commence
 * avant cette borne, sinon un tableau de bord ouvert le 3 du mois dessinerait
 * vingt-huit journées à venir, toutes à zéro, et la vente du jour se lirait
 * comme un effondrement.
 */
export function seauxDePeriode(p: Periode, debut: Date, fin: Date): Seau[] {
  const sortie: Seau[] = [];
  const curseur =
    p === "year"
      ? new Date(debut.getFullYear(), debut.getMonth(), 1)
      : new Date(debut.getFullYear(), debut.getMonth(), debut.getDate());

  // Borne de sécurité : une donnée aberrante ne doit pas figer l'écran dans
  // une boucle. Trois cent soixante-six seaux couvrent la plus longue période
  // que le sélecteur propose.
  for (let garde = 0; curseur < fin && garde < 366; garde += 1) {
    sortie.push({ cle: cleDeSeau(curseur, p), label: labelDeSeau(curseur, p) });
    if (p === "year") curseur.setMonth(curseur.getMonth() + 1);
    else curseur.setDate(curseur.getDate() + 1);
  }
  return sortie;
}

/**
 * Les seaux qui portent une étiquette lisible.
 *
 * Trente et un quantièmes sur trois cent quarante points donnent onze points
 * par étiquette : elles se chevauchent, et un axe illisible vaut un axe
 * absent. On en garde au plus `max`, RÉGULIÈREMENT espacées, le premier et le
 * dernier toujours - ce sont les deux bornes que l'œil cherche en premier.
 * Le défaut est SEPT, pour que la semaine garde ses sept jours nommés.
 */
export function indicesEtiquettes(n: number, max = 7): Set<number> {
  if (n <= 0) return new Set();
  if (n <= max) return new Set(Array.from({ length: n }, (_, i) => i));
  const gardes = new Set<number>([0, n - 1]);
  const pas = (n - 1) / (max - 1);
  for (let i = 1; i < max - 1; i += 1) gardes.add(Math.round(i * pas));
  return gardes;
}

export interface Arc {
  /** Degrés, 0 à midi, sens des aiguilles d'une montre. */
  debut: number;
  fin: number;
}

/**
 * Les arcs d'un anneau, écart compris.
 *
 * L'écart est PRIS SUR LE TOTAL avant répartition, et non retranché à chaque
 * arc : retrancher ferait dépendre la somme des arcs du nombre de tranches, et
 * l'anneau ne fermerait plus. Une tranche unique n'a pas de voisin, donc pas
 * d'écart : un anneau ouvert de deux degrés se lit comme une donnée manquante.
 */
export function arcsDonut(valeurs: number[], ecart = 2): Arc[] {
  const positives = valeurs.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = positives.reduce((s, v) => s + v, 0);
  if (total <= 0) return [];

  const separations = positives.length > 1 ? positives.length * ecart : 0;
  const utile = 360 - separations;
  const arcs: Arc[] = [];
  let angle = 0;
  for (const v of positives) {
    const balayage = (v / total) * utile;
    arcs.push({ debut: angle, fin: angle + balayage });
    angle += balayage + (positives.length > 1 ? ecart : 0);
  }
  return arcs;
}

/**
 * Chemin SVG d'un secteur d'anneau.
 *
 * Écrit à la main plutôt que tiré d'une bibliothèque : deux arcs et deux
 * segments ne justifient pas une dépendance, et aucune de celles qui existent
 * ne suit les jetons de thème sans configuration. C'est l'arbitrage déjà rendu
 * pour le `BarChart`, et celui rendu contre `react-native-nyx-printer`.
 */
export function cheminSecteur(
  cx: number,
  cy: number,
  rExterne: number,
  rInterne: number,
  debut: number,
  fin: number
): string {
  const p = (rayon: number, deg: number) => {
    // -90 pour partir de midi : un anneau qui commencerait à 3 heures se lit
    // de travers, la première tranche étant celle qu'on cherche.
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(cx + rayon * Math.cos(rad)).toFixed(3)} ${(cy + rayon * Math.sin(rad)).toFixed(3)}`;
  };
  // Au-delà d'un demi-tour, SVG exige le drapeau « grand arc », sans quoi il
  // trace le complément : une tranche de 70 % en dessinerait 30.
  const grand = fin - debut > 180 ? 1 : 0;

  return [
    `M ${p(rExterne, debut)}`,
    `A ${rExterne} ${rExterne} 0 ${grand} 1 ${p(rExterne, fin)}`,
    `L ${p(rInterne, fin)}`,
    `A ${rInterne} ${rInterne} 0 ${grand} 0 ${p(rInterne, debut)}`,
    "Z",
  ].join(" ");
}
