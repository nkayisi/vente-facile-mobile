/**
 * Ce que la présentation raconte, et la mécanique de sa pagination.
 *
 * Module PUR : ni base, ni composant, ni navigation. C'est ce qui permet
 * d'éprouver le bornage de l'index et les libellés sans appareil, et une
 * pagination fausse ne lève rien - elle laisse simplement le marchand sur une
 * vue dont le bouton ne mène plus nulle part.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES VUES REPRENNENT LA SECTION « FONCTIONNALITÉS » DU SITE.             │
 * │                                                                          │
 * │ Titres, promesses et mots-clés viennent de `frontend/app/page.tsx` : un  │
 * │ marchand qui a lu le site avant d'installer doit retrouver les mêmes     │
 * │ noms, sinon il croit avoir téléchargé autre chose. Les inventer ici      │
 * │ ferait deux vocabulaires pour un seul produit.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ QUATRE VUES, LÀ OÙ LE SITE EN COMPTE SIX. « Facturation » et « Sécurité
 * et accès » sont écartées, et c'est un arbitrage : une présentation se
 * parcourt d'un trait, et au-delà de quatre écrans on la passe sans la lire -
 * ce qui coûterait AUSSI les quatre premières. Les deux écartées sont en outre
 * les moins montrables au doigt : une grille de permissions et un gabarit de
 * facture ne se résument pas en une maquette. Leur substance n'est pas perdue
 * pour autant - le multi-devise est dit par les rapports, le crédit encadré
 * par les clients.
 */

export interface Vue {
  /** Sert de clé de liste, et nomme l'aperçu qui l'illustre. */
  cle: "vente" | "stock" | "clients" | "rapports";
  /** Court, et sur deux lignes au plus : c'est le titre d'un écran, pas une phrase. */
  titre: string;
  /**
   * ⚠ COURT, ET C'EST UNE CONTRAINTE DE MISE EN PAGE.
   *
   * La vue rend ce texte CENTRÉ. Un texte centré se relit mal dès la
   * quatrième ligne : l'œil doit rechercher le début de chacune, là où un
   * texte aligné à gauche lui donne un bord fixe. Rallonger l'un de ces
   * quatre corps ne lève rien et ne casse aucun test - la présentation
   * devient simplement pénible à lire, sur l'écran que le marchand voit en
   * premier. Viser trois lignes courtes, soit environ cent dix signes.
   */
  corps: string;
}

export const VUES: readonly Vue[] = [
  {
    cle: "vente",
    titre: "Point de vente",
    corps:
      "Encaissez en quelques gestes, même sans réseau. Le ticket sort, la vente part dès que la connexion revient.",
  },
  {
    cle: "stock",
    titre: "Gestion des stocks",
    corps:
      "Vos rayons en temps réel, sur plusieurs entrepôts. Le gros et le détail restent distincts, et une alerte part au seuil.",
  },
  {
    cle: "clients",
    titre: "Clients et fidélité",
    corps:
      "Fiches, historique d'achats et points de fidélité. Le crédit reste encadré par un plafond, dans sa devise.",
  },
  {
    cle: "rapports",
    titre: "Rapports et analyses",
    corps:
      "Un tableau de bord qui s'ouvre le matin, et l'export PDF ou Excel de ce que vous avez sous les yeux.",
  },
] as const;

/**
 * Le libellé du bouton dit où il MÈNE, pas ce qu'il fait défiler.
 *
 * « Suivant » sur la dernière vue promettrait une page de plus ; « Commencer »
 * dès la première priverait des autres celui qui appuie sans lire.
 */
export function libelleBouton(index: number, total = VUES.length): string {
  return index >= total - 1 ? "Commencer" : "Continuer";
}

/** « Vue 2 sur 4 » : un point de pagination ne se prononce pas. */
export function libellePoint(index: number, total = VUES.length): string {
  return `Vue ${index + 1} sur ${total}`;
}

/** Avance d'une vue, sans jamais sortir de la liste. */
export function indexSuivant(index: number, total = VUES.length): number {
  return borner(index + 1, total);
}

/**
 * L'index que désigne un défilement horizontal.
 *
 * ⚠ ON ARRONDIT, ON NE TRONQUE PAS. Un `Math.floor` rendrait la vue
 * PRÉCÉDENTE tant que le doigt n'a pas franchi la page entière, si bien que
 * les points de pagination retarderaient d'un cran sur ce qu'on voit.
 *
 * Une largeur nulle arrive : c'est le premier rendu, avant la mesure de la
 * fenêtre. Diviser par elle donnerait `NaN`, et `NaN` borné reste `NaN`.
 */
export function indexDeLOffset(x: number, largeur: number, total = VUES.length): number {
  if (!(largeur > 0)) return 0;
  return borner(Math.round(x / largeur), total);
}

function borner(index: number, total: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(total - 1, Math.max(0, index));
}
