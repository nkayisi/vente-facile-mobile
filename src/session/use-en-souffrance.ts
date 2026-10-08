/**
 * La lecture de ce qui n'a pas atteint le serveur, pour un écran.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE MAIN LIT LA FILE, ET ELLE COMPTE LES PHOTOS.                   │
 * │                                                                          │
 * │ Les deux voiles lisaient `countByState()` chacun de son côté. Deux        │
 * │ conséquences, toutes deux silencieuses :                                  │
 * │                                                                          │
 * │  - les PHOTOS en attente n'étaient pas comptées, alors qu'une photo en    │
 * │    attente est la SEULE copie de son fichier et qu'un APK posé à la main  │
 * │    la détruit. La carte affirmait « tout est parti » et le marchand       │
 * │    suivait son conseil.                                                  │
 * │  - une base illisible rendait ZÉRO, donc la même affirmation.             │
 * │                                                                          │
 * │ `lireEnSouffrance` répond déjà aux deux : elle joint les photos et rend   │
 * │ `pending: 1` sur un échec, parce que « l'optimisme efface ». C'est le     │
 * │ lecteur des trois décisions destructrices du dépôt ; les voiles en sont   │
 * │ la quatrième, et ils n'y passaient pas.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ **Ce hook s'appelle depuis le VOILE, jamais depuis la garde.** Une garde le
 * monte à chaque terminal, y compris quand la porte est ouverte - l'état
 * ordinaire - donc un abonnement permanent à `outbox_operations` et un agrégat
 * rejoué à chaque vente, sur le chemin chaud du comptoir, pour un écran qu'on ne
 * verra pas. Un garde-fou de doctrine l'interdit.
 */
import { useLecture } from "@/data/live";

import { FILE_VIDE, type EtatFile } from "./deconnexion-regles";
import { lireEnSouffrance } from "./en-souffrance";

/** Les deux tables qui portent ce qui n'est pas parti. Il faut les deux. */
const TABLES = ["outbox_operations", "pending_product_photos"];

export interface VueEnSouffrance {
  file: EtatFile;
  /**
   * `true` tant que la base n'a pas répondu.
   *
   * ⚠ **On ne lit JAMAIS ce drapeau comme un zéro.** C'est la première image de
   * tout rendu : une carte qui affirmerait alors « tout est parti » le ferait à
   * chaque ouverture du voile, avant d'avoir rien mesuré.
   */
  inconnu: boolean;
}

export function useEnSouffrance(): VueEnSouffrance {
  const { donnees } = useLecture(lireEnSouffrance, { tables: TABLES });
  return { file: donnees ?? FILE_VIDE, inconnu: donnees === null };
}
