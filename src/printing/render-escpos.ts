/**
 * Les lignes mises en page vers des octets ESC/POS.
 *
 * UNE SEULE MISE EN PAGE, DEUX ENCODAGES. `render-text.ts` décide de tout ce
 * qui se voit : les 42 colonnes, le repli des noms d'articles, le couple
 * libellé/montant qui ne se recouvre jamais, le bandeau à filets. Ce fichier
 * n'en change rien, il l'habille d'octets. C'est pourquoi le ticket d'une
 * imprimante Bluetooth et celui du terminal ne peuvent pas diverger : ils
 * lisent le même tableau de lignes.
 *
 * ESC/POS EST LE DÉNOMINATEUR COMMUN. C'est le langage que parlent
 * l'écrasante majorité des imprimantes thermiques, quel que soit leur transport
 * (Bluetooth, USB, réseau, imprimante intégrée d'un terminal de caisse) et quel
 * que soit leur fabricant. Encoder une fois pour toutes, puis se contenter
 * d'ACHEMINER les octets, c'est ce qui permet d'ajouter un transport sans
 * retoucher un seul document.
 *
 * L'encodage lui-même n'est pas écrit à la main : `@point-of-sale/receipt-printer-encoder`
 * porte les tables de pages de code, les séquences d'initialisation et de coupe,
 * et sait aussi parler StarPRNT et StarLine. C'est un paquet SANS code natif,
 * donc sans rebuild ni incompatibilité d'architecture : il produit un
 * `Uint8Array` que n'importe quel transport peut écrire.
 */
import ReceiptPrinterEncoder from "@point-of-sale/receipt-printer-encoder";

import { colonnesPour, type Alignement, type LigneImprimee } from "./render-text";

/** Langages compris par l'encodeur. ESC/POS couvre tout sauf les Star. */
export type LangageImprimante = "esc-pos" | "star-prnt" | "star-line";

export interface OptionsEscPos {
  paperWidth?: 58 | 80;
  language?: LangageImprimante;
  /** Coupe le papier en fin de ticket. Faux sur les imprimantes sans massicot. */
  cut?: boolean;
  /** Lignes d'avance avant la coupe, pour ne pas trancher la dernière ligne. */
  feedBeforeCut?: number;
}

/**
 * Produit le flux ESC/POS d'un document déjà mis en page.
 *
 * L'initialisation en tête n'est pas décorative : une imprimante garde l'état
 * du ticket précédent (gras, échelle, page de code). Sans elle, un reçu imprimé
 * après un titre doublé sortirait entièrement en double.
 */
export function rendreEscPos(
  lignes: LigneImprimee[],
  options: OptionsEscPos = {}
): Uint8Array {
  const colonnes = colonnesPour(options.paperWidth ?? 58);

  const encodeur = new ReceiptPrinterEncoder({
    language: options.language ?? "esc-pos",
    columns: colonnes,
    // `\n` seul : le `\n\r` par défaut fait avancer d'une ligne de trop sur
    // beaucoup d'imprimantes chinoises à 58 mm, ce qui double l'interligne et
    // gaspille du papier sur un rouleau qui coûte cher au marchand.
    newline: "\n",
    feedBeforeCut: options.feedBeforeCut ?? 4,
  });

  // Une ligne vide de tête, qui sert DEUX fins.
  //
  // La première est le confort de découpe : le massicot d'une thermique tombe
  // quelques millimètres sous la dernière ligne imprimée, et sans blanc de tête
  // le ticket suivant commence dans la déchirure du précédent.
  //
  // La seconde est un défaut mesuré de l'encodeur : quand la toute première
  // ligne est centrée et que rien ne la précède, son remplissage sort AVANT le
  // `ESC @`, que l'imprimante traite comme une remise à zéro. Le nom de
  // l'établissement partait alors collé à gauche. Une ligne quelconque devant
  // suffit à remettre les commandes dans l'ordre.
  encodeur.initialize().align("left").text("").newline();

  let alignementCourant: Alignement = "left";

  for (const ligne of lignes) {
    const alignement = ligne.align ?? "left";
    if (alignement !== alignementCourant) {
      encodeur.align(alignement);
      alignementCourant = alignement;
    }

    const doublee = ligne.scale === 2;
    // L'ordre compte : la taille avant le texte, sinon la ligne courante sort
    // dans l'ancienne échelle et la suivante hérite de la nouvelle.
    //
    // L'alignement est DÉLÉGUÉ à l'encodeur, et c'est un choix : il compte la
    // largeur RÉELLE, remplissant en caractères simples devant un texte doublé.
    // Le calculer nous-mêmes centrerait un titre doublé sur la moitié du
    // ticket, faute de pouvoir mélanger les deux chasses dans une même chaîne.
    if (doublee) encodeur.size(2);
    if (ligne.bold) encodeur.bold(true);

    encodeur.text(ligne.text).newline();

    if (ligne.bold) encodeur.bold(false);
    if (doublee) encodeur.size(1);
  }

  if (options.cut !== false) encodeur.cut("full");

  return encodeur.encode();
}
