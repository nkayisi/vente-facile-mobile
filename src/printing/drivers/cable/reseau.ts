/**
 * L'imprimante branchée au routeur (Ethernet ou Wi-Fi), sur le port « raw »
 * des imprimantes ESC/POS (9100 le plus souvent).
 *
 * L'adresse se saisit dans l'écran Imprimante : on ne fouille pas le réseau du
 * marchand. Une adresse injoignable lève, et la cascade sort le PDF.
 */
import type { Block } from "@vente-facile/core/receipt";
import { Buffer } from "buffer";

import type { ContexteImpression, PiloteImpression } from "../../driver";
import { ErreurImpression, messageDe } from "../../erreurs";
import { octetsDuTicket } from "../../octets-escpos";
import { lireReglage } from "../../preferences";
import { moduleCable } from "./natif";
import { analyserAdresseReseau } from "./regles";

export const piloteReseau: PiloteImpression = {
  id: "reseau",
  action: "Imprimer le reçu",

  /**
   * Silencieuse, et sans sonder le réseau : une connexion d'essai à chaque
   * ticket coûterait jusqu'à quatre secondes quand l'imprimante est éteinte.
   * L'échec réel se lit à l'impression, et la cascade sort alors le PDF.
   */
  async disponible() {
    try {
      const reglage = await lireReglage();
      if (reglage.transport !== "reseau" || !reglage.adresse) return false;
      return moduleCable() !== null && analyserAdresseReseau(reglage.adresse).ok;
    } catch {
      return false;
    }
  },

  async imprimer(blocks: Block[], contexte: ContexteImpression) {
    const natif = moduleCable();
    if (!natif) throw new ErreurImpression("absente", "Ce terminal ne sait pas parler à une imprimante réseau.");
    const reglage = await lireReglage();
    const adresse = analyserAdresseReseau(reglage.adresse ?? "");
    if (!adresse.ok) throw new ErreurImpression("aucune_imprimante", adresse.motif);

    const octets = await octetsDuTicket(blocks, contexte, reglage.cut, reglage.texteSimple);
    try {
      await natif.envoyerTcp(adresse.hote, adresse.port, Buffer.from(octets).toString("base64"));
    } catch (e) {
      throw new ErreurImpression("ecriture", messageDe(e, "L'imprimante réseau ne répond pas."));
    }
  },
};
