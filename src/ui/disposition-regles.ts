/**
 * Les règles de disposition, PURES.
 *
 * Tout ce qui décide qu'un écran passe sur deux colonnes, qu'une feuille devient
 * un dialogue ou que la navigation quitte le bas de l'écran vit ici, sans un
 * seul import de React Native : une règle de mise en page fausse ne lève rien,
 * elle affiche un écran de travers sur la tablette d'un marchand, et c'est
 * précisément ce qu'on ne voit pas sur l'émulateur du développeur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON DÉCIDE SUR LA LARGEUR DU VOLET, JAMAIS SUR CELLE DE LA FENÊTRE.      │
 * │                                                                          │
 * │ Les préfixes `md:` / `lg:` de NativeWind lisent la FENÊTRE. Or une barre │
 * │ latérale prend 256 points, un volet de liste 360 : un écran qui se croit │
 * │ « large » parce que la fenêtre fait 1 280 n'a peut-être que 660 points   │
 * │ pour lui. Le back-office a payé exactement ce piège (« les seuils `sm:`  │
 * │ se calent sur la fenêtre, pas sur la place réelle »). Les préfixes sont  │
 * │ donc proscrits (`ui/doctrine.test.ts`) et tout passe par ici.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Règle de cohérence, à ne jamais défaire : on RÉARRANGE, on ne réécrit pas.
 * Les mêmes composants, les mêmes libellés, les mêmes tailles de texte et les
 * mêmes cibles tactiles servent toutes les tailles ; un grand écran ajoute des
 * colonnes et des volets, il ne retire rien.
 */

/** Trois classes de fenêtre, calées sur le back-office. */
export type ClasseFenetre = "compact" | "moyen" | "large";

/** Où vit la navigation principale. */
export type Navigation = "barre" | "rail" | "laterale";

/**
 * La largeur maximale du contenu d'un écran.
 *
 * - `etroit` : une carte seule, centrée (connexion, déverrouillage) ;
 * - `lecture` : formulaires, fiches, listes, réglages - une ligne qui se lit
 *   d'un coup d'oeil, libellé et valeur reliés sans traverser l'écran ;
 * - `large` : tableaux de bord, rapports, concentrateurs - des grilles ;
 * - `plein` : le comptoir, qui veut chaque point.
 */
export type Gabarit = "etroit" | "lecture" | "large" | "plein";

/** Sous 600, un téléphone (le seuil « compact » de Material). */
export const SEUIL_MOYEN = 600;
/**
 * À partir de 1 024, la barre latérale du back-office devient fixe (`lg:`) :
 * même seuil ici, pour qu'un marchand qui passe de l'un à l'autre retrouve la
 * même coquille à la même largeur.
 */
export const SEUIL_LARGE = 1024;

/** Le rail : glyphe et libellé court, 80 points (le rail de Material). */
export const LARGEUR_RAIL = 80;
/** La barre latérale complète : 256 points, le `w-64` du back-office. */
export const LARGEUR_LATERALE = 256;

/**
 * Le panier vit À CÔTÉ de la grille quand le contenu atteint 840 : le panneau
 * en prend ~400, il en reste ~440 à la grille, soit deux colonnes de cartes.
 * En dessous, deux volets écrasés valent moins qu'un écran de panier.
 */
export const SEUIL_VOLET_PANIER = 840;
export const LARGEUR_PANNEAU_PANIER = 400;

/**
 * Liste et fiche côte à côte à partir de 900 de contenu : 360 de liste, et une
 * fiche d'au moins 540, assez pour ses montants et sa barre d'actions.
 */
export const SEUIL_LISTE_FICHE = 900;
export const LARGEUR_VOLET_LISTE = 360;

/** La liste et sa fiche tiennent-elles côte à côte dans cette page ? */
export function listeEtFicheCoteACote(largeurPage: number): boolean {
  return largeurPage >= SEUIL_LISTE_FICHE;
}

/** La largeur laissée à la fiche : la page, moins la liste et son filet. */
export function largeurDuVoletFiche(largeurPage: number): number {
  return Math.max(0, largeurPage - LARGEUR_VOLET_LISTE - 1);
}

const LARGEUR_MAX: Record<Gabarit, number | null> = {
  etroit: 480,
  lecture: 760,
  large: 1280,
  plein: null,
};

export function classeDeFenetre(largeur: number): ClasseFenetre {
  if (largeur >= SEUIL_LARGE) return "large";
  if (largeur >= SEUIL_MOYEN) return "moyen";
  return "compact";
}

/**
 * Une tablette se reconnaît à son PLUS PETIT côté : il ne change pas quand on
 * la fait pivoter, contrairement à la largeur. Un téléphone de 448 × 997 tenu
 * en paysage reste un téléphone.
 */
export function estTablette(largeur: number, hauteur: number): boolean {
  return Math.min(largeur, hauteur) >= SEUIL_MOYEN;
}

export function estPaysage(largeur: number, hauteur: number): boolean {
  return largeur > hauteur;
}

/**
 * Le comptoir : la grille et le panier veulent toute la place, et la barre
 * latérale s'y replie d'elle-même en rail (décision du 2026-11-21).
 *
 * ⚠ LE CHEMIN EST CELUI D'EXPO-ROUTER, SANS LE GROUPE : `usePathname()` rend
 * `/vendre`, jamais `/(app)/(tabs)/vendre`.
 */
export function estAuComptoir(chemin: string | null | undefined): boolean {
  if (!chemin) return false;
  return chemin === "/vendre" || chemin.startsWith("/vendre/");
}

/**
 * Où vit la navigation.
 *
 * - `compact` : barre d'onglets en bas, tiroir derrière le hamburger ;
 * - `moyen` : rail à gauche (une tablette portrait de 600 à 800 points ne
 *   peut pas céder 256 points sans tomber à une largeur de téléphone) ;
 * - `large` : barre latérale complète, sauf si le marchand l'a repliée ou
 *   s'il est au comptoir.
 */
export function navigationPour(
  classe: ClasseFenetre,
  replie: boolean,
  chemin: string | null | undefined
): Navigation {
  if (classe === "compact") return "barre";
  if (classe === "moyen") return "rail";
  return replie || estAuComptoir(chemin) ? "rail" : "laterale";
}

export function largeurDeNavigation(navigation: Navigation): number {
  if (navigation === "laterale") return LARGEUR_LATERALE;
  if (navigation === "rail") return LARGEUR_RAIL;
  return 0;
}

/**
 * Combien de colonnes tiennent dans une largeur.
 *
 * `largeurMin` est la plus petite cellule qui reste lisible : pour un montant,
 * celle qui écrit un total CDF à sept chiffres EN ENTIER (un montant ne
 * s'abrège jamais). On en tire le plus grand nombre de colonnes possible,
 * borné entre `min` et `max`.
 */
export function colonnesPour(
  largeurDispo: number,
  {
    min = 1,
    max = 6,
    largeurMin,
    ecart = 12,
  }: { min?: number; max?: number; largeurMin: number; ecart?: number }
): number {
  if (!Number.isFinite(largeurDispo) || largeurDispo <= 0) return min;
  const n = Math.floor((largeurDispo + ecart) / (largeurMin + ecart));
  return Math.min(max, Math.max(min, n));
}

/**
 * Le nombre de colonnes qui range `n` cellules le plus proprement, sans
 * dépasser `max`.
 *
 * ⚠ LE PLUS GRAND N'EST PAS LE MEILLEUR. Six relevés sur quatre colonnes font
 * une rangée pleine et une rangée à moitié vide ; sur trois, deux rangées
 * pleines. On cherche donc, dans l'ordre : le moins de RANGÉES, puis le moins
 * de cellules VIDES dans la dernière, puis le plus de colonnes. C'est ce que le
 * back-office obtient à la main avec ses paliers `2 / 3 / 6`, qui divisent
 * tous six.
 */
export function colonnesEquilibrees(n: number, max: number): number {
  if (n <= 0) return Math.max(1, max);
  const plafond = Math.max(1, Math.min(n, max));
  let meilleur = 1;
  let meilleursRangs = Number.POSITIVE_INFINITY;
  let meilleursVides = Number.POSITIVE_INFINITY;
  for (let c = 1; c <= plafond; c++) {
    const rangs = Math.ceil(n / c);
    const vides = rangs * c - n;
    const mieux =
      rangs < meilleursRangs ||
      (rangs === meilleursRangs && vides < meilleursVides) ||
      (rangs === meilleursRangs && vides === meilleursVides && c > meilleur);
    if (mieux) {
      meilleur = c;
      meilleursRangs = rangs;
      meilleursVides = vides;
    }
  }
  return meilleur;
}

export function largeurMaxDe(gabarit: Gabarit): number | null {
  return LARGEUR_MAX[gabarit];
}

/** La marge de page : `p-4 lg:p-6` du back-office. */
export function margePage(classe: ClasseFenetre): number {
  return classe === "compact" ? 16 : 24;
}

/**
 * Une modale monte du bas sur un téléphone, se pose au centre ailleurs.
 *
 * Une feuille pleine largeur sur 1 920 points se lit comme un bandeau, et son
 * bouton de validation part à l'autre bout de l'écran. Au centre, la même
 * feuille garde la largeur d'un formulaire.
 */
export function formeDeModale(classe: ClasseFenetre): "feuille" | "dialogue" {
  return classe === "compact" ? "feuille" : "dialogue";
}

/**
 * La rotation : verrouillée en portrait sur un téléphone, libre sur une
 * tablette (décision du 2026-11-21).
 */
export function verrouPour(largeur: number, hauteur: number): "portrait" | "libre" {
  return estTablette(largeur, hauteur) ? "libre" : "portrait";
}

/** L'anneau posé à côté de sa légende, à partir de ce volet. */
export const SEUIL_ANNEAU_A_COTE = 520;
/** Le diamètre où le centre de l'anneau tient « Total encaissé » et un total à sept chiffres. */
export const DIAMETRE_ANNEAU_LISIBLE = 208;

/**
 * Le diamètre d'un anneau de répartition, sur la largeur de son volet.
 *
 * Côte à côte avec sa légende, il prend le diamètre lisible. EMPILÉ, il suit
 * la largeur, jusqu'à ce même diamètre : figé à 168 points, son centre ne
 * laissait qu'une cinquantaine de points au total (« 92 865,09.. »), sur un
 * téléphone comme dans une carte d'accueil de tablette. Il ne descend jamais
 * sous le diamètre demandé.
 */
export function diametreDeLAnneau(largeurVolet: number, demande: number): number {
  if (largeurVolet >= SEUIL_ANNEAU_A_COTE) return Math.max(demande, DIAMETRE_ANNEAU_LISIBLE);
  const selonLaPlace = Math.floor(largeurVolet * 0.6);
  return Math.max(demande, Math.min(DIAMETRE_ANNEAU_LISIBLE, selonLaPlace));
}

