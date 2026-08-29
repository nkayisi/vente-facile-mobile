/**
 * Ce qu'un moyen d'impression doit savoir faire.
 *
 * Quatre existent, et ils couvrent ce qu'un marchand a sous la main :
 *
 * | Transport   | Matériel visé                                              |
 * | ----------- | ---------------------------------------------------------- |
 * | `embedded`  | imprimante intégrée d'un terminal de caisse (NYX, Sunmi…)  |
 * | `bluetooth` | Bluetooth CLASSIQUE (SPP), la majorité des 58 mm du marché |
 * | `ble`       | Bluetooth basse consommation, les modèles plus récents      |
 * | `pdf`       | repli universel : iOS, appareil sans imprimante, envoi      |
 *
 * L'interface est volontairement pauvre. Elle ne connaît ni PDF, ni colonnes,
 * ni octets : elle reçoit la DESCRIPTION du document, en blocs, et se
 * débrouille. C'est ce qui a permis d'ajouter les deux transports sans fil sans
 * toucher un seul écran, et ce qui permettra d'ajouter le réseau ou l'USB.
 */
import type { Block } from "@vente-facile/core/receipt";

export interface ContexteImpression {
  paperWidth: 58 | 80;
  /** Nom du fichier proposé au partage, sans extension. Sert au repli PDF. */
  nom: string;
}

export type TransportId = "embedded" | "bluetooth" | "ble" | "pdf";

export interface PiloteImpression {
  readonly id: TransportId;
  /** Libellé de l'action, tel que le caissier le lit sur le bouton. */
  readonly action: string;
  /** Le matériel répond-il ? Jamais supposé : toujours demandé. */
  disponible(): Promise<boolean>;
  imprimer(blocks: Block[], contexte: ContexteImpression): Promise<void>;
}
