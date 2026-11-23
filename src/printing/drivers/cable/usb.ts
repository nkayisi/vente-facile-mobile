/**
 * L'imprimante branchée par câble USB : interne (le terminal SDL, rk3568) ou
 * posée à côté de la caisse.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE SERT D'ELLE-MÊME QUAND LE TERMINAL N'A PAS D'IMPRIMANTE INTÉGRÉE.   │
 * │                                                                          │
 * │ Le réglage par défaut vise l'imprimante intégrée. Sur un terminal dont   │
 * │ l'imprimante est branchée en USB, elle ne répondait pas et chaque ticket │
 * │ partait en PDF, sans que rien ne le dise au comptoir. Une SEULE          │
 * │ imprimante de classe « imprimante » branchée tient donc lieu             │
 * │ d'imprimante du terminal (`usbRetenue`).                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'autorisation : Android demande, pour chaque appareil USB, si l'application
 * peut s'en servir. La boîte s'ouvre au premier ticket, avec « Toujours »
 * (voir le manifeste du module natif). Un refus n'est pas redemandé avant le
 * prochain démarrage de l'application, ou un geste dans l'écran Imprimante :
 * une boîte à chaque ticket tiendrait le comptoir en otage.
 */
import type { Block } from "@vente-facile/core/receipt";
import { Buffer } from "buffer";

import type { ContexteImpression, PiloteImpression } from "../../driver";
import { ErreurImpression, messageDe } from "../../erreurs";
import { octetsDuTicket } from "../../octets-escpos";
import { lireReglage } from "../../preferences";
import { moduleCable } from "./natif";
import { usbRetenue, type ImprimanteUsb, type UsbRetenue } from "./regles";

/** Les appareils dont l'accès a été refusé depuis le démarrage de l'application. */
const refusees = new Set<string>();

/**
 * Ce que la recherche des imprimantes USB a donné.
 *
 * ⚠ UNE PANNE N'EST PAS UNE LISTE VIDE : la règle déjà payée sur le Bluetooth.
 * « Aucune imprimante USB » sur un terminal dont le module natif manque, ou
 * dont Android refuse de lister les appareils, enverrait chercher un câble.
 */
export type RechercheUsb =
  | { etat: "ok"; imprimantes: ImprimanteUsb[] }
  | { etat: "sans_module" }
  | { etat: "erreur"; message: string };

export async function rechercherImprimantesUsb(): Promise<RechercheUsb> {
  const natif = moduleCable();
  if (!natif) return { etat: "sans_module" };
  try {
    return { etat: "ok", imprimantes: await natif.listerUsb() };
  } catch (e) {
    return { etat: "erreur", message: messageDe(e, "Android n'a pas listé les appareils USB.") };
  }
}

/** Les imprimantes branchées ; lève si le module manque ou si Android refuse. */
async function liste(): Promise<ImprimanteUsb[]> {
  const natif = moduleCable();
  if (!natif) throw new ErreurImpression("absente", "Ce terminal ne sait pas parler à une imprimante USB.");
  return natif.listerUsb();
}

/** L'imprimante USB qui servirait au prochain ticket, et comment elle a été retenue. */
export async function imprimanteUsbRetenue(): Promise<UsbRetenue | null> {
  return usbRetenue(await lireReglage(), await liste());
}

/**
 * Demande l'accès à une imprimante, sur un GESTE du marchand (écran
 * Imprimante). Lève le refus retenu : c'est lui qui redemande.
 */
export async function autoriserImprimanteUsb(cle: string): Promise<boolean> {
  const natif = moduleCable();
  if (!natif) return false;
  refusees.delete(cle);
  const accordee = await natif.demanderPermissionUsb(cle);
  if (!accordee) refusees.add(cle);
  return accordee;
}

export const piloteUsb: PiloteImpression = {
  id: "usb",
  action: "Imprimer le reçu",

  /**
   * ⚠ SILENCIEUSE : elle regarde ce qui est branché, et ne demande rien. Elle
   * répond vrai même sans autorisation : c'est `imprimer()` qui la demande, au
   * premier ticket, sinon l'imprimante passerait en PDF après chaque
   * redémarrage sans que personne ne sache pourquoi.
   */
  async disponible() {
    try {
      return (await imprimanteUsbRetenue()) !== null;
    } catch {
      return false;
    }
  },

  async imprimer(blocks: Block[], contexte: ContexteImpression) {
    const reglage = await lireReglage();
    const retenue = usbRetenue(reglage, await liste());
    if (!retenue) throw new ErreurImpression("aucune_imprimante", "L'imprimante USB n'est pas branchée.");
    const { cle } = retenue.imprimante;
    // `liste()` a déjà vérifié que le module existe.
    const natif = moduleCable()!;

    if (!retenue.imprimante.autorisee) {
      const accordee = refusees.has(cle) ? false : await natif.demanderPermissionUsb(cle);
      if (!accordee) {
        refusees.add(cle);
        throw new ErreurImpression(
          "permission",
          "Android n'a pas autorisé l'accès à l'imprimante USB. Ouvrez Imprimante pour l'accorder."
        );
      }
    }

    const octets = await octetsDuTicket(blocks, contexte, reglage.cut, reglage.texteSimple);
    try {
      await natif.envoyerUsb(cle, Buffer.from(octets).toString("base64"));
    } catch (e) {
      throw new ErreurImpression("ecriture", messageDe(e, "L'imprimante USB n'a pas accepté le ticket."));
    }
  },
};
