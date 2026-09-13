/**
 * `Block[]` vers des lignes de texte, pour une imprimante thermique.
 *
 * Le mobile NE CONSTRUIT PLUS de document, il en REND un.
 * `@vente-facile/core/receipt` décrit le ticket en blocs typés, le back-office
 * les rend en PDF, ce fichier les rend en colonnes de caractères. C'est ce qui
 * met fin à la double implémentation de l'ancienne application, où le ticket
 * mobile était réécrit à la main et avait dérivé du ticket web : il ignorait le
 * conditionnement, imprimait des décimales que le franc congolais n'a pas, et
 * recalculait un partage scellé/vrac que le serveur avait déjà décidé.
 *
 * CALIBRATION MESURÉE, JAMAIS DÉDUITE. 42 colonnes à `SIZE_BODY = 18` sur
 * 58 mm, relevé sur papier avec l'ancienne application. La largeur et le corps
 * sont liés : changer l'un sans réimprimer la règle produit des lignes qui se
 * replient une colonne trop tard, ce qui ne se voit qu'au comptoir. D'où
 * `regleDeCalibration()`, à imprimer et à photographier avant de toucher à ces
 * deux nombres.
 *
 * DÉSACCENTUAGE ASSUMÉ. Le chemin web rend un PDF et écrit « Reçu » ; le NYX
 * reçoit des octets et sa page de code rend « Re?u ». Les libellés s'écrivent
 * donc en français correct dans `core`, et passent tous par `deaccent` ici.
 */
import {
  compact,
  deaccent,
  FONTS,
  type Block,
  type FontRole,
  type ItemRow,
} from "@vente-facile/core/receipt";

/** Corps compact, mesuré sur papier : 42 colonnes sur 58 mm. */
export const SIZE_BODY = 18;

/**
 * Nom de l'établissement et bandeau du document.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE TAILLE, PAS UNE ÉCHELLE - ET C'EST MESURÉ, PAS CHOISI.              │
 * │                                                                          │
 * │ L'ancienne application, qui imprimait juste sur ce matériel, agrandissait │
 * │ le titre par `textSize = 22`. Le doublement d'échelle (`textScaleX/Y`)    │
 * │ étire les caractères EN LARGEUR ET EN HAUTEUR : une ligne de 42 colonnes  │
 * │ n'en tient plus que 21, et l'interligne double avec elle. Le papier ne    │
 * │ ressemblait plus au document.                                            │
 * │                                                                          │
 * │ L'échelle reste dans le modèle pour l'ESC/POS, où l'encodeur sait mesurer │
 * │ la double chasse ; c'est le pilote de l'imprimante intégrée qui la        │
 * │ traduit en taille, parce que son service compose lui-même.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const SIZE_TITLE = 22;

/**
 * Largeur en colonnes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ 57 N'EXISTAIT SUR AUCUNE IMPRIMANTE, ET FAISAIT LEVER L'ENCODEUR.       │
 * │                                                                          │
 * │ La valeur venait du rapport des largeurs de PAPIER (42 × 80/58 ≈ 57,9).  │
 * │ Or une colonne n'est pas un millimètre : c'est un nombre de POINTS DE     │
 * │ CHAUFFE divisé par la chasse de la police. Le rapport juste est celui des │
 * │ têtes, 576 / 384 = 1,5, pas 1,379.                                       │
 * │                                                                          │
 * │ Conséquence mesurée : `@point-of-sale/receipt-printer-encoder` valide    │
 * │ `columns` contre une liste fermée [32, 35, 42, 44, 48] et LÈVE sur 57.   │
 * │ Un marchand qui basculait le réglage sur 80 mm avec une imprimante       │
 * │ Bluetooth ou BLE ne sortait PLUS AUCUN TICKET, et lisait à chaque vente  │
 * │ le message anglais de la bibliothèque, faute de frappe comprise.         │
 * │                                                                          │
 * │ Les deux valeurs retenues correspondent à une police réelle sur une tête │
 * │ à 203 points par pouce, et LA POLICE EST LA PREMIÈRE.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ 58 mm EST PASSÉ DE 42 À 32 COLONNES, PARCE QUE 42 ÉTAIT ILLISIBLE.      │
 * │                                                                          │
 * │ 42 colonnes sur 384 points imposent la police B, dont la chasse fait     │
 * │ 9 points sur 17 de haut, soit à peine plus d'un millimètre. C'était      │
 * │ tenable tant que ce chemin ne servait qu'au repli TEXTE de l'imprimante  │
 * │ intégrée, laquelle imprime en réalité une IMAGE (`render-html.ts`, qui   │
 * │ calcule ses propres colonnes et n'a jamais lu celles-ci).                 │
 * │                                                                          │
 * │ Le premier ticket ESC/POS réellement sorti sur du matériel - une         │
 * │ T58_9345 en Bluetooth, le 13 septembre 2026 - l'a tranché : le marchand  │
 * │ ne pouvait pas lire son propre ticket. Un ticket illisible ne vaut pas   │
 * │ mieux qu'un ticket qui ne sort pas. Vérifié à la règle de calibration :  │
 * │ à 32 colonnes, le dernier « # » touche le bord.                          │
 * │                                                                          │
 * │ La police A (12 points de chasse) donne 384 / 12 = 32 colonnes sur       │
 * │ 58 mm, et 576 / 12 = 48 sur 80 mm. C'est la mise en page de la quasi-    │
 * │ totalité des reçus de 58 mm du marché.                                   │
 * │                                                                          │
 * │ ⚠ CONTREPARTIE ASSUMÉE : dix colonnes de moins par ligne. Les libellés   │
 * │ se replient ou s'abrègent davantage, et c'est `paire()` qui absorbe -    │
 * │ le LIBELLÉ cède, jamais le montant.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ 80 mm n'a JAMAIS été confirmé à la photo. Il reste déduit.
 */

/**
 * Colonnes et police vont ENSEMBLE, dans une seule table.
 *
 * Les déclarer séparément, c'est permettre qu'elles divergent : une mise en
 * page de 42 colonnes envoyée à une police qui n'en compte que 32 replie
 * chaque ligne pleine, et le matériel ne dit rien.
 */
const MISE_EN_PAGE: Record<58 | 80, { colonnes: number; police: "A" | "B" }> = {
  58: { colonnes: 32, police: "A" },
  80: { colonnes: 48, police: "A" },
};

export function colonnesPour(paperWidth: 58 | 80): number {
  return MISE_EN_PAGE[paperWidth].colonnes;
}

/**
 * La police que le matériel doit adopter pour que ses colonnes soient les
 * nôtres. Voir l'encadré de `colonnesPour`.
 */
export function policePour(paperWidth: 58 | 80): "A" | "B" {
  return MISE_EN_PAGE[paperWidth].police;
}

export type Alignement = "left" | "center" | "right";

/** Une ligne prête pour le module natif. Miroir de `NativeReceiptLine`. */
export interface LigneImprimee {
  text: string;
  align?: Alignement;
  bold?: boolean;
  /** 2 double la largeur des caractères : la ligne ne tient plus que sur la moitié. */
  scale?: 1 | 2;
  size?: number;
}

export interface OptionsRendu {
  paperWidth?: 58 | 80;
}

/**
 * Les rôles typographiques de `core` sont exprimés en points, pour un PDF. Une
 * imprimante thermique n'a pas de corps continu : elle a une taille de police
 * et un facteur d'échelle entier. On ne conserve donc du rôle que ce qu'elle
 * sait rendre, la GRAISSE et le DOUBLEMENT, et on laisse tomber la nuance de
 * corps, qui produirait des lignes de largeurs disparates sans hiérarchie
 * lisible.
 */
function styleDe(role: FontRole): { bold: boolean; scale: 1 | 2 } {
  return { bold: FONTS[role].bold, scale: role === "orgName" || role === "total" ? 2 : 1 };
}

/** Replie un texte sur `largeur` colonnes, sans jamais couper un mot en deux. */
export function replier(texte: string, largeur: number): string[] {
  const mots = texte.split(/\s+/).filter(Boolean);
  if (mots.length === 0) return [""];

  const lignes: string[] = [];
  let courante = "";

  for (const mot of mots) {
    if (courante === "") {
      courante = mot;
    } else if (courante.length + 1 + mot.length <= largeur) {
      courante = `${courante} ${mot}`;
    } else {
      lignes.push(courante);
      courante = mot;
    }
    // Un mot plus long que la ligne (une référence, une adresse sans espace)
    // se coupe : le laisser déborder ferait tronquer l'imprimante, en silence.
    while (courante.length > largeur) {
      lignes.push(courante.slice(0, largeur));
      courante = courante.slice(largeur);
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

/**
 * Un libellé à gauche, une valeur à droite, SANS JAMAIS SE RECOUVRIR.
 *
 * Le défaut que ce repli corrige a coûté cher au ticket web : le libellé et le
 * montant étaient écrits à leurs deux bords sans qu'on mesure jamais la somme
 * de leurs largeurs. Sur 42 colonnes, « Montant payé » et « 12 500 000.00 CDF »
 * se recouvraient. Le CDF étant la devise par défaut, tout règlement au-delà
 * d'environ 450 $ sortait illisible.
 *
 * Trois temps, du plus lisible au plus dégradé :
 *   1. les deux tiennent, on les écarte aux bords ;
 *   2. le libellé se raccourcit tant qu'il reste lisible ;
 *   3. la valeur passe seule à la ligne, alignée à droite.
 */
export function paire(
  libelle: string,
  valeur: string,
  largeur: number,
  ecartMinimal = 1
): string[] {
  const l = libelle.trim();
  const v = valeur.trim();

  if (l.length + ecartMinimal + v.length <= largeur) {
    return [l + " ".repeat(largeur - l.length - v.length) + v];
  }

  // Le libellé cède avant la valeur : un montant tronqué est un faux montant,
  // alors qu'un libellé abrégé reste compréhensible dans son contexte.
  const place = largeur - ecartMinimal - v.length;
  if (place >= 6) {
    const court = `${l.slice(0, place - 1).trimEnd()}.`;
    return [court + " ".repeat(largeur - court.length - v.length) + v];
  }

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ UNE VALEUR TROP LONGUE SE REPLIE, ELLE NE SE TRANCHE PAS.             │
  // │                                                                        │
  // │ `v.padStart(largeur).slice(-largeur)` gardait la FIN : « 1 234 567 »   │
  // │ amputé en tête sort « 234 567 », un montant plausible et faux, dix     │
  // │ fois trop petit, sur le papier que le client emporte. La docstring     │
  // │ ci-dessus dit pourtant « un montant tronqué est un faux montant ».     │
  // │ Replié, il reste juste : c'est laid, et c'est vrai.                    │
  // └────────────────────────────────────────────────────────────────────────┘
  return [
    ...replier(l, largeur),
    ...replier(v, largeur).map((t) => t.padStart(largeur)),
  ];
}

/**
 * Un article sur DEUX lignes.
 *
 * Quatre colonnes ne tiennent pas sur 42 : le nom n'en recevait que 18, ce qui
 * coupait « AACEFEMINE 30CE 2MG » avant sa dose. Le nom prend donc la pleine
 * largeur, puis « 2 × 92 000 » à gauche et le total à droite. La ventilation en
 * contenants, quand elle existe, passe en retrait : c'est ce que le client
 * emporte, et l'ancien ticket mobile ne l'imprimait pas du tout.
 */
function ligneArticle(item: ItemRow, largeur: number): LigneImprimee[] {
  const lignes: LigneImprimee[] = replier(deaccent(item.name), largeur).map((text) => ({
    text,
    size: SIZE_BODY,
  }));

  const detail = `${item.quantity} x ${item.unitPrice}`;
  for (const text of paire(deaccent(detail), deaccent(item.total), largeur)) {
    lignes.push({ text, size: SIZE_BODY });
  }
  if (item.quantityLabel) {
    for (const text of replier(deaccent(item.quantityLabel), largeur - 2)) {
      lignes.push({ text: `  ${text}`, size: SIZE_BODY });
    }
  }
  if (item.discountPercentage) {
    lignes.push({ text: `  Remise: -${item.discountPercentage}%`, size: SIZE_BODY });
  }
  return lignes;
}

/**
 * Le bandeau d'identification, à défaut de vidéo inversée.
 *
 * L'API du NYX ne sait pas inverser le texte. Ce n'est pas un oubli, c'est une
 * limite du matériel, et le repli doit remplir la même fonction : se repérer
 * dans une liasse SANS AVOIR À LIRE. Filet plein, libellé en capitales à double
 * échelle, filet plein. La masse d'encre y tient lieu d'inversion.
 */
function bandeau(texte: string, sous: string | undefined, largeur: number): LigneImprimee[] {
  const lignes: LigneImprimee[] = [{ text: "_".repeat(largeur), size: SIZE_BODY }];
  for (const text of replier(deaccent(texte).toUpperCase(), Math.floor(largeur / 2))) {
    lignes.push({ text, align: "center", bold: true, scale: 2, size: SIZE_BODY });
  }
  if (sous) {
    for (const text of replier(deaccent(sous), largeur)) {
      lignes.push({ text, align: "center", size: SIZE_BODY });
    }
  }
  lignes.push({ text: "_".repeat(largeur), size: SIZE_BODY });
  return lignes;
}

const BLANCS: Record<string, number> = { xs: 0, sm: 1, md: 1, lg: 2 };

/** Transforme la description d'un document en lignes imprimables. */
export function rendreTexte(blocks: Block[], options: OptionsRendu = {}): LigneImprimee[] {
  const largeur = colonnesPour(options.paperWidth ?? 58);
  const out: LigneImprimee[] = [];
  const pousser = (text: string, extra: Partial<LigneImprimee> = {}) =>
    out.push({ text, size: SIZE_BODY, ...extra });

  for (const block of blocks) {
    switch (block.kind) {
      case "logo":
        // Non imprimé en v1 : `printBitmap` exige un raster 1 bit qu'il faudrait
        // produire en JS. Limite connue, pas un oubli. L'en-tête porte déjà le
        // nom de l'établissement en double échelle.
        break;

      case "text": {
        const { bold, scale } = styleDe(block.role);
        const utile = scale === 2 ? Math.floor(largeur / 2) : largeur;
        for (const text of replier(deaccent(block.text), utile - (block.indent ? 2 : 0))) {
          pousser(block.indent ? `  ${text}` : text, {
            align: block.align === "center" ? "center" : "left",
            bold,
            scale,
          });
        }
        break;
      }

      case "band":
        out.push(...bandeau(block.text, block.sub, largeur));
        break;

      case "chip":
        // Replié comme tout le reste : les deux pastilles d'aujourd'hui
        // (DUPLICATA, DETTE SOLDEE) tiennent, mais la troisième déborderait en
        // silence. Les deux espaces d'encadrement sont comptés dans la largeur.
        for (const text of replier(deaccent(block.text).toUpperCase(), largeur - 2)) {
          pousser(` ${text} `, { align: "center", bold: true });
        }
        break;

      case "kv":
        for (const row of block.rows) {
          if (block.mode === "justified") {
            for (const text of paire(deaccent(row.label), deaccent(row.value), largeur)) {
              pousser(text, { bold: row.strong });
            }
          } else {
            // Mode collé : justifier à droite laisserait 28 colonnes de vide
            // entre « Client: » et le nom. Le repli passe en retrait.
            const entier = `${deaccent(row.label)}: ${deaccent(row.value)}`;
            replier(entier, largeur).forEach((text, i) =>
              pousser(i === 0 ? text : `  ${text}`, { bold: row.strong })
            );
          }
        }
        break;

      case "items":
        for (const item of block.rows) out.push(...ligneArticle(item, largeur));
        break;

      case "amounts":
        for (const row of block.rows) {
          for (const text of paire(deaccent(row.label), deaccent(row.value), largeur)) {
            pousser(text, { bold: row.strong });
          }
        }
        break;

      case "total": {
        pousser(deaccent(block.label));
        for (const text of replier(deaccent(block.value), Math.floor(largeur / 2))) {
          pousser(text, { align: "right", bold: true, scale: 2 });
        }
        break;
      }

      case "rule":
        // Une rangée de « _ » plutôt que des « = » ou des « - » : c'est le seul
        // caractère qui rend un trait CONTINU sur cette imprimante.
        pousser("_".repeat(largeur));
        break;

      case "space": {
        for (let i = 0; i < BLANCS[block.size]; i += 1) pousser("");
        break;
      }
    }
  }

  return out;
}

/**
 * Règle de calibration : à imprimer, à photographier, à compter.
 *
 * Elle porte une graduation par dizaine et une ligne pleine à la largeur
 * supposée. Si le dernier « # » touche le bord, la largeur est bonne ; si la
 * ligne se replie, elle est trop grande. C'est la seule façon honnête de fixer
 * ces nombres : les déduire d'un calcul de points par millimètre donne un
 * résultat qui a l'air juste et ne l'est pas.
 *
 * Elle est décrite en BLOCS, comme les vrais documents, et non en lignes déjà
 * mises en page. C'est ce qui la fait passer par le chemin de production :
 * une règle qui emprunterait une voie de traverse mesurerait autre chose que
 * ce qui s'imprime.
 */
export function regleDeCalibration(paperWidth: 58 | 80 = 58, densite?: number): Block[] {
  const largeur = colonnesPour(paperWidth);
  const graduation = Array.from({ length: largeur }, (_, i) =>
    (i + 1) % 10 === 0 ? String(((i + 1) / 10) % 10) : "."
  ).join("");
  const bande = paperWidth === 80 ? 72 : 48;

  return [
    // Le bandeau est en vidéo inversée sur toute la largeur utile : ses deux
    // bords SONT les bords de l'encre. C'est la seule chose de ce document qui
    // se mesure à la règle, et c'est pour elle qu'on l'imprime.
    { kind: "band", text: `CALIBRATION ${paperWidth} mm` },
    // UN SEUL bloc par phrase : couper à la main produit un repli en escalier,
    // le renderer sachant mieux que nous où la ligne s'arrête.
    {
      kind: "text",
      text: "Mesurez la bande noire ci-dessus, puis la largeur du papier.",
      role: "body",
    },
    { kind: "space", size: "sm" },
    {
      kind: "kv",
      mode: "justified",
      rows: compact([
        { label: "Bande attendue", value: `${bande} mm`, strong: true },
        { label: "Papier attendu", value: `${paperWidth} mm` },
        // ┌────────────────────────────────────────────────────────────────┐
        // │ LA DENSITÉ EST LE SEUL NOMBRE QU'UNE PHOTO NE PORTE PAS.      │
        // │                                                                │
        // │ Elle se règle par approximations : le marchand essaie 100, 110 │
        // │ puis 120, papier en main. Sans elle sur le ticket, il a trois  │
        // │ papiers sur son comptoir une heure après et ne sait plus lequel │
        // │ vient de quel essai - donc il recommence.                      │
        // └────────────────────────────────────────────────────────────────┘
        densite !== undefined && { label: "Densite", value: String(densite) },
      ]),
    },
    { kind: "space", size: "sm" },
    // Les trois rôles NON GRAS du document sont représentés ci-dessous - corps,
    // libellé, mention légale. C'est ce qu'il faut juger : le gras sort
    // toujours, le reste est ce qui s'efface quand la densité est trop basse ou
    // la police trop fine.
    {
      kind: "text",
      text: "Les trois tailles ci-dessous doivent se lire sans effort. Si la plus petite s'efface, montez la densite.",
      role: "body",
    },
    // Un rouleau de 58 laisse 5 mm blancs de chaque bord, un de 80 en laisse 4 :
    // c'est mécanique, la tête ne chauffe pas jusqu'au bord. Le dire évite de
    // chercher un réglage qui n'existe pas.
    {
      kind: "text",
      text: "Environ 5 mm de blanc de chaque bord sont mecaniques : la tete ne chauffe pas jusqu'au bord du papier.",
      role: "legal",
    },
    { kind: "space", size: "sm" },
    {
      kind: "text",
      text: "Si la bande est bien plus etroite que prevu, le reglage ne correspond pas a cette imprimante : essayez l'autre largeur.",
      role: "legal",
    },
    { kind: "rule", weight: "heavy" },
    // ⚠ LA GRADUATION NE VAUT QUE POUR LE MODE DE SECOURS « texte simple ».
    // Partout ailleurs - imprimante intégrée comme Bluetooth - le ticket part
    // en IMAGE, et cette ligne s'y replie sans rien mesurer. C'est le BANDEAU
    // de tête qui se mesure alors, et ses deux bords sont les bords de l'encre.
    {
      kind: "text",
      text: `texte : taille ${SIZE_BODY}, ${largeur} colonnes`,
      role: "label",
    },
    { kind: "text", text: graduation, role: "body" },
    // La ligne pleine est l'équivalent du bandeau pour le mode de secours : son
    // dernier caractère doit toucher le bord de l'encre. En image elle se
    // replie, et c'est le bandeau qui sert - les deux se lisent sur la même
    // photo, et une seule des deux est pertinente à la fois.
    { kind: "text", text: "#".repeat(largeur), role: "body" },
    { kind: "space", size: "lg" },
  ];
}
