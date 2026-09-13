/**
 * `Block[]` vers HTML, puis vers une page de la taille du papier.
 *
 * Ce moteur sert DEUX chemins, et c'est ce qui le rend central :
 *   - le repli PDF (`drivers/pdf.ts`), pour iOS et tout appareil sans
 *     imprimante, et pour envoyer un reçu par message ;
 *   - l'imprimante INTÉGRÉE (`drivers/nyx.ts`), dont le module natif rastérise
 *     cette même page et l'envoie en image. C'est le chemin du comptoir.
 *
 * La LECTURE reste celle du ticket thermique, colonne étroite et police à
 * chasse fixe comprises, pour qu'un client qui reçoit le PDF et un client qui
 * repart avec le papier tiennent visiblement le même document.
 *
 * Les accents sont CONSERVÉS ici : c'est un rendu vectoriel, pas une page de
 * code d'imprimante. `deaccent` ne s'applique qu'au chemin thermique.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA MISE EN PAGE VIENT DES JETONS PARTAGÉS, ELLE N'EST PLUS RÉÉCRITE ICI. │
 * │                                                                          │
 * │ Ce fichier portait ses propres constantes - 9 pt de corps, 1,35           │
 * │ d'interligne, 4 mm de blanc de tête - pendant que `core/receipt/tokens`   │
 * │ en déclarait d'autres pour le PDF du back-office. Deux mises en page pour │
 * │ un seul document, tenues en phase à la main : c'est exactement la double  │
 * │ implémentation que le modèle en blocs existe pour supprimer.              │
 * │                                                                          │
 * │ Tout vient donc de `tokensFor`, `FONTS` et `leading`. Conséquence         │
 * │ directe : la MESURE de hauteur ci-dessous et la FEUILLE DE STYLE lisent   │
 * │ les mêmes nombres, dans le même fichier, et ne peuvent plus diverger.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import {
  FONTS,
  leading,
  tokensFor,
  type Block,
  type FontRole,
  type ItemRow,
  type PaperWidth,
  type Tokens,
} from "@vente-facile/core/receipt";

const echapper = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* -------------------------------------------------------------------------- */
/* Unités                                                                      */
/* -------------------------------------------------------------------------- */

const MM_PAR_POUCE = 25.4;
/** Le point PostScript, unité de `expo-print` comme du PDF. */
const POINTS_PAR_POUCE = 72;

export const mmEnPoints = (mm: number): number => (mm * POINTS_PAR_POUCE) / MM_PAR_POUCE;
export const pointsEnMm = (pt: number): number => (pt * MM_PAR_POUCE) / POINTS_PAR_POUCE;

/**
 * Avance d'un caractère, en fraction de cadratin.
 *
 * Une chasse FIXE est ce qui rend la hauteur calculable sans moteur de rendu :
 * le nombre de colonnes d'une ligne ne dépend que du corps. C'est aussi ce qui
 * fait ressembler le PDF au thermique. Changer de famille pour une police
 * proportionnelle rendrait cette mesure fausse, en silence - voir `FAMILLE`,
 * dont les cinq entrées partagent cette avance à 0,4 % près.
 */
const CHASSE = 0.6;

/**
 * La famille du ticket, du plus lourd au repli garanti.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ COURIER NEW EST LE PIRE CHOIX POUR UN SUPPORT QUI SEUILLE.              │
 * │                                                                          │
 * │ Il a été dessiné pour la frappe au ruban : ses fûts sont les plus fins   │
 * │ de toutes les monospaces courantes. Or `drivers/nyx.ts` dessine une page │
 * │ de 58 mm et la rastérise sur les 48 mm que la tête chauffe, soit 83 % :  │
 * │ un corps de 9 pt sort à 7,4 pt, une mention légale de 7 pt à 5,8. À 203  │
 * │ points par pouce, un fût si fin vaut moins d'un point de chauffe : la    │
 * │ WebView le rend en gris d'anticrénelage, et `printBitmap(…, 0, …)` -     │
 * │ type 0, noir et blanc - l'écarte au seuillage. Le gras survit, le reste  │
 * │ s'efface. C'est exactement ce qui se lit au comptoir.                     │
 * │                                                                          │
 * │ Sur Android la famille n'existe même pas : la pile retombait sur         │
 * │ `monospace`, donc sur un rendu qu'on n'avait pas choisi.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ⚠ TOUTE LA PILE DOIT GARDER L'AVANCE DE 0,6 CADRATIN.                   │
 * │                                                                          │
 * │ `CHASSE` ci-dessus est l'hypothèse dont dépendent `colonnes()`, le       │
 * │ repli, les couples libellé / montant ET `hauteurDuDocument`. Y glisser   │
 * │ une proportionnelle rendrait la hauteur fausse EN SILENCE, et une page   │
 * │ sous-estimée ne tronque pas : elle PAGINE. Le client repart avec un      │
 * │ second morceau de ticket, sur lequel le total peut se trouver seul.      │
 * │                                                                          │
 * │ Les cinq familles retenues sont à 0,600 (Roboto Mono, Noto Sans Mono,    │
 * │ Droid Sans Mono derrière `monospace`) ou 0,602 (DejaVu Sans Mono,        │
 * │ Menlo), soit 0,4 % d'écart au plus. `monospace` ferme la pile parce      │
 * │ qu'il est le seul nom garanti sur les deux plateformes.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const FAMILLE =
  '"Roboto Mono","Noto Sans Mono","DejaVu Sans Mono",Menlo,monospace';

const largeurCaractere = (taillePt: number) =>
  (taillePt * CHASSE * MM_PAR_POUCE) / POINTS_PAR_POUCE;

const colonnes = (taillePt: number, largeurMm: number) =>
  Math.max(1, Math.floor(largeurMm / largeurCaractere(taillePt)));

/**
 * Nombre de lignes qu'un texte occupe, replié au mot.
 *
 * Le même repli gourmand que `render-text.ts::replier`, réduit au COMPTAGE :
 * la hauteur d'une page ne dépend que du nombre de lignes. Compter par
 * `longueur / colonnes` sous-estimerait dès qu'un mot ne tient pas en fin de
 * ligne, et une page sous-estimée coupe le ticket en deux pages.
 */
function nombreDeLignes(texte: string, taillePt: number, largeurMm: number): number {
  const largeur = colonnes(taillePt, largeurMm);
  const mots = texte.split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 1;

  let lignes = 1;
  let courante = 0;
  for (const mot of mots) {
    if (courante === 0) {
      courante = mot.length;
    } else if (courante + 1 + mot.length <= largeur) {
      courante += 1 + mot.length;
    } else {
      lignes += 1;
      courante = mot.length;
    }
    while (courante > largeur) {
      lignes += 1;
      courante -= largeur;
    }
  }
  return lignes;
}

/**
 * Lignes d'un couple libellé / montant posé sur une ligne justifiée.
 *
 * Le montant ne se replie jamais (`white-space: nowrap`) : c'est le libellé qui
 * cède, sur la largeur qui reste une fois le montant et l'écart minimal
 * retranchés. Même règle que `paire()` du chemin thermique et que `drawPair`
 * du PDF du back-office.
 */
function lignesDuCouple(
  libelle: string,
  valeur: string,
  taillePt: number,
  t: Tokens
): number {
  const largeurValeur = valeur.length * largeurCaractere(taillePt);
  const reste = t.contentWidth - largeurValeur - t.minGap;
  if (reste <= largeurCaractere(taillePt)) return 2;
  return nombreDeLignes(libelle, taillePt, reste);
}

/* -------------------------------------------------------------------------- */
/* Rendu                                                                       */
/* -------------------------------------------------------------------------- */

function article(item: ItemRow): string {
  return `<div class="art">
    <div class="nom">${echapper(item.name)}</div>
    <div class="row"><span>${echapper(item.quantity)} × ${echapper(item.unitPrice)}</span><span>${echapper(item.total)}</span></div>
    ${item.quantityLabel ? `<div class="sub">${echapper(item.quantityLabel)}</div>` : ""}
    ${item.discountPercentage ? `<div class="sub">Remise : -${item.discountPercentage} %</div>` : ""}
  </div>`;
}

function bloc(block: Block): string {
  switch (block.kind) {
    case "logo":
      return `<img class="logo" src="${block.dataUrl}" />`;
    case "text":
      return `<div class="t ${block.role}${block.align === "center" ? " c" : ""}${
        block.muted ? " muted" : ""
      }${block.italic ? " it" : ""}${block.indent ? " in" : ""}">${echapper(block.text)}</div>`;
    case "band":
      return `<div class="band">${echapper(block.text)}${
        block.sub ? `<div class="bandsub">${echapper(block.sub)}</div>` : ""
      }</div>`;
    case "chip":
      return `<div class="chipwrap"><span class="chip">${echapper(block.text)}</span></div>`;
    case "kv":
      return block.rows
        .map((r) =>
          block.mode === "justified"
            ? `<div class="row${r.strong ? " b" : ""}"><span>${echapper(r.label)}</span><span>${echapper(r.value)}</span></div>`
            : `<div class="t${r.strong ? " b" : ""}">${echapper(r.label)} : ${echapper(r.value)}</div>`
        )
        .join("");
    case "items":
      return block.rows.map(article).join("");
    case "amounts":
      return block.rows
        .map(
          (r) =>
            `<div class="row${r.strong ? " b" : ""}"><span>${echapper(r.label)}</span><span>${echapper(r.value)}</span></div>`
        )
        .join("");
    case "total":
      return `<div class="totlabel">${echapper(block.label)}</div><div class="tot">${echapper(block.value)}</div>`;
    case "rule":
      return `<hr class="${block.weight}" />`;
    case "space":
      return `<div class="sp ${block.size}"></div>`;
  }
}

/* -------------------------------------------------------------------------- */
/* Mesure                                                                      */
/* -------------------------------------------------------------------------- */

/** Blanc vertical d'un bandeau et d'une pastille, de part et d'autre du texte. */
const PAD_BANDEAU = 1;
const MARGE_BANDEAU = 1.5;
const PAD_PASTILLE = 0.5;
const MARGE_PASTILLE = 1;
const MARGE_ARTICLE = 1;
const MARGE_FILET = 1;
const MARGE_LOGO = 2;

/**
 * Blanc ajouté en pied de page.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON SE TROMPE VERS LE HAUT, JAMAIS VERS LE BAS.                          │
 * │                                                                          │
 * │ Une page trop courte ne tronque pas : elle PAGINE. Le client repart avec │
 * │ deux morceaux de ticket dont le second ne porte que trois lignes, et le  │
 * │ total peut se retrouver seul sur la seconde page. Une page trop longue   │
 * │ ne coûte qu'un peu de blanc avant la découpe, là où le rouleau en donne  │
 * │ déjà six millimètres.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const MARGE_SECURITE = 4;

/**
 * Blanc latéral du ticket, de chaque côté du contenu.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN TICKET N'EST PAS UNE PAGE : SA MARGE EST DÉJÀ MÉCANIQUE.             │
 * │                                                                          │
 * │ Sur un rouleau de 58 mm, la tête ne chauffe que 48 mm - 384 points à     │
 * │ 203 par pouce. Cinq millimètres de chaque bord sont BLANCS quoi qu'on    │
 * │ fasse : aucune feuille de style ne peut y imprimer. Une marge de         │
 * │ document s'ajouterait à ces cinq-là.                                     │
 * │                                                                          │
 * │ MESURÉ dans un navigateur, sur la page réellement produite : avec les    │
 * │ 2,5 mm du jeton partagé, l'encre allait de 2,5 à 55,5 mm d'une page de   │
 * │ 58, soit 43,9 mm sur le papier et 7,05 mm de blanc par côté. À 0,25 mm,  │
 * │ l'encre couvre 47,6 mm et le blanc tombe à 5,2 mm - le plancher          │
 * │ mécanique, à deux dixièmes près.                                         │
 * │                                                                          │
 * │ ⚠ IL N'Y A PLUS RIEN À PRENDRE, ET C'EST LA RÉPONSE À LA QUESTION QUI    │
 * │ REVIENDRA. Passée de 0,5 à 0,25 mm à la demande du comptoir, elle ne     │
 * │ rend que 1,6 point de chauffe par côté, soit 0,17 mm : le blanc que le   │
 * │ marchand voit sur son ticket est MÉCANIQUE aux neuf dixièmes, et aucune  │
 * │ feuille de style ne l'atteint. Élargir vraiment le contenu demanderait   │
 * │ de dessiner la page pour les 48 mm chauffés au lieu du rouleau - voir    │
 * │ `pointsDuPapier` dans `raster.ts`, où ce choix est tranché : le ticket   │
 * │ cesserait alors d'être le même document que le PDF reçu par le client.   │
 * │                                                                          │
 * │ Elle ne peut RIEN faire déborder : la page est mise à l'échelle exacte   │
 * │ de la bande chauffée, donc la réduire élargit le contenu sans déplacer   │
 * │ aucun bord. Le seul risque est esthétique, et c'est pourquoi elle n'est  │
 * │ pas nulle : à zéro, la première lettre toucherait le bord de l'encre.    │
 * │                                                                          │
 * │ ⚠ Elle est décidée ICI et non dans `@vente-facile/core` : le jeton       │
 * │ partagé décrit une PAGE, que le PDF du back-office produit vraiment,     │
 * │ tandis que ce moteur-ci dessine pour une BANDE D'ENCRE déjà en retrait   │
 * │ de cinq millimètres. Deux supports, deux blancs.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function margeLaterale(paperWidth: PaperWidth): number {
  return paperWidth >= 80 ? 0.4 : 0.25;
}

/**
 * Les jetons du ticket : ceux de `core`, au blanc latéral de ce support près.
 *
 * `contentWidth` en DÉRIVE, donc tout ce qui mesure une ligne - repli, couples
 * libellé/montant, hauteur de page - suit du même coup. C'est la seule chose à
 * ne pas oublier en touchant à la marge.
 */
function jetons(paperWidth: PaperWidth): Tokens {
  const base = tokensFor(paperWidth);
  const margin = margeLaterale(paperWidth);
  return { ...base, margin, contentWidth: paperWidth - margin * 2 };
}

function hauteurDuBloc(block: Block, t: Tokens): number {
  const corps = FONTS.body.size;

  switch (block.kind) {
    case "logo": {
      const h = Math.min(t.logoMaxHeight, t.contentWidth / Math.max(block.aspectRatio, 0.01));
      return h + MARGE_LOGO;
    }
    case "text": {
      const taille = FONTS[block.role].size;
      const largeur = t.contentWidth - (block.indent ? t.indent : 0);
      return nombreDeLignes(block.text, taille, largeur) * leading(taille);
    }
    case "band": {
      const lignes = nombreDeLignes(block.text, FONTS.band.size, t.contentWidth);
      const sub = block.sub
        ? nombreDeLignes(block.sub, FONTS.label.size, t.contentWidth) * leading(FONTS.label.size)
        : 0;
      return (
        lignes * leading(FONTS.band.size) + sub + PAD_BANDEAU * 2 + MARGE_BANDEAU * 2
      );
    }
    case "chip":
      return leading(FONTS.chip.size) + PAD_PASTILLE * 2 + MARGE_PASTILLE * 2;
    case "kv": {
      const taille = FONTS[block.role ?? "body"].size;
      return block.rows.reduce(
        (somme, r) =>
          somme +
          (block.mode === "justified"
            ? lignesDuCouple(r.label, r.value, taille, t)
            : nombreDeLignes(`${r.label} : ${r.value}`, taille, t.contentWidth)) *
            leading(taille),
        0
      );
    }
    case "amounts": {
      const taille = FONTS[block.role ?? "body"].size;
      return block.rows.reduce(
        (somme, r) => somme + lignesDuCouple(r.label, r.value, taille, t) * leading(taille),
        0
      );
    }
    case "items":
      return block.rows.reduce((somme, row) => {
        const nom = nombreDeLignes(row.name, corps, t.contentWidth) * leading(corps);
        const ligne = leading(corps);
        const secondaires =
          (row.quantityLabel ? leading(FONTS.label.size) : 0) +
          (row.discountPercentage ? leading(FONTS.label.size) : 0);
        return somme + nom + ligne + secondaires + MARGE_ARTICLE * 2;
      }, 0);
    case "total":
      return (
        leading(FONTS.label.size) +
        MARGE_ARTICLE +
        nombreDeLignes(block.value, FONTS.total.size, t.contentWidth) * leading(FONTS.total.size)
      );
    case "rule":
      return t.rule[block.weight] + MARGE_FILET * 2;
    case "space":
      return t.space[block.size];
  }
}

/**
 * Hauteur du document, en millimètres.
 *
 * Exportée pour être testable : c'est le seul nombre de ce fichier qu'aucune
 * relecture ne peut vérifier, et dont l'erreur ne se voit qu'au comptoir.
 */
export function hauteurDuDocument(blocks: Block[], paperWidth: PaperWidth = 58): number {
  const t = jetons(paperWidth);
  const contenu = blocks.reduce((somme, b) => somme + hauteurDuBloc(b, t), 0);
  return t.topPadding + contenu + t.bottomPadding + MARGE_SECURITE;
}

/* -------------------------------------------------------------------------- */
/* Feuille de style                                                            */
/* -------------------------------------------------------------------------- */

/** Une règle par rôle typographique, engendrée depuis `FONTS`. */
function reglesDesRoles(): string {
  return (Object.keys(FONTS) as FontRole[])
    .map((role) => {
      const f = FONTS[role];
      return `.${role}{font-size:${f.size}pt;line-height:${leading(f.size)}mm;font-weight:${
        f.bold ? "bold" : "normal"
      };}`;
    })
    .join("");
}

export function rendreHtml(blocks: Block[], paperWidth: PaperWidth = 58): string {
  const t = jetons(paperWidth);
  const corps = FONTS.body;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  /* ┌────────────────────────────────────────────────────────────────────┐
     │ « box-sizing: border-box » N'EST PAS UN RÉFLEXE, C'EST UN CORRECTIF. │
     │                                                                    │
     │ En content-box, une largeur de 58 mm plus 2,5 mm de blanc de chaque │
     │ côté donne une boîte de 63 mm : le bord droit du contenu tombe      │
     │ 2,5 mm HORS de la page. Sur un PDF, c'est une colonne de montants   │
     │ coupée ; sur le bitmap du thermique, la mise en page écarte          │
     │ simplement ce qui dépasse - donc le dernier chiffre des totaux.     │
     └────────────────────────────────────────────────────────────────────┘ */
  *{box-sizing:border-box;}
  @page{margin:0;size:${t.paperWidth}mm auto;}
  body{margin:0;width:${t.paperWidth}mm;
       padding:${t.topPadding}mm ${t.margin}mm ${t.bottomPadding}mm;
       font-family:${FAMILLE};
       font-size:${corps.size}pt;line-height:${leading(corps.size)}mm;
       color:#000;-webkit-text-size-adjust:none;}
  ${reglesDesRoles()}
  .t{word-wrap:break-word;overflow-wrap:break-word;}
  .c{text-align:center;}
  .b{font-weight:bold;}
  /* ┌────────────────────────────────────────────────────────────────────┐
     │ LE GRIS N'EXISTE PAS SUR DU PAPIER THERMIQUE.                      │
     │                                                                    │
     │ Une tête n'a qu'un état par point : un gris y est TRAMÉ, donc rendu │
     │ en points espacés, ou écarté par le seuillage. Appliqué au pied de  │
     │ ticket, en 7 pt donc 5,8 pt sur le papier, il donnait la ligne la   │
     │ moins visible du document.                                          │
     │                                                                    │
     │ Le drapeau « muted » RESTE dans le modèle partagé : c'est une      │
     │ intention légitime, et sur un support monochrome la discrétion se   │
     │ porte par la TAILLE - ces lignes sont déjà en 7 pt - jamais par une │
     │ couleur que l'imprimante ne sait pas rendre.                        │
     └────────────────────────────────────────────────────────────────────┘ */
  .muted{color:#000;}
  .it{font-style:italic;}
  .in{padding-left:${t.indent}mm;}
  .orgName{text-align:center;}
  .row{display:flex;justify-content:space-between;gap:${t.minGap}mm;
       line-height:${leading(corps.size)}mm;}
  .row span:last-child{white-space:nowrap;}
  .art{margin:${MARGE_ARTICLE}mm 0;}
  .sub{padding-left:${t.indent}mm;font-size:${FONTS.label.size}pt;
       line-height:${leading(FONTS.label.size)}mm;}
  /* La vidéo inversée, elle, EXISTE en PDF : le repli à filets du thermique
     est une limite du matériel, pas une intention de mise en page. */
  .band{background:#000;color:#fff;text-align:center;font-weight:bold;
        padding:${PAD_BANDEAU}mm 0;margin:${MARGE_BANDEAU}mm 0;
        font-size:${FONTS.band.size}pt;line-height:${leading(FONTS.band.size)}mm;
        letter-spacing:0.5px;}
  .bandsub{font-size:${FONTS.label.size}pt;line-height:${leading(FONTS.label.size)}mm;
           font-weight:normal;}
  .chipwrap{text-align:center;margin:${MARGE_PASTILLE}mm 0;}
  .chip{display:inline-block;max-width:100%;background:#000;color:#fff;
        padding:${PAD_PASTILLE}mm ${t.minGap}mm;
        font-size:${FONTS.chip.size}pt;line-height:${leading(FONTS.chip.size)}mm;
        font-weight:bold;}
  .totlabel{font-size:${FONTS.label.size}pt;line-height:${leading(FONTS.label.size)}mm;
            margin-top:${MARGE_ARTICLE}mm;}
  .tot{font-size:${FONTS.total.size}pt;line-height:${leading(FONTS.total.size)}mm;
       font-weight:bold;text-align:right;}
  hr{border:none;border-top:${t.rule.heavy}mm solid #000;margin:${MARGE_FILET}mm 0;}
  hr.light{border-top-width:${t.rule.light}mm;}
  hr.hair{border-top-width:${t.rule.hair}mm;}
  .sp.xs{height:${t.space.xs}mm;}
  .sp.sm{height:${t.space.sm}mm;}
  .sp.md{height:${t.space.md}mm;}
  .sp.lg{height:${t.space.lg}mm;}
  .logo{display:block;margin:0 auto ${MARGE_LOGO}mm;max-width:100%;
        max-height:${t.logoMaxHeight}mm;}
</style></head><body>${blocks.map(bloc).join("")}</body></html>`;
}

/**
 * La page complète : son HTML et ses dimensions, en points.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `@page { size: … }` N'EST PAS LU PAR `expo-print`.                      │
 * │                                                                          │
 * │ Établi dans sa source native : les dimensions viennent des options       │
 * │ `width` / `height`, et leur défaut est le format US LETTER, 612 × 792    │
 * │ points (Android `PrintPDFRenderTask.kt`, iOS `PrintOptions.swift`). Sans │
 * │ elles, le reçu d'un rouleau de 58 mm sortait sur une feuille de bureau,  │
 * │ le ticket tassé dans le coin supérieur gauche - et le marchand qui       │
 * │ envoie ce PDF à son client lui envoie une page A4 presque vide.          │
 * │                                                                          │
 * │ Le dépôt a déjà payé ce piège une fois, sur les rapports A4. On ne le    │
 * │ redécouvre pas : un seul point de sortie, qui ne peut pas les oublier.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface PageTicket {
  html: string;
  /** Entiers : `PrintOptions.width` est un `Int` côté Android. */
  largeurPt: number;
  hauteurPt: number;
}

export function pageDuTicket(blocks: Block[], paperWidth: PaperWidth = 58): PageTicket {
  return {
    html: rendreHtml(blocks, paperWidth),
    largeurPt: Math.round(mmEnPoints(paperWidth)),
    hauteurPt: Math.ceil(mmEnPoints(hauteurDuDocument(blocks, paperWidth))),
  };
}
