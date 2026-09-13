/**
 * Ce qu'un moyen d'impression doit savoir faire.
 *
 * Trois existent, et ils couvrent ce qu'un marchand a sous la main. La liste
 * des transports est déclarée UNE fois, dans `reglage.ts` : elle vivait ici et
 * là-bas, deux unions identiques écrites deux fois, ce qui est précisément ce
 * qui permet à deux listes de diverger.
 *
 * L'interface est volontairement pauvre. Elle ne connaît ni PDF, ni colonnes,
 * ni octets, ni Bluetooth : elle reçoit la DESCRIPTION du document, en blocs,
 * et se débrouille. C'est ce qui a permis de fondre les deux transports sans
 * fil en un seul sans toucher à la mise en page, et ce qui permettra d'ajouter
 * le réseau ou l'USB.
 */
import type { Block } from "@vente-facile/core/receipt";

import type { TransportId } from "./reglage";

export type { TransportId };

export interface ContexteImpression {
  paperWidth: 58 | 80;
  /** Nom du fichier proposé au partage, sans extension. Sert au repli PDF. */
  nom: string;
  /**
   * Noirceur de chaque point, déjà bornée à ce que cette largeur accepte.
   *
   * Seul `piloteNyx` la lit : c'est un appel du service NYX, et aucun autre
   * transport n'en a l'équivalent. Un pilote qui l'ignore ne fait rien de mal.
   */
  densite: number;
}

export interface PiloteImpression {
  readonly id: TransportId;
  /** Libellé de l'action, tel que le caissier le lit sur le bouton. */
  readonly action: string;
  /** Le matériel répond-il ? Jamais supposé : toujours demandé. */
  disponible(): Promise<boolean>;
  imprimer(blocks: Block[], contexte: ContexteImpression): Promise<void>;
}
