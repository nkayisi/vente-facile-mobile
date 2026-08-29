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
import { Platform } from "react-native";

import type { Block } from "@vente-facile/core/receipt";

import type { ContexteImpression, PiloteImpression } from "../driver";
import { rendreTexte, type LigneImprimee } from "../render-text";

interface ModuleNyx {
  isAvailable(): Promise<boolean>;
  printReceipt(lines: LigneImprimee[]): Promise<boolean>;
}

let module: ModuleNyx | null | undefined;

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

export const piloteNyx: PiloteImpression = {
  id: "nyx",
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

    const ok = await natif.printReceipt(
      rendreTexte(blocks, { paperWidth: contexte.paperWidth })
    );
    if (!ok) throw new Error("L'imprimante n'a pas accepté le ticket.");
  },
};
