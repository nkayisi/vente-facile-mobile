/**
 * Imprimante thermique intégrée des terminaux NYX.
 *
 * CHARGEMENT PARESSEUX, GARDÉ PAR PLATEFORME. Le module natif n'existe que sur
 * Android, et l'interroger là où il est absent lève au chargement du fichier,
 * donc AVANT que le moindre écran s'affiche : l'application ne démarrerait pas
 * sur iOS. D'où `requireOptionalNativeModule`, qui rend `null`, et l'import
 * différé au premier appel.
 *
 * Le paquet npm `react-native-nyx-printer` n'est PAS utilisé. Il déclare
 * 755 dépendances d'exécution (dont `metro`, `ts-node` et `vm2`, abandonné par
 * son auteur pour évasion de bac à sable irréparable) alors que sa source
 * n'importe que `react-native` : c'est l'arbre de développement de son auteur,
 * publié par erreur. `pnpm patch` n'y peut rien, pnpm résolvant depuis le
 * manifeste du registre. L'ancienne application avait déjà tranché en écrivant
 * son propre module Expo en Kotlin ; c'est ce module qui est repris.
 */
import { Buffer } from "buffer";
import { Platform } from "react-native";

import type { Block } from "@vente-facile/core/receipt";

import type { ContexteImpression, PiloteImpression } from "../driver";
import { rasterDuTicket } from "../raster";
import { rendreTexte, SIZE_TITLE, type LigneImprimee } from "../render-text";

/**
 * Ce que le matériel dit de lui-même. Un DIAGNOSTIC, et rien de plus.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA LARGEUR DU PAPIER NE SE DÉTECTE PAS, ET C'EST MESURÉ.                │
 * │                                                                          │
 * │ On a cru pouvoir la sonder : l'AIDL dit que `setPaperWidth` n'accepte    │
 * │ que 384 sur une 58 mm, donc un 576 accepté devait signer une tête de 80. │
 * │ Relevé sur le NB55 : `setPaperWidth(576)` rend 0, sur un terminal dont   │
 * │ le papier fait 58 mm et dont les tickets sortent justes à 384.           │
 * │                                                                          │
 * │ La relecture de l'AIDL dit pourquoi : « Primarily used for printing      │
 * │ 58mm paper on 80mm printer ». C'est un RÉGLAGE de ce qui est chargé, pas │
 * │ une question sur ce que la machine sait faire - et le papier chargé      │
 * │ n'est une propriété d'aucune machine. Seul le marchand le sait, et la    │
 * │ règle de calibration est le seul moyen de le vérifier.                   │
 * │                                                                          │
 * │ Un garde-fou qui ne mord jamais est pire que pas de garde-fou : il s'en  │
 * │ est fallu d'une ligne de journal pour ne pas en livrer un.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface CapacitesImprimante {
  modele: string;
  version: string;
  service: string;
  densite: number;
}

interface ModuleNyx {
  isAvailable(): Promise<boolean>;
  /** État matériel : 0 = prête. Autre = rouleau vide, capot, surchauffe. */
  getStatus?(): Promise<number>;
  capacites?(): Promise<CapacitesImprimante>;
  /**
   * Imprime la page dessinée. Voir `imprimer`.
   *
   * ⚠ REMPLACE `printHtml`. Le rendu a quitté ce module pour `ticket-raster`,
   * commun aux deux plateformes et au Bluetooth. Un binaire antérieur n'a pas
   * cette fonction : c'est l'empreinte (`runtimeVersion: fingerprint`) qui
   * interdit de livrer ce JS par-dessus un natif plus ancien, la source des
   * modules entrant dans son calcul. Ce lot ne peut donc PAS partir en mise à
   * jour par-dessus l'air.
   */
  printRaster?(
    data: string,
    width: number,
    height: number,
    densite: number
  ): Promise<boolean>;
  printReceipt(lines: LigneImprimee[]): Promise<boolean>;
}

let module: ModuleNyx | null | undefined;
/**
 * Ce que la machine a dit, retenu pour la session.
 *
 * ⚠ ON NE RETIENT QU'UNE RÉPONSE UTILE. Interrogée trop tôt - démarrage à
 * froid, service encore délié - elle ne rend que des chaînes vides ; les figer
 * priverait l'écran du diagnostic pour toute la session, alors qu'il suffit de
 * redemander. Un modèle, lui, ne change pas.
 */
let capacitesRetenues: CapacitesImprimante | null = null;

/**
 * `undefined` : jamais cherché. `null` : cherché, absent.
 *
 * Distinguer les deux évite de retenter un `require` à chaque impression sur un
 * appareil qui n'aura jamais ce module.
 */
function charger(): ModuleNyx | null {
  if (module !== undefined) return module;
  if (Platform.OS !== "android") {
    module = null;
    return null;
  }
  try {
     
    const expo = require("expo") as {
      requireOptionalNativeModule<T>(name: string): T | null;
    };
    module = expo.requireOptionalNativeModule<ModuleNyx>("NyxPrinter");
  } catch {
    module = null;
  }
  return module;
}

/**
 * Ce que la machine dit d'elle-même, ou `null` si elle ne dit rien.
 *
 * Exportée pour l'écran Imprimante : c'est là que le marchand règle une largeur,
 * donc là qu'il doit lire celle que sa tête accepte réellement.
 */
export async function capacitesImprimante(): Promise<CapacitesImprimante | null> {
  if (capacitesRetenues) return capacitesRetenues;
  const natif = charger();
  if (!natif?.capacites) return null;
  try {
    const capacites = await natif.capacites();
    if (capacites.modele || capacites.service) capacitesRetenues = capacites;
    return capacites;
  } catch {
    return null;
  }
}

export const piloteNyx: PiloteImpression = {
  id: "embedded",
  action: "Imprimer le reçu",

  async disponible() {
    const natif = charger();
    if (!natif) return false;
    try {
      // Le module chargé ne suffit pas : le service d'impression du terminal
      // peut être délié. On demande au matériel, on ne le suppose pas.
      return await natif.isAvailable();
    } catch {
      return false;
    }
  },

  async imprimer(blocks: Block[], contexte: ContexteImpression) {
    const natif = charger();
    if (!natif) throw new Error("Imprimante indisponible sur cet appareil.");

    // ┌────────────────────────────────────────────────────────────────────────┐
    // │ ON IMPRIME LE DOCUMENT DESSINÉ, PAS UNE APPROXIMATION EN TEXTE.       │
    // │                                                                        │
    // │ `printText` laisse le service composer : pas de vidéo inversée pour le │
    // │ bandeau, pas de colonnes pour les couples libellé/montant, et une      │
    // │ police dont la chasse n'est pas garantie. Le papier ne ressemblait pas │
    // │ au PDF que le même client peut recevoir.                               │
    // │                                                                        │
    // │ `ticket-raster` dessine la page - la même que le PDF et que le         │
    // │ Bluetooth - et rend ses points. Police, interligne, alignements et     │
    // │ vidéo inversée sont alors décidés une seule fois, par la feuille de    │
    // │ style.                                                                  │
    // └────────────────────────────────────────────────────────────────────────┘
    if (natif.printRaster) {
      const raster = await rasterDuTicket(blocks, contexte.paperWidth);
      if (raster) {
        // Les points repartent en base64 : c'est le seul format qu'un pont
        // Expo transporte sans tableau typé. Le coût est un ré-encodage de
        // quelques dizaines de kilo-octets, invisible au comptoir, et il évite
        // de garder deux représentations d'une même page dans le domaine.
        const ok = await natif.printRaster(
          Buffer.from(raster.points).toString("base64"),
          raster.largeur,
          raster.hauteur,
          // ┌──────────────────────────────────────────────────────────────────┐
          // │ LA DENSITÉ EST LE SEUL LEVIER QUI NE TOUCHE À AUCUNE MISE EN    │
          // │ PAGE.                                                            │
          // │                                                                  │
          // │ `setPrinterDensity` est dans l'AIDL du constructeur depuis       │
          // │ `PrinterService v1.9.2` et n'avait jamais eu d'appelant : le     │
          // │ terminal imprimait à la valeur d'usine, quelle qu'elle soit.     │
          // │ C'est ce qui décide de la noirceur de chaque point, donc de la   │
          // │ survie d'un fût fin au seuillage.                                │
          // └──────────────────────────────────────────────────────────────────┘
          contexte.densite
        );
        if (!ok) throw new Error("L'imprimante n'a pas accepté le ticket.");
        return;
      }
    }

    // Repli : impression ligne à ligne. Moins fidèle, mais un ticket sort -
    // c'est le seul échec inacceptable.
    const lignes = rendreTexte(blocks, { paperWidth: contexte.paperWidth }).map(
      pourServiceNyx
    );
    const ok = await natif.printReceipt(lignes);
    if (!ok) throw new Error("L'imprimante n'a pas accepté le ticket.");
  },
};

/**
 * Traduit une ligne du modèle commun vers ce que le service NYX sait rendre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCHELLE DEVIENT UNE TAILLE, ET C'EST MESURÉ.                          │
 * │                                                                          │
 * │ `textScaleX/Y = 2` étire les caractères EN LARGEUR et en hauteur : la    │
 * │ ligne de 42 colonnes n'en tient plus que 21, l'interligne double, et le  │
 * │ papier ne ressemble plus au document. L'ancienne application, qui        │
 * │ imprimait juste sur ce même matériel, agrandissait par `textSize = 22`.  │
 * │ On fait pareil.                                                          │
 * │                                                                          │
 * │ L'échelle RESTE dans le modèle commun : l'encodeur ESC/POS, lui, sait    │
 * │ mesurer la double chasse, et le repli texte du Bluetooth en dépend.      │
 * │ C'est ce pilote-ci qui traduit, parce que son service compose lui-même.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function pourServiceNyx(ligne: LigneImprimee): LigneImprimee {
  if (ligne.scale !== 2) return ligne;
  return { ...ligne, scale: 1, size: SIZE_TITLE };
}
