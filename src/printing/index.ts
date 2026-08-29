/**
 * Imprimer un document.
 *
 * Le point d'entrée des écrans, et le seul. Un écran passe des BLOCS et un nom
 * de fichier ; il ne choisit pas le moyen, ne connaît ni colonnes, ni octets,
 * ni Bluetooth.
 *
 * L'ORDRE EST UNE RÈGLE MÉTIER, pas une commodité. On essaie d'abord le
 * transport CHOISI par le marchand : c'est l'imprimante qu'il a sous la main et
 * dont le client attend le papier. Les autres suivent, et le PDF ferme la
 * marche parce qu'il ne peut pas manquer. Un ticket qui ne sort pas du tout est
 * le seul échec inacceptable ; un ticket qui sort par un autre chemin que prévu
 * est un incident lisible.
 */
import type { Block } from "@vente-facile/core/receipt";

import { piloteBle } from "./drivers/ble";
import { piloteBluetooth } from "./drivers/bluetooth";
import { piloteNyx } from "./drivers/nyx";
import { pilotePdf } from "./drivers/pdf";
import type { ContexteImpression, PiloteImpression, TransportId } from "./driver";
import { lireReglage } from "./preferences";

export type { ContexteImpression, PiloteImpression, TransportId } from "./driver";
export { rendreTexte, regleDeCalibration, colonnesPour, SIZE_BODY } from "./render-text";
export type { LigneImprimee, Alignement } from "./render-text";
export { rendreEscPos } from "./render-escpos";
export { rendreHtml } from "./render-html";
export {
  lireReglage,
  ecrireReglage,
  REGLAGE_PAR_DEFAUT,
  type ReglageImprimante,
  type Transport,
} from "./preferences";
export { peripheriquesAppaires, type PeripheriqueBluetooth } from "./drivers/bluetooth";
export { chercherPeripheriques, type PeripheriqueBle } from "./drivers/ble";

const PAR_ID: Record<TransportId, PiloteImpression> = {
  embedded: piloteNyx,
  bluetooth: piloteBluetooth,
  ble: piloteBle,
  pdf: pilotePdf,
};

const ORDRE: TransportId[] = ["embedded", "bluetooth", "ble", "pdf"];

/** Le transport choisi s'il répond, sinon le premier qui répond. */
export async function piloteCourant(): Promise<PiloteImpression> {
  const reglage = await lireReglage();
  const essais: TransportId[] = [
    reglage.transport,
    ...ORDRE.filter((id) => id !== reglage.transport),
  ];

  for (const id of essais) {
    if (await PAR_ID[id].disponible()) return PAR_ID[id];
  }
  return pilotePdf;
}

export interface DemandeImpression {
  /** Nom du fichier proposé au partage, sans extension. */
  nom: string;
}

export async function imprimer(
  blocks: Block[],
  demande: DemandeImpression
): Promise<TransportId> {
  const reglage = await lireReglage();
  const pilote = await piloteCourant();
  const contexte: ContexteImpression = {
    paperWidth: reglage.paperWidth,
    nom: demande.nom,
  };
  await pilote.imprimer(blocks, contexte);
  return pilote.id;
}
