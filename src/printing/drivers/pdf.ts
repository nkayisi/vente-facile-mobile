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
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { Block } from "@vente-facile/core/receipt";

import { nomDeFichier } from "@vente-facile/core/report";

import type { ContexteImpression, PiloteImpression } from "../driver";
import { pageDuTicket } from "../render-html";

export const pilotePdf: PiloteImpression = {
  id: "pdf",
  action: "Partager le reçu",

  // Toujours vrai : `expo-print` est embarqué et ne dépend d'aucun matériel.
  // C'est ce qui en fait le dernier recours, celui qui ne peut pas manquer.
  async disponible() {
    return true;
  },

  async imprimer(blocks: Block[], contexte: ContexteImpression) {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LES DIMENSIONS SONT PASSÉES, ET C'EST OBLIGATOIRE.                  │
    // │                                                                      │
    // │ `expo-print` ne lit PAS la règle `@page { size: … }` de la feuille de │
    // │ style : les dimensions viennent de ses options `width` / `height`, et │
    // │ leur défaut est le format US LETTER, 612 × 792 points. Établi dans sa │
    // │ source native, des deux côtés : Android `PrintPDFRenderTask.kt`      │
    // │ (`DEFAULT_MEDIA_WIDTH = 612`), iOS `PrintOptions.swift`              │
    // │ (`kLetterPaperSize`).                                                │
    // │                                                                      │
    // │ Sans elles, le reçu d'un rouleau de 58 mm sortait sur une feuille de │
    // │ bureau, tassé dans le coin supérieur gauche : le client à qui le     │
    // │ marchand envoie ce PDF reçoit une page presque vide. Le dépôt a déjà │
    // │ payé ce piège sur les rapports A4 ; il ne se redécouvre pas.         │
    // └──────────────────────────────────────────────────────────────────────┘
    const page = pageDuTicket(blocks, contexte.paperWidth);
    const { uri } = await Print.printToFileAsync({
      html: page.html,
      width: page.largeurPt,
      height: page.hauteurPt,
      base64: false,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(await renommer(uri, contexte.nom), {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: contexte.nom,
      });
      return;
    }
    await Print.printAsync({ uri });
  },
};

/**
 * Donne au fichier le NOM du document avant de le partager.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `expo-print` NOMME LE FICHIER, ET IL LE NOMME EN UUID.                  │
 * │                                                                          │
 * │ Relevé sur l'émulateur : la feuille de partage annonçait                 │
 * │ « e5891941-bd78-4375-83cb-c2781f27dd6e.pdf ». `contexte.nom` ne servait  │
 * │ que de titre au DIALOGUE, qui disparaît dès qu'on a choisi l'application.│
 * │ Ce qui reste au marchand, c'est le fichier - et trois exports, ou trois  │
 * │ reçus, arrivaient indiscernables dans ses téléchargements. Un reçu qu'on │
 * │ ne sait pas retrouver n'a pas été partagé, il a été perdu.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le renommage est une COPIE et non un déplacement : `printToFileAsync` gère
 * son propre dossier de cache, et le vider sous ses pieds inviterait un défaut
 * que personne ne saurait rattacher à l'impression. Le système purge ce cache.
 *
 * Un échec de copie ne fait pas échouer le partage : on repart de l'original.
 * Un nom de fichier est un confort, un reçu est un dû.
 */
async function renommer(uri: string, nom: string): Promise<string> {
  const propre = nomDeFichier(nom);
  if (!propre) return uri;

  try {
    const source = new File(uri);
    const cible = new File(Paths.cache, `${propre}.pdf`);
    // Un export refait dans la même minute doit écraser le précédent, pas
    // échouer : le marchand vient de demander celui-ci.
    if (cible.exists) cible.delete();
    source.copy(cible);
    return cible.uri;
  } catch {
    return uri;
  }
}
