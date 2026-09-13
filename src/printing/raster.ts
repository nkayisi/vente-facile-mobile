/**
 * La page du ticket, en points de chauffe.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL RASTÉRISEUR, DONC UN SEUL DOCUMENT, SUR TOUTE IMPRIMANTE.       │
 * │                                                                          │
 * │ `render-html.ts` EST la mise en page du ticket. Le PDF la rend telle      │
 * │ quelle, l'imprimante intégrée la rastérisait, et le Bluetooth, lui,       │
 * │ recevait du TEXTE de 32 colonnes : pas de bandeau en vidéo inversée, pas  │
 * │ de hiérarchie de police, accents retirés. Deux machines chez le même      │
 * │ marchand sortaient deux papiers différents pour la même vente, et c'est   │
 * │ le client qui les compare.                                                │
 * │                                                                          │
 * │ Ce module rend la page en POINTS, une fois, et les deux transports        │
 * │ s'en servent : `nyx-printer` en refait un bitmap pour son service AIDL,   │
 * │ `render-escpos.ts` en fait des commandes `GS v 0`.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le format n'est pas un choix esthétique : **1 bit par point, MSB d'abord,
 * 1 = noir, chaque rangée alignée sur l'octet** est exactement la charge utile
 * que `GS v 0` attend. Le Bluetooth n'a donc aucune conversion à faire, et un
 * ticket long pèse 48 Ko au lieu de 1,8 Mo en RGBA.
 */
import { Buffer } from "buffer";

import type { Block, PaperWidth } from "@vente-facile/core/receipt";

import { pageDuTicket } from "./render-html";

export interface RasterTicket {
  /** Largeur en points de chauffe. */
  largeur: number;
  hauteur: number;
  /** 1 bit par point, MSB d'abord, 1 = noir, rangées alignées sur l'octet. */
  points: Uint8Array;
}

interface ModuleRaster {
  rasteriser(
    html: string,
    widthPx: number,
    pageWidthMm: number
  ): Promise<{ width: number; height: number; data: string }>;
}

let module: ModuleRaster | null | undefined;

/**
 * `undefined` : jamais cherché. `null` : cherché, absent.
 *
 * Distinguer les deux évite de retenter un `require` à chaque impression sur un
 * appareil qui n'aura jamais ce module.
 */
function charger(): ModuleRaster | null {
  if (module !== undefined) return module;
  try {
     
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expo = require("expo") as {
      requireOptionalNativeModule<T>(name: string): T | null;
    };
    module = expo.requireOptionalNativeModule<ModuleRaster>("TicketRaster");
  } catch {
    module = null;
  }
  return module;
}

/**
 * Largeur CHAUFFÉE par la tête, en points, et non largeur du rouleau.
 *
 * À 203 points par pouce, une tête de 58 mm chauffe 384 points, soit 48 mm ; une
 * tête de 80 mm en chauffe 576, soit 72 mm. Les millimètres restants sont la
 * marge mécanique du chariot : rien ne peut y être imprimé, sur aucun modèle.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PAGE RESTE DESSINÉE POUR LE ROULEAU, ET C'EST UN CHOIX.              │
 * │                                                                          │
 * │ Une page de 58 mm est donc mise à l'échelle des 48 mm chauffés, soit 83 % │
 * │ : un corps de 9 points sort à 7,4. L'autre voie - dessiner la page à      │
 * │ 48 mm et la rendre au point près - donnerait la taille nominale mais      │
 * │ retirerait 5 mm de largeur utile au document, donc replierait des lignes  │
 * │ que le PDF du back-office ne replie pas. Le papier du comptoir et le PDF  │
 * │ que le même client reçoit par message cesseraient d'être le même          │
 * │ document, et c'est la seule chose que ce moteur existe pour garantir.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function pointsDuPapier(paperWidth: PaperWidth): number {
  return paperWidth === 80 ? 576 : 384;
}

/** Octets d'une rangée, la largeur n'étant pas forcément un multiple de huit. */
export function octetsParRangee(largeur: number): number {
  return Math.ceil(largeur / 8);
}

/** Le rastériseur est-il présent sur cet appareil ? */
export function rasteriseurDisponible(): boolean {
  return charger() !== null;
}

/**
 * Dessine le document et rend ses points.
 *
 * Rend `null` quand le module natif est absent : l'appelant se replie sur le
 * chemin texte, il n'échoue pas. Un ticket qui ne sort pas du tout est le seul
 * échec inacceptable.
 */
export async function rasterDuTicket(
  blocks: Block[],
  paperWidth: PaperWidth
): Promise<RasterTicket | null> {
  const natif = charger();
  if (!natif) return null;

  const page = pageDuTicket(blocks, paperWidth);
  const sortie = await natif.rasteriser(
    page.html,
    pointsDuPapier(paperWidth),
    paperWidth
  );

  return {
    largeur: sortie.width,
    hauteur: sortie.height,
    points: new Uint8Array(Buffer.from(sortie.data, "base64")),
  };
}
