/**
 * Imprimante thermique en Bluetooth CLASSIQUE (profil série, SPP).
 *
 * C'est le transport de l'écrasante majorité des imprimantes 58 mm bon marché,
 * celles qu'un marchand achète au marché : elles s'appairent comme un casque,
 * ouvrent un canal série et avalent des octets ESC/POS bruts. Pas de service ni
 * de caractéristique à découvrir, pas de MTU à négocier.
 *
 * On n'appaire PAS depuis l'application : l'appairage est une affaire du
 * système, avec son code PIN, et le refaire ici donnerait une deuxième liste de
 * périphériques à tenir. On lit les appareils déjà appairés, le caissier
 * choisit le sien une fois pour toutes.
 */
import { Buffer } from "buffer";
import { Platform } from "react-native";

import type { Block } from "@vente-facile/core/receipt";

import type { ContexteImpression, PiloteImpression } from "../driver";
import { rendreEscPos } from "../render-escpos";
import { rendreTexte } from "../render-text";
import { lireReglage } from "../preferences";

export interface PeripheriqueBluetooth {
  adresse: string;
  nom: string;
}

interface ModuleBtClassic {
  isBluetoothEnabled(): Promise<boolean>;
  getBondedDevices(): Promise<{ address: string; name: string }[]>;
  connectToDevice(address: string, options?: Record<string, unknown>): Promise<unknown>;
  isDeviceConnected(address: string): Promise<boolean>;
  writeToDevice(address: string, data: string, encoding?: string): Promise<boolean>;
}

let module: ModuleBtClassic | null | undefined;

/**
 * Chargement paresseux, comme pour le module natif du terminal.
 *
 * Le paquet n'expose rien sur iOS hors accessoires MFi, et l'importer en tête
 * de fichier lèverait au chargement, donc avant le premier écran.
 */
function charger(): ModuleBtClassic | null {
  if (module !== undefined) return module;
  if (Platform.OS !== "android") {
    module = null;
    return null;
  }
  try {
     
    module = (require("react-native-bluetooth-classic") as { default: ModuleBtClassic })
      .default;
  } catch {
    module = null;
  }
  return module;
}

/** Les imprimantes déjà appairées au système. */
export async function peripheriquesAppaires(): Promise<PeripheriqueBluetooth[]> {
  const natif = charger();
  if (!natif) return [];
  try {
    if (!(await natif.isBluetoothEnabled())) return [];
    const appareils = await natif.getBondedDevices();
    return appareils.map((d) => ({ adresse: d.address, nom: d.name || d.address }));
  } catch {
    return [];
  }
}

export const piloteBluetooth: PiloteImpression = {
  id: "bluetooth",
  action: "Imprimer le reçu",

  async disponible() {
    const natif = charger();
    if (!natif) return false;
    const reglage = await lireReglage();
    if (reglage.transport !== "bluetooth" || !reglage.adresse) return false;
    try {
      return await natif.isBluetoothEnabled();
    } catch {
      return false;
    }
  },

  async imprimer(blocks: Block[], contexte: ContexteImpression) {
    const natif = charger();
    const reglage = await lireReglage();
    if (!natif || !reglage.adresse) {
      throw new Error("Aucune imprimante Bluetooth choisie.");
    }

    // Reconnecter à chaque ticket serait lent ; supposer la connexion vivante
    // ferait échouer le premier ticket après une mise en veille. On demande.
    if (!(await natif.isDeviceConnected(reglage.adresse))) {
      await natif.connectToDevice(reglage.adresse, {
        // Pas de délimiteur : on écrit des octets, pas des lignes de texte. Le
        // délimiteur par défaut couperait le flux au premier saut de ligne.
        delimiter: "",
        charset: "ascii",
      });
    }

    const octets = rendreEscPos(rendreTexte(blocks, { paperWidth: contexte.paperWidth }), {
      paperWidth: contexte.paperWidth,
      cut: reglage.cut,
    });

    // Le pont React Native ne transporte pas d'octets bruts : on passe par du
    // base64, que le module décode côté natif.
    const ok = await natif.writeToDevice(
      reglage.adresse,
      Buffer.from(octets).toString("base64"),
      "base64"
    );
    if (!ok) throw new Error("L'imprimante n'a pas accepté le ticket.");
  },
};
