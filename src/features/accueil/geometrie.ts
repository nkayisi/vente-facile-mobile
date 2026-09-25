/**
 * Où tombent les deux cartes d'une vue, et ce qui les fait tenir à l'écran.
 *
 * Module PUR : ni composant, ni thème, ni fenêtre. Une pile mal mesurée ne
 * lève rien - elle laisse des cartes qui débordent sous le titre, ou une
 * vignette perdue au milieu d'un grand vide - et c'est exactement le genre de
 * défaut qui ne se voit que sur un téléphone qu'on n'a pas sous la main.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA COMPOSITION EST DESSINÉE UNE FOIS, PUIS MISE À L'ÉCHELLE EN BLOC.     │
 * │                                                                          │
 * │ L'autre voie - déduire la largeur des cartes de celle de l'écran - a été │
 * │ écartée : le texte, lui, ne suit pas, donc les puces se replieraient     │
 * │ d'une ligne de plus sur un petit écran, la carte grandirait, et la pile  │
 * │ cesserait d'être la même figure. Ici l'angle, le recouvrement et le      │
 * │ rapport des deux cartes sont les mêmes de 320 à 430 points de large ;    │
 * │ seule leur taille apparente change. C'est ce que fait une illustration.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * La carte elle-même, avant rotation. Sa hauteur est FIXE : voir `pile-cartes.tsx`.
 *
 * ⚠ RAYONS CONCENTRIQUES : le rayon d'un enfant collé au bord intérieur vaut
 * `rayon - marge`, soit 12 ici. Deux rayons égaux sur des boîtes imbriquées est
 * la chose qui fait « sonner faux » une interface sans qu'on sache la nommer -
 * le dépôt l'a déjà écrit pour le cadre des anciennes scènes. Le rayon a été
 * relevé de 22 à 28 POUR cela : à 22, la pastille d'icône aurait dû tomber à 6,
 * c'est-à-dire paraître carrée.
 */
export const CARTE = { largeur: 208, hauteur: 320, rayon: 28, marge: 16 } as const;

/** Le rayon d'un enfant qui touche le bord intérieur de la carte. */
export const RAYON_INTERIEUR = CARTE.rayon - CARTE.marge;

export interface Pose {
  /**
   * Degrés, NÉGATIF = antihoraire, comme sur les maquettes : le haut de la
   * carte monte vers la droite.
   */
  angle: number;
  /** Décalage du centre de la carte par rapport au centre de la pile. */
  x: number;
  y: number;
}

/**
 * ⚠ L'ARRIÈRE EN PREMIER : c'est l'ordre de rendu, donc l'ordre d'empilement.
 *
 * Les deux angles DIFFÈRENT, et c'est ce qui fait lire « deux cartes » plutôt
 * qu'« une carte épaisse » : à angle égal les bords sont parallèles et la pile
 * paraît dessinée d'un trait.
 *
 * ⚠ L'ÉCART EST SURTOUT HORIZONTAL, ET C'EST LA HAUTEUR QUI LE COMMANDE. Un
 * décalage vertical plus généreux paraît d'abord plus aéré, puis se paie : la
 * pile est presque toujours bornée par la HAUTEUR qui lui reste sous le titre,
 * si bien que chaque point gagné en vertical se retire de la taille apparente
 * des deux cartes. Le rapport retenu tient l'encombrement à peu près carré,
 * c'est-à-dire au plus près de la place qu'une page lui laisse.
 */
export const POSES: readonly [Pose, Pose] = [
  { angle: -8, x: -80, y: 16 },
  { angle: -4, x: 80, y: -16 },
] as const;

const RAD = Math.PI / 180;

/** Demi-encombrement d'un rectangle tourné : c'est sa boîte englobante. */
function demiBoite(angle: number): { x: number; y: number } {
  const c = Math.abs(Math.cos(angle * RAD));
  const s = Math.abs(Math.sin(angle * RAD));
  return {
    x: (CARTE.largeur * c + CARTE.hauteur * s) / 2,
    y: (CARTE.largeur * s + CARTE.hauteur * c) / 2,
  };
}

/** Les bornes de la pile entière, dans le repère dont l'origine est son centre. */
function bornes(poses: readonly Pose[] = POSES) {
  let gauche = Infinity;
  let droite = -Infinity;
  let haut = Infinity;
  let bas = -Infinity;
  for (const p of poses) {
    const d = demiBoite(p.angle);
    gauche = Math.min(gauche, p.x - d.x);
    droite = Math.max(droite, p.x + d.x);
    haut = Math.min(haut, p.y - d.y);
    bas = Math.max(bas, p.y + d.y);
  }
  return { gauche, droite, haut, bas };
}

const B = bornes();

/**
 * La place que la pile occupe, rotations comprises.
 *
 * ⚠ ON ARRONDIT VERS LE HAUT. Un demi-point manquant sur la largeur suffirait
 * à rogner le bord d'une carte, et un bord de carte rogné se lit comme une
 * mise en page cassée là où un bord de carte qui touche le bord de l'écran se
 * lit comme un choix.
 */
export const ENCOMBREMENT = {
  largeur: Math.ceil(B.droite - B.gauche),
  hauteur: Math.ceil(B.bas - B.haut),
} as const;

/**
 * Le coin haut-gauche d'une carte dans la boîte d'encombrement.
 *
 * ⚠ ON NE S'EN REMET PAS À L'ALIGNEMENT DU PARENT. Yoga place bien un enfant
 * absolu sans inset selon le `justifyContent` de son parent, mais la pile
 * n'est PAS centrée sur son encombrement - les deux cartes se décalent en sens
 * inverse et leurs boîtes ne se compensent pas exactement. Poser les deux
 * coins explicitement rend le résultat identique quelle que soit la version de
 * Yoga, et c'est ce que `geometrie.test.ts` éprouve.
 */
export function placement(pose: Pose): { left: number; top: number } {
  return {
    left: pose.x - CARTE.largeur / 2 - B.gauche,
    top: pose.y - CARTE.hauteur / 2 - B.haut,
  };
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ⚠ LE PLAFOND ÉTAIT À 1, ET C'EST CE QUI RENDAIT LA PILE PETITE SUR UN   │
 * │ GRAND ÉCRAN.                                                             │
 * │                                                                          │
 * │ MESURÉ : sur un 448 x 997 (Pixel 9 Pro XL), la place disponible donnait  │
 * │ une échelle de 1,56 ; plafonnée à 1, la pile occupait 82 % de la largeur │
 * │ et laissait 39 points de marge de chaque côté, là où les maquettes la    │
 * │ montrent à 95 %. L'illustration ne grandissait plus avec l'écran.        │
 * │                                                                          │
 * │ ⚠ ET IL NE DISPARAÎT PAS POUR AUTANT. La mise à l'échelle est une        │
 * │ TRANSFORMATION DE COUCHE : sur iOS, le contenu est dessiné à sa taille   │
 * │ propre puis agrandi, donc le texte s'adoucit au-delà d'un certain        │
 * │ facteur. À 1,3 sur un écran à 3x, le texte reste rendu à 2,3x - très     │
 * │ au-dessus du seuil où cela se voit. Ne pas monter plus haut sans avoir   │
 * │ regardé une capture : c'est un défaut qu'aucun test ne peut attraper.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const PLAFOND = 1.3;

/**
 * ⚠ ET ON NE DESCEND PAS SOUS UN PLANCHER.
 *
 * Il faudrait une fenêtre d'environ 200 points de haut pour l'atteindre. En
 * deçà, mieux vaut laisser la pile mordre les bords - elle les mord déjà par
 * construction - que rendre une vignette dont plus une puce ne se lit.
 */
export const PLANCHER = 0.55;

/** L'échelle qui fait tenir l'encombrement dans la place reçue. */
export function echelleDeLaPile(
  dispo: { largeur: number; hauteur: number },
  besoin = ENCOMBREMENT,
): number {
  if (!(dispo.largeur > 0) || !(dispo.hauteur > 0)) return PLANCHER;
  const e = Math.min(dispo.largeur / besoin.largeur, dispo.hauteur / besoin.hauteur);
  if (!Number.isFinite(e)) return PLANCHER;
  return Math.min(PLAFOND, Math.max(PLANCHER, e));
}

/* ──────────────────────────────── ce que la page rend à l'illustration */

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SUR UN ÉCRAN COURT, C'EST LE TEXTE QUI CÈDE, PAS L'ILLUSTRATION.        │
 * │                                                                          │
 * │ La page porte une hauteur FIXE de garnitures : la barre du haut, le pied │
 * │ et les zones sûres font environ 140 points, et le bloc de texte 184 de   │
 * │ plus. Sur un écran de 854 points - la référence des maquettes - il reste │
 * │ 42 % de la hauteur à la pile, ce qui est la proportion dessinée. Sur le  │
 * │ terminal de comptoir (640 points), les mêmes garnitures n'en laissent    │
 * │ plus que 36 %, et l'échelle tombait À 0,64 : les cartes devenaient des   │
 * │ vignettes sur l'écran même du marchand.                                  │
 * │                                                                          │
 * │ Deux paliers, et pas un réglage continu : c'est le motif de              │
 * │ `statValueSize`, où la taille cède par crans mesurés. Un titre qui       │
 * │ rétrécirait d'un point par pouce d'écran ne se contrôle pas.             │
 * │                                                                          │
 * │ ⚠ LA RÉFÉRENCE DES MAQUETTES RESTE EN « AMPLE ». Le palier resserré ne   │
 * │ s'applique QUE là où le dessin d'origine ne tient pas de toute façon :   │
 * │ la fidélité n'est pas perdue, elle est préservée là où elle est définie. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const HAUTEUR_AMPLE = 720;

export interface StylePage {
  /** La variante du titre. */
  titre: "h1" | "h2";
  /** Celle du corps. */
  corps: "bodyLarge" | "body";
  /** Le rembourrage et l'interligne du bloc de texte. */
  espace: string;
}

export function styleDeLaPage(hauteurFenetre: number): StylePage {
  return hauteurFenetre >= HAUTEUR_AMPLE
    ? { titre: "h1", corps: "bodyLarge", espace: "gap-2.5 pt-5" }
    : { titre: "h2", corps: "body", espace: "gap-2 pt-3" };
}
