import { FicheArticle } from "@/features/inventaire/fiche-article";

/**
 * La fiche d'un article, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, le catalogue l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function FicheArticleEcran() {
  return <FicheArticle />;
}
