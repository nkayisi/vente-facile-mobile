/**
 * Pourquoi un ticket n'est pas sorti.
 *
 * Sur le motif d'`ApiError` : une panne se CLASSE, elle ne se raconte pas. Le
 * message sert à l'écran, la raison sert au code - et sans elle, une
 * `SecurityException` remontait telle quelle jusqu'à un bandeau, en anglais et
 * avec sa pile d'appels.
 */

export type RaisonEchec =
  /** Android n'a pas accordé le Bluetooth : rien ne peut même être tenté. */
  | "permission"
  /** La radio est coupée. */
  | "eteint"
  /**
   * Le SERVICE de localisation est coupé.
   *
   * En dessous d'Android 12, un scan basse consommation l'exige ALLUMÉ, et pas
   * seulement accordé : seconde panne invisible, qui se lisait jusqu'ici comme
   * une absence d'imprimante.
   */
  | "localisation"
  /** Aucune bibliothèque ni matériel : iOS pour le profil série, le web. */
  | "absente"
  /** L'imprimante n'expose aucune voie d'écriture : ce n'est pas une imprimante. */
  | "voie_introuvable"
  /** La liaison a lâché, ou l'imprimante a refusé les octets. */
  | "ecriture"
  /** Le transport est choisi, mais aucune machine ne l'est. */
  | "aucune_imprimante";

export class ErreurImpression extends Error {
  readonly raison: RaisonEchec;

  constructor(raison: RaisonEchec, message: string) {
    super(message);
    this.name = "ErreurImpression";
    this.raison = raison;
  }
}

/** Le message d'une exception, quelle qu'elle soit, sans jamais lever. */
export function messageDe(e: unknown, repli: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return repli;
}
