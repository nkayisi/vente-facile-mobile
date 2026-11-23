/**
 * Les octets ESC/POS d'un ticket, pour toute imprimante qui parle ce langage :
 * Bluetooth, câble USB, réseau.
 *
 * Un seul chemin pour les trois, et c'est ce qui les garde identiques : la
 * page rastérisée (celle du PDF et de l'imprimante intégrée), ou le texte en
 * secours. Ce corps vivait dans le pilote Bluetooth ; une copie pour le câble
 * aurait fait deux tickets le jour où l'une des deux changerait.
 */
import type { Block } from "@vente-facile/core/receipt";

import type { ContexteImpression } from "./driver";
import { rasterDuTicket } from "./raster";
import { rendreEscPos, rendreEscPosImage } from "./render-escpos";
import { rendreTexte } from "./render-text";

/**
 * Le ticket en octets : la page dessinée, ou le texte en secours.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUTE IMPRIMANTE ESC/POS IMPRIME LE MÊME DOCUMENT QUE LES AUTRES.        │
 * │                                                                          │
 * │ Elle recevait du TEXTE de 32 colonnes : pas de bandeau en vidéo          │
 * │ inversée, pas de hiérarchie de police, accents retirés, articles mis en  │
 * │ page autrement. Chez un marchand qui a les deux machines, la même vente  │
 * │ sortait sur deux papiers différents - et c'est le client qui les         │
 * │ compare, un ticket dans chaque main.                                      │
 * │                                                                          │
 * │ Elle reçoit désormais la page rastérisée, celle du PDF et de             │
 * │ l'imprimante intégrée. Le texte reste, et seulement pour deux cas :      │
 * │ le rastériseur absent (un appareil sans le module natif) et le mode de   │
 * │ secours que le marchand pose lui-même sur une machine trop ancienne.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function octetsDuTicket(
  blocks: Block[],
  contexte: ContexteImpression,
  cut: boolean,
  texteSimple?: boolean
): Promise<Uint8Array> {
  if (!texteSimple) {
    const raster = await rasterDuTicket(blocks, contexte.paperWidth);
    if (raster) {
      return rendreEscPosImage(raster, { paperWidth: contexte.paperWidth, cut });
    }
  }
  return rendreEscPos(rendreTexte(blocks, { paperWidth: contexte.paperWidth }), {
    paperWidth: contexte.paperWidth,
    cut,
  });
}
