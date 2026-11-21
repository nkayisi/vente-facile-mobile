/**
 * La disposition du comptoir, PURE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SUR UN GRAND ÉCRAN, LE PANIER RESTE À CÔTÉ DE LA GRILLE.                │
 * │                                                                          │
 * │ Un téléphone ne tient pas les deux : on compose sur la grille, puis on   │
 * │ relit le panier sur son propre écran. Une tablette les tient, et c'est   │
 * │ ce que fait le point de vente du back-office : la grille à gauche, le    │
 * │ panier toujours visible à droite, l'encaissement sous le total. Le       │
 * │ caissier voit chaque article entrer au panier au moment où il le touche. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Tout se décide sur la largeur de la PAGE (la fenêtre moins la navigation),
 * jamais sur celle de la fenêtre : au comptoir la barre latérale se replie en
 * rail, et c'est ce qui reste qui compte.
 */
import {
  LARGEUR_PANNEAU_PANIER,
  SEUIL_VOLET_PANIER,
  colonnesPour,
} from "@/ui/disposition-regles";

/**
 * La plus petite carte d'article qui reste lisible : un nom sur deux lignes à
 * côté de sa vignette, et un prix CDF à sept chiffres écrit en entier.
 */
export const LARGEUR_MIN_CARTE = 180;

/** L'écart entre deux cartes, le `gap-3` de la grille. */
const ECART = 12;

/** La marge intérieure de la grille, de chaque côté (`px-4`). */
const MARGE = 16;

export function panneauDuComptoir(largeurPage: number): boolean {
  return largeurPage >= SEUIL_VOLET_PANIER;
}

/** La largeur de la grille d'articles, panneau et marges retirés. */
export function largeurDeLaGrille(largeurPage: number): number {
  const panneau = panneauDuComptoir(largeurPage) ? LARGEUR_PANNEAU_PANIER : 0;
  return Math.max(0, largeurPage - panneau - 2 * MARGE);
}

/**
 * Le nombre de colonnes de la grille. Deux au moins, comme sur un téléphone ;
 * six au plus, au-delà une carte de comptoir se perd dans l'écran.
 */
export function colonnesDeLaGrille(largeurPage: number): number {
  return colonnesPour(largeurDeLaGrille(largeurPage), {
    largeurMin: LARGEUR_MIN_CARTE,
    min: 2,
    max: 6,
    ecart: ECART,
  });
}

/**
 * Complète la dernière rangée de cellules VIDES.
 *
 * ⚠ SANS ELLES, LA DERNIÈRE CARTE S'ÉTIRE. Chaque carte prend `flex-1` dans sa
 * rangée : seule sur la dernière, elle en prenait toute la largeur. Sur deux
 * colonnes ça se remarquait à peine ; sur six, un article isolé devenait un
 * bandeau de mille points, sans rapport avec ses voisins.
 */
export function completerRangee<T>(elements: readonly T[], colonnes: number): (T | null)[] {
  const reste = elements.length % colonnes;
  if (reste === 0) return [...elements];
  return [...elements, ...Array<null>(colonnes - reste).fill(null)];
}

/**
 * Où mène « voir le panier », par exemple après la reprise d'un panier rangé :
 * l'écran du panier sur un téléphone, le comptoir sur une tablette, dont le
 * panneau montre déjà le panier.
 */
export function destinationDuPanier(largeurPage: number): "/vendre" | "/pos/panier" {
  return panneauDuComptoir(largeurPage) ? "/vendre" : "/pos/panier";
}

/**
 * Le viseur du scanner suit la page : 288 × 128 sur un téléphone, comme avant,
 * et jamais plus de 480 de large. Figé à 288, il se perdait au milieu d'une
 * caméra de 1 800 points ; étiré à toute la largeur, il ne dirait plus où
 * viser.
 */
export function cadreDuViseur(largeurPage: number): { largeur: number; hauteur: number } {
  const largeur = Math.round(Math.min(480, Math.max(288, largeurPage * 0.4)));
  return { largeur, hauteur: Math.round((largeur * 128) / 288) };
}
