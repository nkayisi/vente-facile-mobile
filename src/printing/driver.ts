/**
 * Ce qu'un moyen d'impression doit savoir faire.
 *
 * Deux existent : l'imprimante thermique intégrée d'un terminal NYX, et le PDF
 * partagé, qui sert de repli sur iOS et sur tout Android sans imprimante.
 *
 * L'interface est volontairement pauvre. Elle ne connaît ni PDF, ni colonnes,
 * ni octets : elle reçoit la DESCRIPTION du document, en blocs, et se débrouille.
 * C'est ce qui garantit qu'ajouter un troisième moyen (Bluetooth, réseau) ne
 * touchera aucun écran.
 */
import type { Block } from "@vente-facile/core/receipt";

export interface ContexteImpression {
  paperWidth: 58 | 80;
  /** Nom du fichier proposé au partage, sans extension. Sert au repli PDF. */
  nom: string;
}

export interface PiloteImpression {
  readonly id: "nyx" | "pdf";
  /** Libellé de l'action, tel que le caissier le lit sur le bouton. */
  readonly action: string;
  /** Le matériel répond-il ? Jamais supposé : toujours demandé. */
  disponible(): Promise<boolean>;
  imprimer(blocks: Block[], contexte: ContexteImpression): Promise<void>;
}
