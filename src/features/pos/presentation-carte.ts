/**
 * Ce que la carte d'un article dit de son stock, PUR.
 *
 * Miroir de la carte du point de vente du back-office : un bandeau posé sur la
 * vignette, vert quand il y en a, ambre sous le seuil, rouge quand il n'y en a
 * plus. Le caissier repère ce qu'il peut vendre sans lire un seul chiffre.
 *
 * ⚠ LE ROUGE NE DIT PAS « ZÉRO ». Un article sans aucune ligne de stock dans
 * cet entrepôt est rouge parce qu'il ne s'encaissera pas ici, mais son libellé
 * reste « Aucun stock » : `null` ne se lit jamais « Épuisé ».
 */
import {
  formatQuantity,
  formatUnitQuantity,
  getPackaging,
  roundQuantity,
} from "@vente-facile/core";

import type { ArticlePos } from "./catalogue";

export type EtatDeStock = "verrouille" | "non_suivi" | "aucun" | "epuise" | "bas" | "ok";

/** Le repli du back-office pour un article sans seuil de réassort. */
const SEUIL_PAR_DEFAUT = 5;

/**
 * L'état de la carte, compte tenu de ce qui est déjà au panier : le dernier
 * article qu'on vient d'y mettre fait passer la carte au rouge tout de suite.
 */
export function etatDeLaCarte(article: ArticlePos, auPanier = 0): EtatDeStock {
  if (article.verrou_inventaire !== null) return "verrouille";
  if (!article.track_inventory) return "non_suivi";
  if (article.stock_quantity === null) return "aucun";
  const restant = roundQuantity(article.stock_quantity - auPanier);
  if (restant <= 0) return "epuise";
  // `||` et non `??` : un seuil à « 0.000 » veut dire « aucun seuil réglé ».
  const seuil = parseFloat(article.reorder_point ?? "") || SEUIL_PAR_DEFAUT;
  return restant <= seuil ? "bas" : "ok";
}

/**
 * Le symbole, quand c'en est un vrai.
 *
 * ⚠ BEAUCOUP DE MARCHANDS RECOPIENT LE NOM DANS LE SYMBOLE, tronqué aux dix
 * caractères du champ : « BOITE » pour BOITE, « PLAQUETT » pour PLAQUETTE.
 * Écrit tel quel, il donnait « 6 BOITE » et « 1 PLAQUETT » (relevé sur
 * l'émulateur). Un symbole par lequel le nom commence n'abrège rien : on écrit
 * alors le nom, qui s'accorde. « kg », « pce » ou « BTE » restent des symboles.
 */
function symboleUtile(symbole: string | null | undefined, nom: string): string | null {
  const s = symbole?.trim();
  if (!s) return null;
  return nom.trim().toLowerCase().startsWith(s.toLowerCase()) ? null : s;
}

function quantite(n: number, symbole: string | null | undefined, mot: string, court: boolean) {
  // Le symbole ne s'accorde pas ; le nom, si.
  const abrege = court ? symboleUtile(symbole, mot) : null;
  return abrege ? `${formatQuantity(n)} ${abrege}` : formatUnitQuantity(n, mot);
}

/**
 * Le texte du bandeau.
 *
 * `court` : la vignette de 76 points n'a pas la place de « 13 BOITES + 14
 * AMPOULES », on y écrit les symboles d'unité, comme le back-office.
 *
 * Le partage scellé / détail est LU, jamais recalculé : un rayon de 3 casiers
 * et 7 bouteilles ne se présente pas comme « 43 ».
 */
export function libelleDuBandeau(article: ArticlePos, court = false): string {
  if (!article.track_inventory) return "Non suivi";
  if (article.stock_quantity === null) return "Aucun stock";

  const conditionnement = getPackaging(article);
  const scelles = article.stock_packages;
  const detail = article.stock_loose;

  if (conditionnement && scelles !== null && detail !== null) {
    const parts: string[] = [];
    if (scelles > 0) {
      parts.push(quantite(scelles, article.packaging_unit_symbol, conditionnement.packageWord, court));
    }
    if (detail > 0) {
      parts.push(quantite(detail, article.unit_symbol, conditionnement.retailWord, court));
    }
    return parts.length > 0 ? parts.join(" + ") : "Épuisé";
  }

  if (article.stock_quantity <= 0) return "Épuisé";
  return quantite(article.stock_quantity, article.unit_symbol, article.unit_name || "unité", court);
}

/**
 * Où trouver l'article : son emplacement, puis l'entrepôt de la caisse.
 *
 * Sans ligne de stock ici il n'est nulle part dans ce dépôt, et nommer
 * l'entrepôt l'y ferait chercher.
 */
export function lieuDeLArticle(article: ArticlePos, entrepot: string | null | undefined): string {
  if (article.stock_quantity === null) return "-";
  const emplacements = article.emplacement?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];
  const parts = [...emplacements, entrepot?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "-";
}
