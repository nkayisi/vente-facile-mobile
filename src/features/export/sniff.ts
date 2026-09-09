/**
 * Reconnaître un corps d'erreur dans les premiers octets d'un fichier.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `downloadFileAsync` NE LÈVE PAS SUR UN 4xx : IL ÉCRIT L'ERREUR DANS LE  │
 * │ FICHIER.                                                                 │
 * │                                                                          │
 * │ Sans contrôle, le marchand partage un « PDF » de quarante octets         │
 * │ contenant du JSON, ou une page de débogage Django - illisible dans son   │
 * │ lecteur, et qui ne dit pas ce qui a échoué.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR, et sur des OCTETS. Deux raisons, et il faut les deux :
 *
 * 1. **La lecture doit être BORNÉE.** Le contrôle précédent appelait
 *    `textSync()`, qui charge le fichier ENTIER pour en regarder deux cents
 *    octets - le coût mémoire exact que le téléchargement en flux a été choisi
 *    pour éviter. Un classeur de plusieurs mégaoctets le payait à chaque
 *    export.
 * 2. **`TextDecoder` n'est pas garanti sous Hermes** (voir `api/jwt.ts`) : on
 *    ne décode donc rien pour classer, on compare des octets. Le décodage est
 *    laissé au seul chemin où le corps est petit ET connu pour être du texte.
 */

/** Ce que les premiers octets disent du fichier. */
export type NatureDuFichier = "document" | "json" | "html";

const ESPACE = new Set([0x20, 0x09, 0x0a, 0x0d]);
const BOM = [0xef, 0xbb, 0xbf];

/**
 * Classe un fichier sur ses premiers octets.
 *
 * `document` par défaut, et c'est délibéré : ne rien reconnaître n'est pas une
 * erreur. Bloquer un téléchargement légitime parce qu'on n'a pas su le
 * renifler serait pire que le défaut qu'on ferme.
 *
 * Le HTML est reconnu au même titre que le JSON : une page de débogage Django,
 * un 502 de proxy inverse et un portail captif d'hôtel arrivent tous par là, et
 * seul `{` était testé.
 */
export function classerEnTete(octets: Uint8Array): NatureDuFichier {
  let i = 0;
  // Un BOM UTF-8 précède parfois un corps JSON : le sauter, sinon on classerait
  // en `document` une erreur parfaitement lisible.
  if (BOM.every((b, k) => octets[k] === b)) i = BOM.length;
  while (i < octets.length && ESPACE.has(octets[i])) i += 1;

  const premier = octets[i];
  if (premier === 0x7b /* { */ || premier === 0x5b /* [ */) return "json";
  if (premier === 0x3c /* < */) return "html";
  return "document";
}
