/**
 * Ce que la carte d'un article dit de son stock : la règle vit dans
 * `@vente-facile/core/pos`. L'article du comptoir (`ArticlePos`) satisfait son
 * type `ArticleDeCarte` tel quel.
 */
export {
  etatDeLaCarte,
  libelleDuBandeau,
  lieuDeLArticle,
  type EtatDeStock,
} from "@vente-facile/core/pos";
