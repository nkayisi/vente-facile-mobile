/**
 * Le ticket vers des octets ESC/POS, par deux chemins qui n'ont pas le même rang.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `rendreEscPosImage` EST LE CHEMIN ORDINAIRE. `rendreEscPos` EST UN REPLI.│
 * │                                                                          │
 * │ Le premier envoie la PAGE DESSINÉE (`render-html.ts` par `raster.ts`),    │
 * │ la même que le PDF et que l'imprimante intégrée : bandeau en vidéo        │
 * │ inversée, hiérarchie de police, accents, colonnes de montants alignées.   │
 * │ Le second rend des lignes de texte, sans rien de tout cela, et il existe  │
 * │ pour le seul cas où le rastériseur manque - un ticket qui ne sort pas du  │
 * │ tout est le seul échec inacceptable.                                      │
 * │                                                                          │
 * │ Tant que le texte était le SEUL chemin Bluetooth, deux machines chez le   │
 * │ même marchand sortaient deux papiers différents pour la même vente.       │
 * └──────────────────────────────────────────────────────────────────────────┘
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

import { octetsParRangee, type RasterTicket } from "./raster";
import {
  colonnesPour,
  policePour,
  type Alignement,
  type LigneImprimee,
} from "./render-text";

/** Langages compris par l'encodeur. ESC/POS couvre tout sauf les Star. */
export type LangageImprimante = "esc-pos" | "star-prnt" | "star-line";

/** Ce que `@point-of-sale/receipt-printer-encoder` accepte, et rien d'autre. */
const COLONNES_ADMISES = [32, 35, 42, 44, 48];

/** Lignes déroulées avant la lame, pour ne pas trancher la dernière ligne. */
const AVANCE_AVANT_COUPE = 4;

/**
 * Avance en fin de ticket SANS massicot : aucune.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES IMPRIMANTES AVANCENT DÉJÀ D'ELLES-MÊMES, ET C'EST MESURÉ.          │
 * │                                                                          │
 * │ On a d'abord ajouté quatre lignes ici, en raisonnant qu'un ticket sans   │
 * │ coupe resterait sous la tête d'impression et se déchirerait au milieu du │
 * │ total. Le raisonnement était juste et le fait ne l'était pas : relevé    │
 * │ à la règle sur une T58_9345, le blanc de fin fait 2 à 3 cm alors que     │
 * │ notre flux n'en pose qu'un peu plus d'un. La machine déroule SEULE       │
 * │ jusqu'à sa barre de déchirure, comme la plupart des 58 mm mobiles, et    │
 * │ nos quatre lignes s'y ajoutaient pour rien, à chaque vente.              │
 * │                                                                          │
 * │ ⚠ Une imprimante qui n'avancerait PAS laisserait sa dernière ligne sous  │
 * │ la tête. Le cas ne s'est pas présenté ; `feedBeforeCut` reste honoré si  │
 * │ on le passe, et c'est par là qu'il se traiterait. On n'invente pas un    │
 * │ réglage pour un matériel qu'on n'a jamais vu.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const AVANCE_SANS_MASSICOT = 0;

/**
 * Une ligne vide, et UNE SEULE avance de papier.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `text("").newline()` AVANCE LE PAPIER DEUX FOIS.                        │
 * │                                                                          │
 * │ Mesuré sur le flux : une ligne de TEXTE coûte un saut de ligne, une      │
 * │ ligne VIDE en coûte deux. L'encodeur ferme la ligne courante quand on    │
 * │ lui donne une chaîne, fût-elle vide, et `newline()` en ajoute une autre. │
 * │                                                                          │
 * │ Conséquence : chaque respiration d'un ticket faisait DOUBLE hauteur, sur │
 * │ toute sa longueur, et le pied de page s'éloignait d'autant. Relevé au    │
 * │ comptoir comme « beaucoup d'espace à la fin du ticket » - et c'était     │
 * │ vrai PARTOUT, pas seulement à la fin.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function ligneVide(encodeur: { newline(): unknown }): void {
  encodeur.newline();
}

export interface OptionsEscPos {
  paperWidth?: 58 | 80;
  language?: LangageImprimante;
  /** Coupe le papier en fin de ticket. Faux sur les imprimantes sans massicot. */
  cut?: boolean;
  /**
   * Lignes d'avance en fin de ticket.
   *
   * Avec massicot, elles évitent de trancher la dernière ligne. Sans massicot,
   * elles valent ZÉRO par défaut : voir l'encadré d'`AVANCE_SANS_MASSICOT`.
   */
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
  const papier = options.paperWidth ?? 58;
  const colonnes = colonnesPour(papier);

  // Un garde-fou qui NOMME la cause, plutôt que de laisser fuiter celle de la
  // bibliothèque (« The width of the paper must me either… », en anglais et
  // avec sa faute de frappe) jusque sur l'écran d'un caissier.
  if (!COLONNES_ADMISES.includes(colonnes)) {
    throw new Error(
      `Largeur de ticket non prise en charge : ${colonnes} colonnes. ` +
        `L'encodeur n'accepte que ${COLONNES_ADMISES.join(", ")}.`
    );
  }

  const encodeur = new ReceiptPrinterEncoder({
    language: options.language ?? "esc-pos",
    columns: colonnes,
    // `\n` seul : le `\n\r` par défaut fait avancer d'une ligne de trop sur
    // beaucoup d'imprimantes chinoises à 58 mm, ce qui double l'interligne et
    // gaspille du papier sur un rouleau qui coûte cher au marchand.
    newline: "\n",
    feedBeforeCut: options.feedBeforeCut ?? AVANCE_AVANT_COUPE,
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
  // ┌──────────────────────────────────────────────────────────────────────────┐
  // │ LA POLICE EST CHOISIE, ELLE N'EST PLUS SUBIE.                           │
  // │                                                                          │
  // │ `initialize()` émet `ESC M 0`, donc la POLICE A. Colonnes et police vont │
  // │ ensemble, et c'est `render-text.ts` qui les déclare dans une seule table :│
  // │ 58 mm et 80 mm sont aujourd'hui en police A (32 et 48 colonnes), donc    │
  // │ rien n'est à envoyer. La branche reste, parce qu'une mise en page de 42  │
  // │ colonnes exige la police B, dont la chasse fait 9 points : la lui        │
  // │ envoyer sans le dire replierait chaque ligne pleine en laissant un       │
  // │ moignon collé à gauche, et le matériel ne signalerait rien.              │
  // │                                                                          │
  // │ ⚠ ON N'APPELLE PAS `encodeur.font("B")`, ET C'EST MESURÉ.               │
  // │                                                                          │
  // │ Cette méthode change AUSSI la largeur que l'encodeur s'attribue, au      │
  // │ rapport des colonnes déclarées par le profil générique : relevé, nos 42  │
  // │ colonnes devenaient 56. Le remplissage d'un titre centré passait de 17 à │
  // │ 24 espaces, donc hors du papier. Nous voulons dire à l'IMPRIMANTE quelle │
  // │ police adopter, pas redéfinir la mise en page que nous venons de faire.  │
  // │ `ESC M n` la dit, et rien d'autre : 0 = police A, 1 = police B.          │
  // │                                                                          │
  // │ La commande reste en tête, avant le moindre `text()` : une police ne se  │
  // │ change pas au milieu d'une ligne.                                        │
  // └──────────────────────────────────────────────────────────────────────────┘
  encodeur.initialize();
  if (policePour(papier) === "B") encodeur.raw([0x1b, 0x4d, 0x01]);
  encodeur.align("left");
  ligneVide(encodeur);

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

    if (ligne.text === "") ligneVide(encodeur);
    else encodeur.text(ligne.text).newline();

    if (ligne.bold) encodeur.bold(false);
    if (doublee) encodeur.size(1);
  }

  if (options.cut !== false) {
    encodeur.cut("full");
  } else {
    // Voir l'encadré d'`AVANCE_SANS_MASSICOT` : ces machines déroulent seules
    // jusqu'à leur barre de déchirure, et ajouter des lignes ici gaspille du
    // papier à chaque vente.
    const avance = options.feedBeforeCut ?? AVANCE_SANS_MASSICOT;
    for (let i = 0; i < avance; i++) ligneVide(encodeur);
  }

  return encodeur.encode();
}

/* -------------------------------------------------------------------------- */
/* La page dessinée                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Rangées envoyées par commande.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON DÉCOUPE EN BANDES, ET CE N'EST PAS DÉCORATIF.                        │
 * │                                                                          │
 * │ `GS v 0` accepte en théorie 65 535 rangées : un ticket de vente entier   │
 * │ tiendrait en une seule commande de 48 Ko. En pratique, les 58 mm bon     │
 * │ marché ont un tampon de deux cent cinquante à cinq cents octets et un    │
 * │ firmware qui borne la hauteur d'une image ; une commande unique s'y      │
 * │ perd, et la perte ne lève pas - le papier sort amputé.                   │
 * │                                                                          │
 * │ Cent vingt-huit rangées font 6 Ko : bien en deçà de toutes les bornes    │
 * │ relevées, et assez grand pour qu'un ticket ordinaire tienne en une       │
 * │ dizaine de commandes. Le transport les redécoupe ensuite à son propre    │
 * │ tampon (`flux.ts`), ce sont deux découpages distincts et il faut les     │
 * │ deux : l'un borne ce que le FIRMWARE accepte, l'autre ce que la SOCKET   │
 * │ avale.                                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const RANGEES_PAR_BANDE = 128;

export interface OptionsEscPosImage {
  paperWidth?: 58 | 80;
  language?: LangageImprimante;
  cut?: boolean;
  feedBeforeCut?: number;
  /** Rangées par commande. Voir `RANGEES_PAR_BANDE`. */
  bande?: number;
}

/**
 * Le flux ESC/POS d'une page déjà dessinée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON ÉCRIT `GS v 0` À LA MAIN, ET C'EST MOTIVÉ.                           │
 * │                                                                          │
 * │ L'encodeur sait pourtant faire (`encodeur.image()`), et la règle de ce   │
 * │ fichier est de ne pas écrire d'ESC/POS soi-même. Mais son entrée est du  │
 * │ RGBA : il faudrait dé-empaqueter nos bits en quatre octets par point -   │
 * │ 1,8 Mo pour un ticket long, sur un terminal d'entrée de gamme - pour     │
 * │ qu'il les re-seuille et les ré-empaquette exactement comme ils étaient.  │
 * │ Notre format EST déjà la charge utile de la commande.                    │
 * │                                                                          │
 * │ La même justification que le `ESC M n` émis en `raw()` plus haut : il ne │
 * │ s'agit pas d'encoder un document, mais d'une commande documentée dont on │
 * │ tient déjà les octets.                                                    │
 * │                                                                          │
 * │ ⚠ Contrepartie : on perd le mode « colonne » (`ESC *`) de l'encodeur,    │
 * │ qu'une imprimante très ancienne pourrait exiger. Le repli nommé, pour ce │
 * │ cas, est le chemin TEXTE (`rendreEscPos`), que l'écran Imprimante offre. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function rendreEscPosImage(
  raster: RasterTicket,
  options: OptionsEscPosImage = {}
): Uint8Array {
  const papier = options.paperWidth ?? 58;
  const colonnes = colonnesPour(papier);

  if (!COLONNES_ADMISES.includes(colonnes)) {
    throw new Error(
      `Largeur de ticket non prise en charge : ${colonnes} colonnes. ` +
        `L'encodeur n'accepte que ${COLONNES_ADMISES.join(", ")}.`
    );
  }

  const encodeur = new ReceiptPrinterEncoder({
    language: options.language ?? "esc-pos",
    columns: colonnes,
    newline: "\n",
    feedBeforeCut: options.feedBeforeCut ?? AVANCE_AVANT_COUPE,
  });

  // L'initialisation n'est pas décorative : une imprimante garde l'état du
  // ticket précédent (gras, échelle, alignement). `ESC @` remet aussi
  // l'alignement à gauche, ce dont l'image dépend : la page fait EXACTEMENT la
  // largeur de la tête, un centrage la décalerait d'un demi-point ou la
  // replierait.
  encodeur.initialize();

  const parRangee = octetsParRangee(raster.largeur);
  const bande = Math.max(1, Math.floor(options.bande ?? RANGEES_PAR_BANDE));

  for (let y = 0; y < raster.hauteur; y += bande) {
    const rangees = Math.min(bande, raster.hauteur - y);
    const debut = y * parRangee;
    const tranche = raster.points.subarray(debut, debut + rangees * parRangee);
    // GS v 0 m xL xH yL yH, avec m = 0 : densité normale, pas de double échelle.
    // xL/xH comptent des OCTETS par rangée, yL/yH des RANGÉES : les confondre
    // rend une image huit fois trop large, et l'imprimante n'en dit rien.
    encodeur.raw([
      0x1d,
      0x76,
      0x30,
      0x00,
      parRangee & 0xff,
      (parRangee >> 8) & 0xff,
      rangees & 0xff,
      (rangees >> 8) & 0xff,
      ...Array.from(tranche),
    ]);
  }

  if (options.cut !== false) {
    encodeur.cut("full");
  } else {
    // Voir l'encadré d'`AVANCE_SANS_MASSICOT` : ces machines déroulent seules
    // jusqu'à leur barre de déchirure, et ajouter des lignes ici gaspille du
    // papier à chaque vente.
    const avance = options.feedBeforeCut ?? AVANCE_SANS_MASSICOT;
    for (let i = 0; i < avance; i++) ligneVide(encodeur);
  }

  return encodeur.encode();
}
