/**
 * La casse d'un nom d'article, telle que la carte du comptoir l'affiche.
 *
 * Les marchands saisissent souvent leur catalogue en capitales
 * (« ALDACTONE 25MG 5CES ») : sur une grille de trente cartes, un mur de
 * majuscules se lit mal et chaque nom pèse autant que son voisin. La carte
 * écrit donc « Aldactone 25mg 5ces ».
 *
 * ⚠ C'EST UN AFFICHAGE. La base locale, la recherche, le ticket et le serveur
 * gardent le nom tel que le marchand l'a saisi : on ne réécrit pas une donnée
 * pour la montrer autrement.
 *
 * ⚠ `toLowerCase` ET JAMAIS `toLocaleLowerCase`. La seconde suit la langue du
 * système (« I » devient « ı » en turc), et le moteur Hermes n'embarque pas les
 * données complètes de langue : c'est le piège déjà proscrit pour `Intl`.
 */

/**
 * Ce qui commence un nouveau mot : un blanc, un tiret, une barre, une
 * parenthèse ouvrante. L'apostrophe n'en fait PAS partie : « D'ARGENT » donne
 * « D'argent », comme on l'écrit en français, et non « D'Argent ».
 */
const SEPARATEUR = /[\s\-/(]/;

/** Une lettre, accentuée ou non : seule une lettre prend une majuscule. */
const LETTRE = /\p{L}/u;

export function casseDeTitre(nom: string): string {
  let sortie = "";
  // Vrai au début, et juste après un séparateur.
  let debutDeMot = true;
  for (const caractere of nom.toLowerCase()) {
    if (SEPARATEUR.test(caractere)) {
      sortie += caractere;
      debutDeMot = true;
      continue;
    }
    if (debutDeMot) {
      // Un mot qui commence par un chiffre reste en minuscules : « 25mg »,
      // jamais « 25Mg ». Le premier caractère, quel qu'il soit, clôt le début.
      sortie += LETTRE.test(caractere) ? caractere.toUpperCase() : caractere;
      debutDeMot = false;
      continue;
    }
    sortie += caractere;
  }
  return sortie;
}
