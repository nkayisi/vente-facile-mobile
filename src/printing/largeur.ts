/**
 * Quelle largeur employer, une fois le transport RÉELLEMENT retenu connu.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MODULE PUR, ET C'EST OBLIGATOIRE.                                       │
 * │                                                                          │
 * │ `index.ts` importe les pilotes, donc `preferences.ts`, donc              │
 * │ `@/db/client`, qui OUVRE la base SQLite au chargement : une règle écrite │
 * │ là-bas n'est pas éprouvable sans appareil. Or celle-ci décide de la      │
 * │ largeur pour laquelle le ticket est DESSINÉ, et s'en tromper ne lève     │
 * │ rien - le service de l'imprimante rogne en silence, et le marchand       │
 * │ découvre au comptoir un ticket décalé dont la colonne des montants a     │
 * │ disparu.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA LARGEUR DU PAPIER EST AU MARCHAND, ET IL N'Y A PAS D'AUTRE AUTORITÉ. │
 * │                                                                          │
 * │ Ce module a un temps borné la largeur par ce que la machine             │
 * │ « acceptait » : `setPaperWidth(576)` refusé devait signer une tête de    │
 * │ 58 mm. Mesuré sur le NB55, il rend 0 - c'est un RÉGLAGE de ce qui est    │
 * │ chargé, pas une question sur la machine, et l'AIDL le dit en toutes      │
 * │ lettres (« Primarily used for printing 58mm paper on 80mm printer »). Le │
 * │ papier chargé n'est la propriété d'aucun matériel.                       │
 * │                                                                          │
 * │ Ce qui protège le ticket n'est donc pas ici : c'est l'écran Imprimante,  │
 * │ où la largeur ne se change plus d'un appui et où le choix dit ce qu'il   │
 * │ engage, et la règle de calibration, seule à pouvoir le vérifier.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { PiloteImpression } from "./driver";
import type { ReglageImprimante } from "./reglage";

/**
 * La largeur à employer, une fois le transport RÉELLEMENT retenu connu.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA LARGEUR DÉCRIT UN ROULEAU, DONC UNE MACHINE PRÉCISE.                 │
 * │                                                                          │
 * │ Le réglage dit « Bluetooth, 80 mm ». Le Bluetooth est éteint, on retombe │
 * │ sur l'imprimante intégrée du terminal, qui est une 58 mm : une page      │
 * │ dessinée pour 80 puis rastérisée sur 576 points arrive à une tête qui en │
 * │ chauffe 384, et le service la rogne sans qu'aucun code de retour ne le   │
 * │ dise. Le seul indice est le nom du transport dans un toast.              │
 * │                                                                          │
 * │ Quand le transport retenu n'est PAS celui qui a été réglé, on retient    │
 * │ donc la largeur la plus étroite : une mise en page de 58 sur un rouleau  │
 * │ de 80 laisse une marge, l'inverse ampute des montants. Le PDF, lui,      │
 * │ garde la largeur réglée - ce n'est pas une machine, et c'est la seule    │
 * │ intention que le marchand ait exprimée.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function largeurPour(
  pilote: PiloteImpression,
  reglage: ReglageImprimante
): 58 | 80 {
  if (pilote.id === "pdf" || pilote.id === reglage.transport) return reglage.paperWidth;
  return 58;
}
