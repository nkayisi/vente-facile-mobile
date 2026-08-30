/**
 * Fabrication d'un `slug`.
 *
 * Module PUR, sans base de données : c'est ce qui le rend testable, et il doit
 * l'être. Le serveur EXIGE un `slug` sur une catégorie et une marque, et ne le
 * dérive pas ; le fabriquer mal produit un refus DÉTERMINISTE, donc une
 * quarantaine - et la saisie ayant eu lieu hors ligne, le magasinier ne verra
 * ce refus que bien plus tard.
 */

/**
 * Dérive un identifiant d'URL depuis un nom.
 *
 * Le serveur EXIGE un `slug` sur une catégorie et une marque, et ne le dérive
 * pas. Le formulaire web le fabrique de son côté ; le faire dans le
 * gestionnaire de synchronisation en ferait une règle métier de plus, à tenir
 * en phase avec celle du web. On le fabrique donc ici, où la saisie a lieu.
 *
 * Les accents tombent : un `slug` doit rester lisible dans une URL, et le
 * catalogue est majoritairement en français.
 */
export function slugifier(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
