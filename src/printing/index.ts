/**
 * Imprimer un document.
 *
 * Le point d'entrée des écrans, et le seul. Un écran passe des BLOCS et un nom
 * de fichier ; il ne choisit pas le moyen, ne connaît ni colonnes ni PDF.
 *
 * L'ordre est le bon : l'imprimante intégrée d'abord, parce qu'un client au
 * comptoir attend son papier, le PDF ensuite, qui ne peut pas manquer.
 */
import type { Block } from "@vente-facile/core/receipt";

import { piloteNyx } from "./drivers/nyx";
import { pilotePdf } from "./drivers/pdf";
import type { ContexteImpression, PiloteImpression } from "./driver";

export type { ContexteImpression, PiloteImpression } from "./driver";
export { rendreTexte, regleDeCalibration, colonnesPour, SIZE_BODY } from "./render-text";
export { rendreHtml } from "./render-html";

const PILOTES: PiloteImpression[] = [piloteNyx, pilotePdf];

/** Le premier moyen qui répond. `pilotePdf` répond toujours. */
export async function piloteCourant(): Promise<PiloteImpression> {
  for (const pilote of PILOTES) {
    if (await pilote.disponible()) return pilote;
  }
  return pilotePdf;
}

export async function imprimer(
  blocks: Block[],
  contexte: ContexteImpression
): Promise<PiloteImpression["id"]> {
  const pilote = await piloteCourant();
  await pilote.imprimer(blocks, contexte);
  return pilote.id;
}
