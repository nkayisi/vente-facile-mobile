#!/usr/bin/env node
/**
 * Les assets de marque sont ENGENDRÉS depuis `logo.png`, jamais retouchés.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI A ÉTÉ TROUVÉ, ET POURQUOI CE SCRIPT EXISTE.                       │
 * │                                                                          │
 * │ `icon.png`, les trois calques Android et `splash-icon.png` étaient les   │
 * │ assets du GABARIT Expo : un chevron bleu générique, et un dessin BLANC   │
 * │ posé sur un fond blanc - donc un splash invisible en thème clair, à      │
 * │ chaque lancement. Personne ne pouvait le voir en relisant le code : un   │
 * │ PNG ne lève pas, et le thème sombre, lui, le rendait.                    │
 * │                                                                          │
 * │ Les régénérer à la main dans un éditeur d'images rouvrirait le même      │
 * │ risque : sept fichiers à retailler d'un coup, dont trois portent des     │
 * │ zones sûres que l'œil ne voit pas. Ici, la source est `logo.png` et tout │
 * │ le reste en DÉRIVE, avec ses motifs écrits.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ AUCUNE RECOLORATION. Le script recadre, met à l'échelle et pose un fond.
 * Il ne touche à aucune couleur de la marque, sauf pour le calque MONOCHROME
 * d'Android, qui est par définition une silhouette tirée du canal alpha.
 *
 * Node pur, aucune dépendance : `zlib` suffit à décoder et à réencoder un PNG.
 * Même forme que `generate-schema.mjs` et `generer-registre-icones.mjs`.
 *
 *   node scripts/derive-brand-assets.mjs
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const IMAGES = resolve(ICI, "../assets/images");
const SOURCE = join(IMAGES, "logo.png");

/**
 * Le mot-symbole se retire par un MASQUE EN PALIERS, jamais par une coupe.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE ICÔNE PORTE LA MARQUE SEULE, JAMAIS LE MOT-SYMBOLE.                 │
 * │                                                                          │
 * │ Une icône d'application fait une soixantaine de points sur l'écran       │
 * │ d'accueil. « Vente Facile » y est illisible et « Cdir info » plus        │
 * │ encore : le mot-symbole s'y réduit à une barre de gris qui salit la      │
 * │ moitié basse. Le splash, lui, l'affiche à deux cents points, où il se    │
 * │ lit : il garde donc le logo ENTIER.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ UNE COUPE HORIZONTALE NE PEUT PAS LES SÉPARER. « Vente » (y 348..371) et
 * le bas du téléphone (y 356..372) se CHEVAUCHENT verticalement. Une coupe à
 * y=352 laissait le haut du « V » dépasser ET tranchait le téléphone en plein
 * corps : c'est l'icône qu'a produite la première version, et cela se voit.
 *
 * Ils sont en revanche séparés HORIZONTALEMENT, le mot à gauche et le
 * téléphone à droite. D'où ces paliers, MESURÉS sur `logo.png` ligne par
 * ligne (bleu du mot contre orange du tourbillon) :
 *
 *   ligne      « Vente » finit à   le tourbillon reprend à   palier
 *   y 346..348  x 186               x 222                    200
 *   y 349..353  x 227               x 235                    231
 *   y 354..372  x 244               x 261                    250
 *   y ≥ 373     plus rien de la marque : tout est mot-symbole ou trait bleu
 *
 * ⚠ LE PALIER DE y 349..353 EST SERRÉ À HUIT PIXELS, et c'est la ligne à
 * revérifier en premier si `logo.png` change un jour : le tourbillon y
 * descend jusqu'à x 235 pendant que le mot monte à x 227. Un palier trop
 * large entame la pointe basse du tourbillon, un palier trop étroit laisse un
 * fragment bleu flotter en bas de l'icône. Les deux se voient, et la première
 * version de ce fichier a produit le second.
 */
const PALIERS_MOT_SYMBOLE = [
  { y: 346, jusquaX: 200 },
  { y: 349, jusquaX: 231 },
  { y: 354, jusquaX: 250 },
];
const BAS_DE_LA_MARQUE = 372;

/** Le jeton `accent` du thème clair, déjà le fond de l'icône adaptative. */
const FOND = [255, 247, 237];

// ---------------------------------------------------------------------------
// PNG : décodage
// ---------------------------------------------------------------------------

/** Rend `{ largeur, hauteur, pixels }`, les pixels en RVBA sur huit bits. */
function lirePng(chemin) {
  const d = readFileSync(chemin);
  if (d.readUInt32BE(0) !== 0x89504e47) throw new Error(`${chemin} n'est pas un PNG.`);

  let i = 8;
  let largeur = 0;
  let hauteur = 0;
  let profondeur = 0;
  let type = 0;
  const morceaux = [];
  let palette = null;
  let paletteAlpha = null;

  while (i < d.length) {
    const taille = d.readUInt32BE(i);
    const nom = d.toString("ascii", i + 4, i + 8);
    const corps = d.subarray(i + 8, i + 8 + taille);
    if (nom === "IHDR") {
      largeur = corps.readUInt32BE(0);
      hauteur = corps.readUInt32BE(4);
      profondeur = corps[8];
      type = corps[9];
      if (corps[12] !== 0) throw new Error("PNG entrelacé : non pris en charge.");
    } else if (nom === "PLTE") palette = Buffer.from(corps);
    else if (nom === "tRNS") paletteAlpha = Buffer.from(corps);
    else if (nom === "IDAT") morceaux.push(corps);
    else if (nom === "IEND") break;
    i += 12 + taille;
  }

  if (profondeur !== 8) throw new Error(`Profondeur ${profondeur} : non prise en charge.`);
  const canaux = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!canaux) throw new Error(`Type de couleur ${type} : non pris en charge.`);

  const brut = inflateSync(Buffer.concat(morceaux));
  const pas = largeur * canaux;
  const lignes = Buffer.alloc(hauteur * pas);
  let p = 0;
  let precedente = Buffer.alloc(pas);

  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[p++];
    const ligne = Buffer.from(brut.subarray(p, p + pas));
    p += pas;
    for (let x = 0; x < pas; x++) {
      const a = x >= canaux ? ligne[x - canaux] : 0;
      const b = precedente[x];
      const c = x >= canaux ? precedente[x - canaux] : 0;
      if (filtre === 1) ligne[x] = (ligne[x] + a) & 255;
      else if (filtre === 2) ligne[x] = (ligne[x] + b) & 255;
      else if (filtre === 3) ligne[x] = (ligne[x] + ((a + b) >> 1)) & 255;
      else if (filtre === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        ligne[x] = (ligne[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    ligne.copy(lignes, y * pas);
    precedente = ligne;
  }

  // Tout devient du RVBA : les fonctions d'après n'ont alors qu'un seul cas.
  const pixels = new Uint8Array(largeur * hauteur * 4);
  for (let n = 0; n < largeur * hauteur; n++) {
    const s = n * canaux;
    const o = n * 4;
    if (type === 6) {
      pixels.set(lignes.subarray(s, s + 4), o);
    } else if (type === 2) {
      pixels.set(lignes.subarray(s, s + 3), o);
      pixels[o + 3] = 255;
    } else if (type === 0) {
      pixels[o] = pixels[o + 1] = pixels[o + 2] = lignes[s];
      pixels[o + 3] = 255;
    } else if (type === 4) {
      pixels[o] = pixels[o + 1] = pixels[o + 2] = lignes[s];
      pixels[o + 3] = lignes[s + 1];
    } else {
      const idx = lignes[s];
      pixels[o] = palette[idx * 3];
      pixels[o + 1] = palette[idx * 3 + 1];
      pixels[o + 2] = palette[idx * 3 + 2];
      pixels[o + 3] = paletteAlpha && idx < paletteAlpha.length ? paletteAlpha[idx] : 255;
    }
  }

  return { largeur, hauteur, pixels };
}

// ---------------------------------------------------------------------------
// PNG : encodage
// ---------------------------------------------------------------------------

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function morceau(nom, corps) {
  const t = Buffer.concat([Buffer.from(nom, "ascii"), corps]);
  const out = Buffer.alloc(t.length + 8);
  out.writeUInt32BE(corps.length, 0);
  t.copy(out, 4);
  out.writeUInt32BE(crc32(t), t.length + 4);
  return out;
}

/**
 * `avecAlpha: false` écrit du RVB sans canal alpha.
 *
 * ⚠ OBLIGATOIRE POUR L'ICÔNE iOS. Xcode refuse une icône d'application qui
 * porte de la transparence, et le refus n'arrive qu'à la soumission - après le
 * build, donc bien trop tard pour que ce soit une boucle courte.
 */
function ecrirePng(chemin, img, { avecAlpha = true } = {}) {
  const canaux = avecAlpha ? 4 : 3;
  const pas = img.largeur * canaux;
  // Filtre Paeth sur chaque ligne : sur un logo à dégradés, il divise la
  // taille par trois par rapport au filtre nul, et coûte deux millisecondes.
  const brut = Buffer.alloc(img.hauteur * (pas + 1));
  let precedente = Buffer.alloc(pas);

  for (let y = 0; y < img.hauteur; y++) {
    const ligne = Buffer.alloc(pas);
    for (let x = 0; x < img.largeur; x++) {
      const s = (y * img.largeur + x) * 4;
      const o = x * canaux;
      ligne[o] = img.pixels[s];
      ligne[o + 1] = img.pixels[s + 1];
      ligne[o + 2] = img.pixels[s + 2];
      if (avecAlpha) ligne[o + 3] = img.pixels[s + 3];
    }
    const base = y * (pas + 1);
    brut[base] = 4;
    for (let x = 0; x < pas; x++) {
      const a = x >= canaux ? ligne[x - canaux] : 0;
      const b = precedente[x];
      const c = x >= canaux ? precedente[x - canaux] : 0;
      const pp = a + b - c;
      const pa = Math.abs(pp - a);
      const pb = Math.abs(pp - b);
      const pc = Math.abs(pp - c);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      brut[base + 1 + x] = (ligne[x] - pred) & 255;
    }
    precedente = ligne;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.largeur, 0);
  ihdr.writeUInt32BE(img.hauteur, 4);
  ihdr[8] = 8;
  ihdr[9] = avecAlpha ? 6 : 2;

  writeFileSync(
    chemin,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      morceau("IHDR", ihdr),
      morceau("IDAT", deflateSync(brut, { level: 9 })),
      morceau("IEND", Buffer.alloc(0)),
    ])
  );
}

// ---------------------------------------------------------------------------
// Opérations sur l'image
// ---------------------------------------------------------------------------

/** La boîte de l'encre : les bords transparents ne sont pas du dessin. */
function boiteDEncre({ largeur, hauteur, pixels }, seuil = 8) {
  let x0 = largeur;
  let y0 = hauteur;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      if (pixels[(y * largeur + x) * 4 + 3] > seuil) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error("Image entièrement transparente.");
  return { x0, y0, x1, y1 };
}

function recadrer(img, { x0, y0, x1, y1 }) {
  const largeur = x1 - x0 + 1;
  const hauteur = y1 - y0 + 1;
  const pixels = new Uint8Array(largeur * hauteur * 4);
  for (let y = 0; y < hauteur; y++) {
    const src = ((y + y0) * img.largeur + x0) * 4;
    pixels.set(img.pixels.subarray(src, src + largeur * 4), y * largeur * 4);
  }
  return { largeur, hauteur, pixels };
}

/** Catmull-Rom, sur les canaux PRÉMULTIPLIÉS. */
function noyau(t) {
  const a = Math.abs(t);
  if (a <= 1) return 1.5 * a ** 3 - 2.5 * a ** 2 + 1;
  if (a < 2) return -0.5 * a ** 3 + 2.5 * a ** 2 - 4 * a + 2;
  return 0;
}

/**
 * ⚠ ON INTERPOLE EN PRÉMULTIPLIÉ, ET C'EST OBLIGATOIRE.
 *
 * Sur le bord d'un trait, un pixel opaque orange voisine un pixel
 * TRANSPARENT dont les canaux de couleur valent souvent (0,0,0). Interpoler
 * les couleurs sans tenir compte de l'alpha mélange donc du noir invisible
 * dans l'orange, et le contour du logo se borde d'un liseré sombre. Le défaut
 * ne se voit qu'à l'agrandissement, sur l'écran d'accueil d'un marchand.
 */
function redimensionner(img, cibleL, cibleH) {
  // Pré-passe de boîte quand on réduit de plus de moitié : sans elle,
  // l'échantillonnage saute des pixels et le trait fin crénèle.
  let src = img;
  while (src.largeur >= cibleL * 2 && src.hauteur >= cibleH * 2) {
    src = boite(src, Math.max(1, src.largeur >> 1), Math.max(1, src.hauteur >> 1));
  }

  const pixels = new Uint8Array(cibleL * cibleH * 4);
  const rx = src.largeur / cibleL;
  const ry = src.hauteur / cibleH;

  for (let y = 0; y < cibleH; y++) {
    const sy = (y + 0.5) * ry - 0.5;
    const y0 = Math.floor(sy);
    for (let x = 0; x < cibleL; x++) {
      const sx = (x + 0.5) * rx - 0.5;
      const x0 = Math.floor(sx);
      let r = 0;
      let v = 0;
      let b = 0;
      let a = 0;
      let poids = 0;
      for (let j = -1; j <= 2; j++) {
        const yy = Math.min(src.hauteur - 1, Math.max(0, y0 + j));
        const wy = noyau(sy - (y0 + j));
        if (wy === 0) continue;
        for (let i = -1; i <= 2; i++) {
          const xx = Math.min(src.largeur - 1, Math.max(0, x0 + i));
          const w = wy * noyau(sx - (x0 + i));
          if (w === 0) continue;
          const o = (yy * src.largeur + xx) * 4;
          const al = src.pixels[o + 3] / 255;
          r += src.pixels[o] * al * w;
          v += src.pixels[o + 1] * al * w;
          b += src.pixels[o + 2] * al * w;
          a += src.pixels[o + 3] * w;
          poids += w;
        }
      }
      const o = (y * cibleL + x) * 4;
      const alpha = Math.min(255, Math.max(0, a / poids));
      const inv = alpha > 0 ? 255 / alpha : 0;
      pixels[o] = Math.min(255, Math.max(0, Math.round((r / poids) * inv)));
      pixels[o + 1] = Math.min(255, Math.max(0, Math.round((v / poids) * inv)));
      pixels[o + 2] = Math.min(255, Math.max(0, Math.round((b / poids) * inv)));
      pixels[o + 3] = Math.round(alpha);
    }
  }
  return { largeur: cibleL, hauteur: cibleH, pixels };
}

/** Moyenne de boîte, en prémultiplié elle aussi. */
function boite(img, cibleL, cibleH) {
  const pixels = new Uint8Array(cibleL * cibleH * 4);
  const rx = img.largeur / cibleL;
  const ry = img.hauteur / cibleH;
  for (let y = 0; y < cibleH; y++) {
    const ya = Math.floor(y * ry);
    const yb = Math.min(img.hauteur, Math.ceil((y + 1) * ry));
    for (let x = 0; x < cibleL; x++) {
      const xa = Math.floor(x * rx);
      const xb = Math.min(img.largeur, Math.ceil((x + 1) * rx));
      let r = 0;
      let v = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = ya; yy < yb; yy++) {
        for (let xx = xa; xx < xb; xx++) {
          const o = (yy * img.largeur + xx) * 4;
          const al = img.pixels[o + 3] / 255;
          r += img.pixels[o] * al;
          v += img.pixels[o + 1] * al;
          b += img.pixels[o + 2] * al;
          a += img.pixels[o + 3];
          n++;
        }
      }
      const o = (y * cibleL + x) * 4;
      const alpha = a / n;
      const inv = alpha > 0 ? 255 / alpha : 0;
      pixels[o] = Math.round((r / n) * inv);
      pixels[o + 1] = Math.round((v / n) * inv);
      pixels[o + 2] = Math.round((b / n) * inv);
      pixels[o + 3] = Math.round(alpha);
    }
  }
  return { largeur: cibleL, hauteur: cibleH, pixels };
}

/**
 * Pose l'encre au centre d'un carré, à la fraction demandée.
 *
 * `part` est la fraction du côté que la plus grande dimension de l'encre
 * occupe. C'est ce qui porte les ZONES SÛRES : 0,78 pour le masque squircle
 * d'iOS, 0,61 pour le masque de l'icône adaptative d'Android.
 */
function surCarre(encre, cote, part, fond) {
  const echelle = (cote * part) / Math.max(encre.largeur, encre.hauteur);
  const l = Math.max(1, Math.round(encre.largeur * echelle));
  const h = Math.max(1, Math.round(encre.hauteur * echelle));
  const mise = redimensionner(encre, l, h);

  const pixels = new Uint8Array(cote * cote * 4);
  if (fond) {
    for (let n = 0; n < cote * cote; n++) {
      pixels[n * 4] = fond[0];
      pixels[n * 4 + 1] = fond[1];
      pixels[n * 4 + 2] = fond[2];
      pixels[n * 4 + 3] = 255;
    }
  }

  const dx = Math.round((cote - l) / 2);
  const dy = Math.round((cote - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const s = (y * l + x) * 4;
      const o = ((y + dy) * cote + (x + dx)) * 4;
      const a = mise.pixels[s + 3] / 255;
      if (a === 0) continue;
      for (let c = 0; c < 3; c++) {
        pixels[o + c] = Math.round(mise.pixels[s + c] * a + pixels[o + c] * (1 - a));
      }
      pixels[o + 3] = Math.round(mise.pixels[s + 3] + pixels[o + 3] * (1 - a));
    }
  }
  return { largeur: cote, hauteur: cote, pixels };
}

/**
 * Efface le mot-symbole, par les paliers mesurés en tête de ce fichier.
 *
 * On ne repeint rien : on met l'alpha à zéro. Le dessin qui reste est
 * exactement celui du fichier source.
 */
function sansMotSymbole(img) {
  const pixels = new Uint8Array(img.pixels);
  for (let y = PALIERS_MOT_SYMBOLE[0].y; y < img.hauteur; y++) {
    // Le dernier palier déclaré au-dessus de cette ligne.
    let jusquaX = 0;
    for (const p of PALIERS_MOT_SYMBOLE) if (y >= p.y) jusquaX = p.jusquaX;
    // Sous la marque, tout part : il n'y a plus que du mot-symbole.
    const borne = y > BAS_DE_LA_MARQUE ? img.largeur : jusquaX;
    for (let x = 0; x <= borne && x < img.largeur; x++) {
      pixels[(y * img.largeur + x) * 4 + 3] = 0;
    }
  }
  return { largeur: img.largeur, hauteur: img.hauteur, pixels };
}

/** Un aplat opaque : le calque de fond d'une icône adaptative n'est que cela. */
function aplat(cote, [r, v, b]) {
  const pixels = new Uint8Array(cote * cote * 4);
  for (let n = 0; n < cote * cote; n++) {
    pixels[n * 4] = r;
    pixels[n * 4 + 1] = v;
    pixels[n * 4 + 2] = b;
    pixels[n * 4 + 3] = 255;
  }
  return { largeur: cote, hauteur: cote, pixels };
}

/** Silhouette : l'alpha devient la forme, la couleur devient uniforme. */
function silhouette(img, [r, v, b]) {
  const pixels = new Uint8Array(img.pixels.length);
  for (let n = 0; n < img.largeur * img.hauteur; n++) {
    pixels[n * 4] = r;
    pixels[n * 4 + 1] = v;
    pixels[n * 4 + 2] = b;
    pixels[n * 4 + 3] = img.pixels[n * 4 + 3];
  }
  return { largeur: img.largeur, hauteur: img.hauteur, pixels };
}

// ---------------------------------------------------------------------------

function main() {
  const source = lirePng(SOURCE);
  const boite = boiteDEncre(source);
  console.log(
    `Source : ${source.largeur}x${source.hauteur}, encre en ` +
      `x ${boite.x0}..${boite.x1}, y ${boite.y0}..${boite.y1}`
  );

  /** Le logo ENTIER, sans le rembourrage transparent : splash et écrans. */
  const complet = recadrer(source, boite);
  /** La marque seule, mot-symbole retiré : les icônes. */
  const marque = recadrer(sansMotSymbole(source), {
    ...boite,
    y1: Math.min(boite.y1, BAS_DE_LA_MARQUE),
  });

  console.log(
    `  logo entier : ${complet.largeur}x${complet.hauteur} | ` +
      `marque seule : ${marque.largeur}x${marque.hauteur}`
  );

  const sorties = [
    // Le splash et le composant `Logo`. Résolution NATIVE : agrandir ici
    // n'ajouterait aucun détail et tripleraient le poids du bundle.
    ["logo-trim.png", complet, { avecAlpha: true }],
    // iOS. 0,78 tient l'encre dans le masque squircle, et le fond est opaque.
    ["icon.png", surCarre(marque, 1024, 0.78, FOND), { avecAlpha: false }],
    // Android, calque d'avant-plan : 0,61 est la zone sûre de l'icône
    // adaptative (66dp utiles sur 108dp), le reste étant masqué et animé.
    ["android-icon-foreground.png", surCarre(marque, 512, 0.61, null), { avecAlpha: true }],
    // Android, calque de fond : un aplat, le masque s'en charge.
    ["android-icon-background.png", aplat(512, FOND), { avecAlpha: false }],
    // Android 13+, icône thématisée : une silhouette, teintée par le système.
    ["android-icon-monochrome.png", silhouette(surCarre(marque, 432, 0.61, null), [0, 0, 0]), { avecAlpha: true }],
    ["favicon.png", surCarre(marque, 48, 0.86, FOND), { avecAlpha: false }],
  ];

  for (const [nom, img, options] of sorties) {
    const chemin = join(IMAGES, nom);
    ecrirePng(chemin, img, options);
    const taille = readFileSync(chemin).length;
    console.log(`  ✓ ${nom.padEnd(30)} ${img.largeur}x${img.hauteur}  ${(taille / 1024).toFixed(1)} Ko`);
  }

  // Le gabarit Expo n'a plus aucun consommateur : le garder, c'est laisser un
  // asset mort que le prochain lecteur croira vivant. C'est exactement ce qui
  // a maintenu le chevron bleu en place pendant tout un développement.
  const mort = join(IMAGES, "splash-icon.png");
  if (existsSync(mort)) {
    unlinkSync(mort);
    console.log("  ✓ splash-icon.png supprimé (asset du gabarit, sans appelant)");
  }
}

main();
