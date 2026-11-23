/**
 * La saisie de quantité ouverte en ce moment, pour qu'un re-scan l'atteigne.
 *
 * Le web : « re-scanner l'article pendant que sa quantité est ouverte » ajoute
 * 1 (scanner deux fois donne 2), un autre article est refusé avec un avis.
 * La saisie de quantité s'ouvre depuis la grille, le scan et l'éditeur de
 * ligne du panier ; plutôt que de faire passer une référence à travers ces
 * trois chemins, elle s'inscrit ici tant qu'elle est ouverte.
 */
import { estLeMemeArticle } from "@vente-facile/core/pos";

export interface SelecteurOuvert {
  article: { barcode?: string | null; sku?: string | null };
  ajouterUn: () => void;
  signalerAutre: () => void;
}

let courant: SelecteurOuvert | null = null;

/** Inscrit la saisie ouverte ; rend la fonction qui la retire. */
export function inscrireSelecteur(s: SelecteurOuvert): () => void {
  courant = s;
  return () => {
    if (courant === s) courant = null;
  };
}

export function selecteurOuvert(): SelecteurOuvert | null {
  return courant;
}

/** Ce qu'un scan fait à la saisie ouverte : `null` quand aucune ne l'est. */
export function rescanDansLaSaisie(candidats: string[]): "plus_un" | "autre" | null {
  const s = courant;
  if (!s) return null;
  if (estLeMemeArticle(candidats, s.article)) {
    s.ajouterUn();
    return "plus_un";
  }
  s.signalerAutre();
  return "autre";
}

/** L'avis du web, mot pour mot. */
export const AVIS_AUTRE_ARTICLE = "Un autre article a été scanné : terminez d'abord cette saisie.";
