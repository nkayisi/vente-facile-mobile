/**
 * Pourquoi la grille du comptoir est vide, et ce qu'on en dit au caissier.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « CATALOGUE VIDE · SYNCHRONISEZ » ÉTAIT FAUX UNE FOIS SUR DEUX.         │
 * │                                                                          │
 * │ `vendable()` exige `is_active` ET `is_sellable`. Un catalogue descendu   │
 * │ sans ces deux drapeaux - un import, une fiche créée au back-office et    │
 * │ laissée hors vente - rend ZÉRO article, sous un message qui envoie le    │
 * │ caissier synchroniser. Il synchronise, tout réussit, la grille reste     │
 * │ vide. Il recommence. Rien dans l'application ne lui dit que les articles │
 * │ sont là et que c'est leur réglage qui les retient.                       │
 * │                                                                          │
 * │ On ne peut donc pas composer le message depuis le seul résultat filtré : │
 * │ il faut savoir ce que la table CONTIENT, pas seulement ce qu'elle rend.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ DEUX DES QUATRE PISTES DU RETOUR DE TEST NE VIDENT PAS LA GRILLE, et ce
 * module ne leur invente donc aucun message :
 *
 *   - un INVENTAIRE en cours ne retire rien : les articles verrouillés sont
 *     rendus, grisés, portant la référence de la session, et un bandeau les
 *     annonce au-dessus de la grille. Une grille pleine d'articles inertes
 *     n'est pas une grille vide ;
 *   - une CAISSE SANS ENTREPÔT ne retire rien non plus : les jointures de
 *     stock sont externes, et le stock sort « inconnu » plutôt qu'absent.
 *
 * Leur inventer une cause ici ferait afficher une explication qui ne
 * correspond à rien, ce qui est pire que le message trop général d'origine.
 */
import type { IconName } from "@/ui";

/** Ce que la table CONTIENT, et ce que l'écran DEMANDE. */
export interface DiagnosticCatalogue {
  /** Lignes de `products` non supprimées, tous drapeaux confondus. */
  recus: number;
  /** Celles qui passent le filtre de vendabilité du comptoir. */
  vendables: number;
  /** Un terme de recherche est saisi. */
  recherche: boolean;
  /** Une rubrique est sélectionnée. */
  rubrique: boolean;
}

export type CauseGrilleVide =
  /** La table est vide : le tirage n'a rien déposé. */
  | "catalogue-absent"
  /** Des articles sont là, aucun n'est marqué en vente. */
  | "aucun-vendable"
  /** Le catalogue est vendable, c'est le terme qui ne trouve rien. */
  | "recherche"
  /** Le catalogue est vendable, c'est la rubrique qui est vide. */
  | "rubrique";

export interface MessageGrilleVide {
  cause: CauseGrilleVide;
  icone: IconName;
  titre: string;
  message: string;
  /**
   * Une synchronisation lève-t-elle cette cause ?
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LA DISTINCTION EST STRUCTURELLE, ET ELLE NE PEUT PAS ÊTRE TEXTUELLE.  │
   * │                                                                        │
   * │ Le message d'« aucun article en vente » PARLE de synchronisation, pour │
   * │ dire qu'elle n'y changera rien. Un garde-fou qui chercherait le mot    │
   * │ dans la prose crierait donc sur la phrase la plus utile de l'écran -   │
   * │ et un garde-fou qui crie sur du code légitime finit désactivé.         │
   * │                                                                        │
   * │ Ce drapeau porte la décision ; la prose ne fait que l'expliquer. Il    │
   * │ décide aussi du BOUTON de l'état vide : on n'offre un geste que là où  │
   * │ il aboutit.                                                            │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  leveParSynchronisation: boolean;
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES CAUSES STRUCTURELLES PASSENT AVANT LES FILTRES, ET L'ORDRE EST TOUT.│
 * │                                                                          │
 * │ Sur un catalogue absent, « Aucun article trouvé · essayez un autre mot » │
 * │ est un mensonge : il n'y a pas d'autre mot à essayer. Le terme saisi ne  │
 * │ devient une explication que lorsqu'il existe réellement quelque chose à  │
 * │ chercher.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function causeGrilleVide(d: DiagnosticCatalogue): CauseGrilleVide {
  if (d.recus === 0) return "catalogue-absent";
  if (d.vendables === 0) return "aucun-vendable";
  if (d.recherche) return "recherche";
  return "rubrique";
}

/**
 * Le message rendu par l'état vide de la grille.
 *
 * Chaque cause NOMME le geste qui la lève, et chez QUI il se fait : une cause
 * qu'on ne peut pas corriger depuis le comptoir doit dire où aller, sinon le
 * caissier retente indéfiniment le seul geste qu'il connaisse.
 */
export function messageGrilleVide(d: DiagnosticCatalogue): MessageGrilleVide {
  const cause = causeGrilleVide(d);

  switch (cause) {
    case "catalogue-absent":
      return {
        cause,
        icone: "Package",
        titre: "Catalogue vide",
        message: "Synchronisez pour recevoir le catalogue de votre organisation.",
        leveParSynchronisation: true,
      };

    case "aucun-vendable":
      // Le NOMBRE compte : il prouve au caissier que la synchronisation a
      // fonctionné, donc que la refaire n'y changera rien.
      return {
        cause,
        icone: "PackageX",
        titre: "Aucun article en vente",
        message:
          `${d.recus} ${d.recus === 1 ? "article est bien reçu" : "articles sont bien reçus"}, ` +
          "mais aucun n'est marqué en vente. Cela se règle au back-office, sur la fiche de " +
          "l'article : synchroniser n'y changera rien.",
        leveParSynchronisation: false,
      };

    case "recherche":
      return {
        cause,
        icone: "Package",
        titre: "Aucun article trouvé",
        message: "Essayez un autre mot, ou scannez le code-barres.",
        leveParSynchronisation: false,
      };

    case "rubrique":
      return {
        cause,
        icone: "Package",
        titre: "Aucun article dans cette rubrique",
        message: "Choisissez « Tout » pour revoir le catalogue entier.",
        leveParSynchronisation: false,
      };
  }
}
