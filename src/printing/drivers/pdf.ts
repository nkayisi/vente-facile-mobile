/**
 * Repli PDF : `expo-print` puis `expo-sharing`.
 *
 * Sert iOS, où il n'y a pas d'imprimante intégrée, et tout Android dont le
 * terminal n'en porte pas. Ce n'est pas un pis-aller : c'est aussi la seule
 * façon d'envoyer un reçu à un client qui le demande par message.
 *
 * Le partage n'est pas garanti disponible (un émulateur nu n'a rien pour
 * recevoir le fichier). On le teste, et à défaut on ouvre la feuille
 * d'impression du système, qui existe partout.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { Block } from "@vente-facile/core/receipt";

import type { ContexteImpression, PiloteImpression } from "../driver";
import { rendreHtml } from "../render-html";

export const pilotePdf: PiloteImpression = {
  id: "pdf",
  action: "Partager le reçu",

  // Toujours vrai : `expo-print` est embarqué et ne dépend d'aucun matériel.
  // C'est ce qui en fait le dernier recours, celui qui ne peut pas manquer.
  async disponible() {
    return true;
  },

  async imprimer(blocks: Block[], contexte: ContexteImpression) {
    const { uri } = await Print.printToFileAsync({
      html: rendreHtml(blocks, contexte.paperWidth),
      base64: false,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: contexte.nom,
      });
      return;
    }
    await Print.printAsync({ uri });
  },
};
