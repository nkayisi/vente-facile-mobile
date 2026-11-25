/**
 * Un fichier local, joint à un corps `multipart/form-data`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS ENVOIS DE FICHIER ÉCHOUAIENT, ET DEUX EN SILENCE.                 │
 * │                                                                          │
 * │ Depuis Expo SDK 57, le `fetch` global est celui d'Expo                   │
 * │ (`expo/src/winter/runtime.native.ts`), plus celui de React Native. Il    │
 * │ REFUSE la forme `{ uri, name, type }` que React Native attendait d'un    │
 * │ fichier : « Unsupported FormDataPart implementation », levé AVANT que la │
 * │ requête parte (`expo/src/winter/fetch/convertFormData.ts`). Rien         │
 * │ n'atteignait donc le serveur :                                           │
 * │ - la photo d'un article prise au terminal (réessayée en silence, jusqu'à │
 * │   l'abandon) ;                                                           │
 * │ - l'import d'un classeur Excel ;                                         │
 * │ - le logo des tickets.                                                   │
 * │ Aucun test ne le voyait : ils remplacent `fetch` par une doublure.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le `fetch` d'Expo lit toute pièce qui expose `bytes()`, et en tire le nom du
 * fichier (`name`) et son type (`type`). C'est ce qu'on lui donne ici.
 *
 * ⚠ Le fichier est lu EN MÉMOIRE : le `fetch` d'Expo assemble de toute façon
 * le corps entier avant l'envoi. Les trois fichiers sont bornés (une photo
 * compressée, un logo de 5 Mo au plus, un classeur).
 *
 * ⚠ Ne pas « réparer » en posant `EXPO_PUBLIC_USE_RN_FETCH` : ce drapeau rend
 * le `fetch` de React Native à TOUTE l'application, synchronisation comprise,
 * pour trois envois.
 */
import { File } from "expo-file-system";

/** La pièce que le `fetch` d'Expo sait sérialiser. */
export interface PieceFichier {
  name: string;
  type: string;
  bytes(): Promise<Uint8Array>;
}

/**
 * La pièce d'un fichier local, à passer à `FormData.append`.
 *
 * Typée `Blob` pour `append`, dont la signature n'accepte rien d'autre :
 * c'est bien une pièce que le `fetch` d'Expo lit, pas un `Blob`.
 */
export function pieceFichier(uri: string, nom: string, type: string): Blob {
  const fichier = new File(uri);
  const piece: PieceFichier = { name: nom, type, bytes: () => fichier.bytes() };
  return piece as unknown as Blob;
}
