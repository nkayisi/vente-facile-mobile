/**
 * Le PÉRIMÈTRE d'un approvisionnement de masse, décidé EN LOCAL.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA FEUILLE SE PRÉ-REMPLIT HORS LIGNE, ET CE N'EST PAS UN CONFORT.        │
 * │                                                                          │
 * │ Un magasinier prépare sa livraison au fond d'un dépôt, là où il y a le   │
 * │ moins de réseau de tout le magasin. L'endpoint serveur existe et sert le │
 * │ back-office ; ici on rejoue son critère sur la base locale, qui porte    │
 * │ déjà tout le nécessaire - conditionnement, libellés d'unités, les quatre │
 * │ prix. La preuve en est `feuille-mouvement.tsx`, qui saisit déjà un       │
 * │ approvisionnement hors ligne.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ MODULE PUR : il ne lit ni la base ni le réseau. Les lignes lui sont
 * PASSÉES, par `data/stock-niveaux.ts` et `data/articles.ts`. Une règle de
 * périmètre fausse ne lève rien - elle fait simplement disparaître de la
 * feuille des articles qu'on venait réapprovisionner - et cela s'éprouve sans
 * appareil.
 */
import type { LigneNiveau } from "@/data/stock-niveaux";

export type PorteeAppro = "bas" | "categorie" | "article" | "tout";

export interface DemandePerimetre {
  portee: PorteeAppro;
  /** Identifiants de catégories, SOUS-ARBRES déjà résolus par l'appelant. */
  categories?: string[];
  /** Identifiants d'articles, pour la portée « liste ». */
  articles?: string[];
  recherche?: string;
}

/**
 * Borne dure, miroir de `LIGNES_MAX` du serveur.
 *
 * ⚠ TRONQUER EN SILENCE FERAIT CROIRE LA LIVRAISON SAISIE EN ENTIER. L'appelant
 * reçoit `tronquee` et doit l'AFFICHER.
 */
export const LIGNES_MAX = 300;

/**
 * Les filtres SQL d'un périmètre, pour `niveauxDeStock`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUT LE NARROWING EST EN SQL, ET CE MODULE N'EN REFAIT AUCUN.            │
 * │                                                                          │
 * │ Une première écriture filtrait la catégorie et le seuil ICI, sur les      │
 * │ lignes déjà lues : c'est-à-dire APRÈS la fenêtre de `limite`. Trois cents │
 * │ rayons lus puis aucun de la catégorie demandée - le défaut exact que      │
 * │ `/rayon` a déjà payé (« une liste filtrée était silencieusement           │
 * │ tronquée, et `total` comptait la fenêtre »).                              │
 * │                                                                          │
 * │ Ce module TRADUIT donc une demande en filtres, et garde pour lui le seul  │
 * │ calcul qui ne soit pas une requête : la quantité PROPOSÉE.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function filtresDuPerimetre(demande: DemandePerimetre): {
  categories?: string[];
  reassort?: boolean;
  recherche?: string;
  limite: number;
} {
  const { portee, categories = [], recherche } = demande;
  return {
    // ⚠ `LIGNES_MAX + 1` : on lit UNE ligne de plus que la borne, et c'est ce
    //   qui permet de SAVOIR qu'on tronque. Lire exactement la borne rendrait
    //   « trois cents » indiscernable de « exactement trois cents ».
    limite: LIGNES_MAX + 1,
    ...(recherche?.trim() ? { recherche: recherche.trim() } : {}),
    ...(portee === "bas" ? { reassort: true } : {}),
    ...(portee === "categorie" && categories.length
      ? { categories }
      : {}),
  };
}

/**
 * La quantité PROPOSÉE pour remonter au seuil.
 *
 * ⚠ C'EST UNE PROPOSITION, PAS UNE DÉCISION, comme côté serveur : on propose de
 * remonter au seuil, et le magasinier corrige. Lui imposer la quantité ferait
 * acheter un carton là où il sait qu'il en faut dix.
 */
export function manquePropose(l: Pick<LigneNiveau, "seuilReassort" | "total">): number {
  return Math.max(l.seuilReassort - l.total, 0);
}

export interface FeuilleLocale<T> {
  lignes: T[];
  tronquee: boolean;
  limite: number;
}

/**
 * Borne la feuille, et DIT qu'elle l'est.
 *
 * ⚠ C'est l'autre moitié du `LIGNES_MAX + 1` : la lecture en rend une de trop,
 * on la retire, et `tronquee` devient une certitude plutôt qu'une supposition.
 */
export function bornerFeuille<T>(lignes: T[]): FeuilleLocale<T> {
  const tronquee = lignes.length > LIGNES_MAX;
  return {
    lignes: tronquee ? lignes.slice(0, LIGNES_MAX) : lignes,
    tronquee,
    limite: LIGNES_MAX,
  };
}

/**
 * La portée « liste d'articles » se filtre EN MÉMOIRE, et c'est le seul cas.
 *
 * ⚠ Elle n'a pas besoin de SQL : la liste est COMPOSÉE par le magasinier, donc
 * bornée par ce qu'il a tapé - jamais par la taille du catalogue. Il ne peut
 * pas en désigner trois cents un par un, donc la fenêtre ne peut pas la
 * tronquer.
 */
export function retenirLesArticles<T extends { produitId: string }>(
  lignes: T[],
  voulus: string[]
): T[] {
  const ensemble = new Set(voulus);
  return lignes.filter((l) => ensemble.has(l.produitId));
}
