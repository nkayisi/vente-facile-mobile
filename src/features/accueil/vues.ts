/**
 * Ce que la présentation montre, et la mécanique de sa pagination.
 *
 * Module PUR : ni base, ni composant, ni navigation. C'est ce qui permet
 * d'éprouver le bornage de l'index et la copie sans appareil, et une
 * pagination fausse ne lève rien - elle laisse simplement le marchand sur une
 * vue dont le bouton ne mène plus nulle part.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUATRE VUES, ET CHACUNE MONTRE DEUX MODULES SUR DEUX CARTES.            │
 * │                                                                          │
 * │ Les huit cartes sont celles de `CAPACITES`, dans                         │
 * │ `frontend/lib/marketing/content.ts`, au mot près : label, phrase et      │
 * │ trois puces. Un marchand qui a lu le site avant d'installer doit         │
 * │ retrouver les mêmes promesses, sinon il croit avoir téléchargé autre     │
 * │ chose. `vues.test.ts` croise les deux listes DANS LES DEUX SENS et lit   │
 * │ la source du site : recopier ici sans le dire est précisément ce qui     │
 * │ ferait naître un second vocabulaire pour un seul produit.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE BANDEAU NOMME LA RUBRIQUE, LE TITRE PROMET UN RÉSULTAT.              │
 * │                                                                          │
 * │ Les deux ont leur place, et c'est ce que les maquettes ont tranché. Une  │
 * │ version antérieure n'avait que le titre, et lui faisait porter les deux  │
 * │ rôles : « Point de vente » décrit une CATÉGORIE DE LOGICIEL que tout     │
 * │ concurrent possède, et n'apprend rien à qui hésite. Ici la rubrique est  │
 * │ reléguée au bandeau - où elle sert de repère, pas d'argument - et le     │
 * │ titre dit ce que le marchand y gagne.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ `import type`, ET SEULEMENT `import type`. `@/ui` tire le thème, qui tire
 * les réglages, qui OUVRE SQLite au chargement : un import de VALEUR ferait
 * échouer toute la suite hors appareil. Le compilateur efface celui-ci.
 */
import type { IconName } from "@/ui";

/** Une carte de la pile : un module du produit, tel que le site l'annonce. */
export interface Carte {
  /**
   * Le même glyphe que le site (`components/marketing/capability-grid.tsx`).
   * Le registre est engendré depuis les deux paquets lucide et compare les
   * tracés : ce sont donc les mêmes dessins, pas des équivalents.
   */
  icone: IconName;
  /** Écrit en clair ; c'est l'affichage qui le passe en capitales. */
  label: string;
  /** Ce que le module fait, en une phrase. */
  ligne: string;
  /** Trois, jamais deux ni quatre : c'est la hauteur pour laquelle la carte est dessinée. */
  puces: readonly [string, string, string];
}

export interface Vue {
  /** Clé de liste et de maquette. */
  cle: "vente" | "stock" | "clients" | "equipe";
  /**
   * Le repère du bandeau, écrit en clair.
   *
   * ⚠ IL NE SE DÉDUIT PAS DE `cle`, ET C'EST POUR UN ACCENT. `"equipe"` mis en
   * capitales rend « EQUIPE » : la clé est en ASCII parce qu'elle sert
   * d'identifiant, et le bandeau doit écrire « ÉQUIPE ». Un accent perdu dans
   * un mot de six lettres ne lève rien, et personne ne le voit en relisant le
   * code - seulement sur l'écran du marchand.
   */
  rubrique: string;
  /**
   * ⚠ DEUX LIGNES PLEINES AU PLUS, soit environ trente-cinq signes. Au-delà,
   * le titre mange la hauteur de la pile, qui est ce qu'on vient montrer.
   */
  titre: string;
  /**
   * ⚠ DEUX LIGNES, et la borne a des dents (`vues.test.ts`).
   *
   * Le texte est aligné à GAUCHE depuis les maquettes, ce qui lui rend le
   * bord fixe qu'un texte centré n'a pas : il supporte donc une ligne de plus
   * qu'avant. Trois lignes, en revanche, prennent leur hauteur à la pile.
   */
  corps: string;
  /** [arrière, avant] : c'est l'ordre d'empilement, voir `geometrie.ts`. */
  cartes: readonly [Carte, Carte];
}

/* ─────────────────────────────────── les huit cartes, dans l'ordre du site */

const POINT_DE_VENTE: Carte = {
  icone: "ShoppingCart",
  label: "Point de vente",
  ligne: "Encaisser au comptoir, avec ou sans réseau.",
  puces: [
    "Remise par ligne ou sur le total, plafonnée",
    "Panier mis en attente, repris plus tard",
    "Vente à crédit, points de fidélité déduits",
  ],
};

const STOCK: Carte = {
  icone: "Package",
  label: "Stock",
  ligne: "Plusieurs dépôts, et ce qui circule entre eux.",
  puces: [
    "Transferts et ajustements, en deux temps",
    "Déconditionnement : ouvrir un casier",
    "Chaque mouvement garde son avant et son après",
  ],
};

const INVENTAIRE: Carte = {
  icone: "ClipboardList",
  label: "Inventaire",
  ligne: "Compter le rayon, et n'appliquer qu'après.",
  puces: [
    "Session totale, par catégorie ou par article",
    "Feuille de comptage utilisable au dépôt",
    "Écart ventilé entre gros et détail",
  ],
};

const CLIENTS: Carte = {
  icone: "Users",
  label: "Clients",
  ligne: "Le crédit, tenu dans la monnaie de la facture.",
  puces: [
    "Plafond par client, opposé à la vente",
    "Balance âgée : 0-30, 30-60, 60-90, 90+",
    "Numéro appelable depuis la fiche",
  ],
};

const CAISSE: Carte = {
  icone: "Wallet",
  label: "Caisse",
  ligne: "Le tiroir, devise par devise.",
  puces: [
    "Entrées, sorties et dépenses catégorisées",
    "Clôture Z avec comptage du tiroir",
    "Reçu de dépense imprimé sur place",
  ],
};

const DEVIS_ET_RETOURS: Carte = {
  icone: "FileText",
  label: "Devis et retours",
  ligne: "Ce qui précède la vente, et ce qui la défait.",
  puces: [
    "Devis daté, converti en vente en un geste",
    "Retour rattaché à sa ligne de facture",
    "Rien ne bouge avant une approbation",
  ],
};

const RAPPORTS: Carte = {
  icone: "BarChart3",
  label: "Rapports",
  ligne: "Huit vues, sur la période que vous choisissez.",
  puces: [
    "Ventes, produits, clients, stock, bénéfices",
    "Export PDF, Excel ou CSV",
    "Le même document depuis le web ou le terminal",
  ],
};

const EQUIPE: Carte = {
  icone: "ShieldCheck",
  label: "Équipe",
  ligne: "Qui peut faire quoi, et qui a fait quoi.",
  puces: [
    "Quatre rôles, et une permission par action",
    "Périmètre par dépôt et par utilisateur",
    "Appareils enrôlés, révocables à distance",
  ],
};

/* ──────────────────────────────────────────────────────────── les quatre vues */

export const VUES: readonly Vue[] = [
  {
    cle: "vente",
    rubrique: "Vente",
    titre: "Vendez, même sans réseau.",
    corps:
      "Encaissez au comptoir, mettez un panier en attente et clôturez le tiroir devise par devise.",
    cartes: [POINT_DE_VENTE, CAISSE],
  },
  {
    cle: "stock",
    rubrique: "Stock",
    titre: "Tous vos dépôts, sous contrôle.",
    corps:
      "Suivez ce qui circule entre vos dépôts et comptez le rayon sans bloquer la vente.",
    cartes: [STOCK, INVENTAIRE],
  },
  {
    cle: "clients",
    rubrique: "Clients",
    titre: "Le crédit client, tenu au centime.",
    corps:
      "Plafonds par client, balance âgée, et des devis convertis en vente en un geste.",
    cartes: [CLIENTS, DEVIS_ET_RETOURS],
  },
  {
    cle: "equipe",
    rubrique: "Équipe",
    titre: "Chacun à sa place, tout est tracé.",
    corps:
      "Des rapports exportables, quatre rôles et une permission par action, sur chaque appareil.",
    cartes: [RAPPORTS, EQUIPE],
  },
] as const;

/**
 * Le bandeau : « 01 / 04 · VENTE ».
 *
 * ⚠ PAS D'`Intl`, ET PAS DE `padStart` SUR UN NOMBRE NÉGOCIÉ AILLEURS. Deux
 * chiffres parce que le rang se lit comme un compteur, et qu'un « 1 / 4 »
 * sur quatre vues n'a pas la même assise typographique qu'un « 01 / 04 ».
 */
export function libelleRang(index: number, total = VUES.length): string {
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${deux(index + 1)} / ${deux(total)}`;
}

/**
 * Le libellé du bouton dit où il MÈNE, pas ce qu'il fait défiler.
 *
 * « Suivant » sur la dernière vue promettrait une page de plus ; « Commencer »
 * dès la première priverait des autres celui qui appuie sans lire.
 */
export function libelleBouton(index: number, total = VUES.length): string {
  return index >= total - 1 ? "Commencer" : "Suivant";
}

/**
 * Le libellé de l'action d'en-tête.
 *
 * ⚠ « PASSER » N'A PLUS DE SENS SUR LA DERNIÈRE VUE : il n'y a plus rien à
 * passer, et le bouton principal dit déjà « Commencer ». La place sert alors
 * à revenir au début, pour qui a balayé trop vite.
 */
export function libelleEntete(index: number, total = VUES.length): string {
  return index >= total - 1 ? "Revoir" : "Passer";
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
