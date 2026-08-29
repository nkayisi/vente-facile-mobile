/**
 * Tirage ciblé, après une écriture en ligne.
 *
 * **On n'écrit JAMAIS dans une table tirée depuis la réponse d'une écriture.**
 * C'est la règle §5.3.6, et c'est le point le plus facile à rater : la
 * tentation est d'appliquer localement ce qu'on vient d'envoyer, pour un rendu
 * instantané. Le serveur fait autorité sans exception ; on lui redemande la
 * table, et la vue se met à jour d'elle-même par `useLecture`.
 */
import { fetchManifest, pullTable } from "@/sync";

export async function tirerTables(noms: string[]): Promise<void> {
  const manifeste = await fetchManifest();
  for (const nom of noms) {
    const spec = manifeste.tables.find((t) => t.name === nom);
    // Une table absente du manifeste n'est pas une erreur ici : le serveur
    // décide de ce qu'il expose, et un nom obsolète ne doit pas faire échouer
    // un enregistrement qui, lui, a réussi.
    if (spec) await pullTable(spec);
  }
}
