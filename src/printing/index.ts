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

import { piloteBluetooth } from "./drivers/bluetooth";
import { piloteNyx } from "./drivers/nyx";
import { pilotePdf } from "./drivers/pdf";
import type { PiloteImpression, TransportId } from "./driver";
import { densiteValide } from "./densite";
import { largeurPour } from "./largeur";
import { lireReglage, type ReglageImprimante } from "./preferences";
import { TRANSPORTS } from "./reglage";

export type { ContexteImpression, PiloteImpression, TransportId } from "./driver";
export { rendreTexte, regleDeCalibration, colonnesPour, SIZE_BODY, SIZE_TITLE } from "./render-text";
export type { LigneImprimee, Alignement } from "./render-text";
export { rendreEscPos, rendreEscPosImage, RANGEES_PAR_BANDE } from "./render-escpos";
export {
  rasterDuTicket,
  rasteriseurDisponible,
  pointsDuPapier,
  octetsParRangee,
  type RasterTicket,
} from "./raster";
export { capacitesImprimante, type CapacitesImprimante } from "./drivers/nyx";
export { rendreHtml, pageDuTicket, hauteurDuDocument, mmEnPoints } from "./render-html";
export {
  lireReglage,
  ecrireReglage,
  libelleTransport,
  normaliserReglage,
  REGLAGE_PAR_DEFAUT,
  TRANSPORTS,
  type LienBluetooth,
  type ReglageImprimante,
} from "./preferences";
export { ErreurImpression, messageDe, type RaisonEchec } from "./erreurs";
export { largeurPour } from "./largeur";
export { DENSITES, DENSITE_PAR_DEFAUT, densiteValide } from "./densite";
export {
  activerBluetooth,
  annulerRecherche,
  avecImprimanteChoisie,
  appairerImprimante,
  chercherImprimantes,
  demanderPermissionsBluetooth,
  imprimantesAppairees,
  ouvrirReglagesBluetooth,
  type ImprimanteTrouvee,
  type RechercheImprimantes,
} from "./drivers/bluetooth";
export { type EtatPermissions } from "./permissions";

const PAR_ID: Record<TransportId, PiloteImpression> = {
  embedded: piloteNyx,
  bluetooth: piloteBluetooth,
  pdf: pilotePdf,
};

/** Le transport choisi s'il répond, sinon le premier qui répond. */
export async function piloteCourant(
  reglage?: ReglageImprimante
): Promise<PiloteImpression> {
  const r = reglage ?? (await lireReglage());
  const essais: TransportId[] = [
    r.transport,
    ...TRANSPORTS.filter((id) => id !== r.transport),
  ];

  for (const id of essais) {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ LA RECHERCHE EST TOTALE, ET LA NORMALISATION NE SUFFIT PAS.     │
    // │                                                                  │
    // │ `normaliserReglage` garantit un transport connu, mais elle vit   │
    // │ dans un AUTRE module : une valeur qui la contournerait - une     │
    // │ écriture directe, une version future - rendrait ici `undefined`, │
    // │ et le ticket planterait au lieu de sortir en PDF.                │
    // └──────────────────────────────────────────────────────────────────┘
    const pilote = PAR_ID[id];
    if (pilote && (await pilote.disponible())) return pilote;
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
  const pilote = await piloteCourant(reglage);

  const largeur = largeurPour(pilote, reglage);

  try {
    await pilote.imprimer(blocks, {
      paperWidth: largeur,
      nom: demande.nom,
      // Bornée à la LARGEUR RETENUE, pas à celle du réglage : la cascade peut
      // avoir descendu d'un transport, et 80 n'est pas une densité valide sur
      // un rouleau de 80 mm.
      densite: densiteValide(reglage.densite, largeur),
    });
    return pilote.id;
  } catch (erreur) {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LA CASCADE NE COUVRAIT QUE LA DISPONIBILITÉ, PAS L'ÉCHEC.         │
    // │                                                                    │
    // │ `piloteCourant()` descend l'échelle des transports tant qu'aucun ne │
    // │ RÉPOND, puis s'arrête. Dès qu'un transport répondait et échouait    │
    // │ ensuite - écriture BLE refusée, rouleau vide, flux rejeté - plus    │
    // │ rien ne repassait par le PDF, alors que la règle en tête de ce      │
    // │ fichier dit qu'un ticket qui ne sort pas du tout est le seul échec  │
    // │ inacceptable. Le client repartait sans papier avec, dans la poche   │
    // │ du caissier, un téléphone parfaitement capable de lui en envoyer.   │
    // │                                                                    │
    // │ L'incident reste LISIBLE : le transport rendu est `pdf`, et c'est   │
    // │ lui qui est journalisé en base par la file d'impression.            │
    // └────────────────────────────────────────────────────────────────────┘
    if (pilote.id === "pdf") throw erreur;

    await pilotePdf.imprimer(blocks, {
      paperWidth: reglage.paperWidth,
      nom: demande.nom,
      densite: densiteValide(reglage.densite, reglage.paperWidth),
    });
    return "pdf";
  }
}
