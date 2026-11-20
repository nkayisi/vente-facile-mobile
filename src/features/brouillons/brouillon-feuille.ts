/**
 * Le brouillon d'une feuille, gardé le temps d'aller créer un article.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CRÉER UN ARTICLE DEPUIS UNE FEUILLE NE DOIT PAS EFFACER LA FEUILLE.      │
 * │                                                                          │
 * │ Une feuille est un `Modal` : pour pousser l'écran de création, il faut   │
 * │ la fermer, et sa saisie vit dans son propre état. Sans ce brouillon, le  │
 * │ magasinier qui crée l'article qui lui manquait retrouverait une demande  │
 * │ vide - les quarante lignes qu'il venait de corriger, perdues.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * En MÉMOIRE seulement : le brouillon couvre un aller-retour vers la création,
 * pas un redémarrage. Il se REPREND une fois (`reprendre` l'efface), pour
 * qu'une saisie périmée ne resurgisse pas à la prochaine ouverture ; une
 * ouverture manuelle l'oublie et repart vierge.
 *
 * Module PUR, éprouvé sans appareil.
 */

const brouillons = new Map<string, unknown>();

export function garderBrouillon<T>(cle: string, etat: T): void {
  brouillons.set(cle, etat);
}

/** Le brouillon, une seule fois : il est effacé en même temps qu'il est rendu. */
export function reprendreBrouillon<T>(cle: string): T | null {
  if (!brouillons.has(cle)) return null;
  const etat = brouillons.get(cle) as T;
  brouillons.delete(cle);
  return etat;
}

export function oublierBrouillon(cle: string): void {
  brouillons.delete(cle);
}
