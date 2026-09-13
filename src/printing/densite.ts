/**
 * La densité d'impression de l'imprimante intégrée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MODULE PUR, ET C'EST OBLIGATOIRE.                                       │
 * │                                                                          │
 * │ `preferences.ts` importe `@/db/client`, qui OUVRE la base SQLite au      │
 * │ chargement : une règle écrite là-bas ne serait pas éprouvable sans       │
 * │ appareil. Or celle-ci décide de ce qu'on envoie au service, et une       │
 * │ valeur hors plage est refusée EN SILENCE - indiscernable d'un service    │
 * │ trop ancien, puisque l'appel est tolérant par nécessité.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Au-dessus du milieu de plage, et valide sur les DEUX largeurs.
 *
 * C'est un défaut qui améliore le papier de tous les terminaux sans réglage,
 * là où « ne rien envoyer » - le comportement d'avant - laissait chacun à la
 * valeur qu'avait posée le constructeur.
 */
export const DENSITE_PAR_DEFAUT = 110;

/**
 * Les densités que le service accepte, par largeur.
 *
 * Valeurs de l'AIDL du constructeur, recopiées et non déduites : 58 mm descend
 * à 80, 80 mm s'arrête à 100. Une valeur hors plage est REFUSÉE par le service.
 */
export const DENSITES: Record<58 | 80, number[]> = {
  58: [80, 90, 100, 110, 120, 130],
  80: [100, 110, 120, 130],
};

/**
 * La densité, bornée à ce que cette largeur accepte.
 *
 * Le réglage survit à un changement de largeur : un terminal posé à 80 puis
 * passé en 80 mm porterait sinon une valeur que le service refuse, et
 * l'impression sortirait à la densité d'usine sans que rien ne le dise.
 */
export function densiteValide(densite: number, paperWidth: 58 | 80): number {
  const plage = DENSITES[paperWidth];
  if (plage.includes(densite)) return densite;
  // La plus proche, jamais la plus haute : on ne noircit pas plus qu'on ne l'a
  // demandé, et on ne retombe pas au minimum d'un réglage qui visait le haut.
  return plage.reduce((a, b) => (Math.abs(b - densite) < Math.abs(a - densite) ? b : a));
}
