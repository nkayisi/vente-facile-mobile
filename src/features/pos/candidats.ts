/**
 * Chercher les codes candidats d'un scan, dans l'ordre.
 *
 * Module PUR : la recherche est INJECTÉE (au comptoir, la base locale), pour
 * que l'ordre s'éprouve sans base.
 */

/**
 * Le premier candidat trouvé l'emporte. Sinon, le DERNIER essayé est rendu
 * comme introuvable : c'est lui que le web nomme, et c'est le plus complet (le
 * champ entier plutôt qu'une rafale tronquée en tête).
 */
export async function chercherLesCandidats<A>(
  candidats: string[],
  chercher: (code: string) => Promise<A | null>
): Promise<{ article: A } | { introuvable: string } | null> {
  let dernier: string | null = null;
  for (const code of candidats) {
    dernier = code;
    const article = await chercher(code);
    if (article) return { article };
  }
  return dernier ? { introuvable: dernier } : null;
}
