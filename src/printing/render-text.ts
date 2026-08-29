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
  deaccent,
  FONTS,
  type Block,
  type FontRole,
  type ItemRow,
} from "@vente-facile/core/receipt";

/** Corps compact, mesuré sur papier : 42 colonnes sur 58 mm. */
export const SIZE_BODY = 18;

/**
 * Largeur en colonnes.
 *
 * 58 mm est MESURÉ. 80 mm est déduit du rapport des largeurs et **reste à
 * confirmer à la photo** : aucun rouleau de 80 mm n'a été passé sous
 * l'imprimante. Le rapport donne 57,9, arrondi à l'inférieur, parce qu'une
 * colonne de trop coupe chaque ligne pleine, alors qu'une de moins ne fait
 * qu'élargir la marge droite.
 */
export function colonnesPour(paperWidth: 58 | 80): number {
  return paperWidth === 80 ? 57 : 42;
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

  return [l.slice(0, largeur), v.padStart(largeur).slice(-largeur)];
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
        pousser(` ${deaccent(block.text).toUpperCase()} `, {
          align: "center",
          bold: true,
        });
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
export function regleDeCalibration(paperWidth: 58 | 80 = 58): Block[] {
  const largeur = colonnesPour(paperWidth);
  const graduation = Array.from({ length: largeur }, (_, i) =>
    (i + 1) % 10 === 0 ? String(((i + 1) / 10) % 10) : "."
  ).join("");

  return [
    { kind: "text", text: `CALIBRATION ${paperWidth} mm`, role: "band", align: "center" },
    {
      kind: "text",
      text: `taille ${SIZE_BODY}, ${largeur} colonnes`,
      role: "label",
      align: "center",
    },
    { kind: "space", size: "sm" },
    { kind: "text", text: graduation, role: "body" },
    { kind: "text", text: "#".repeat(largeur), role: "body" },
    { kind: "space", size: "sm" },
    { kind: "text", text: "Le dernier # doit toucher le bord.", role: "body" },
    { kind: "space", size: "lg" },
  ];
}
