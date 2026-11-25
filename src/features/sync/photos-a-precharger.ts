/**
 * Quelles photos précharger : la décision, pure et testée.
 *
 * Voir `photos-prechargees.ts` pour le préchargement lui-même.
 */

/**
 * Les adresses à précharger : distinctes, distantes (`http`, `https`), et pas
 * encore chargées pendant ce lancement.
 *
 * ⚠ Une photo LOCALE (`file://`, prise sur ce terminal et pas encore envoyée)
 * n'a rien à télécharger : elle est déjà sur le disque.
 */
export function photosAPrecharger(
  adresses: readonly (string | null | undefined)[],
  deja: ReadonlySet<string>
): string[] {
  const vues = new Set<string>();
  const sortie: string[] = [];
  for (const brute of adresses) {
    const a = brute?.trim();
    if (!a || !/^https?:\/\//i.test(a)) continue;
    if (deja.has(a) || vues.has(a)) continue;
    vues.add(a);
    sortie.push(a);
  }
  return sortie;
}

/** Découpe en lots de `taille`, pour ne pas lancer mille téléchargements à la fois. */
export function parLots<T>(elements: readonly T[], taille: number): T[][] {
  const pas = Math.max(1, taille);
  const lots: T[][] = [];
  for (let i = 0; i < elements.length; i += pas) {
    lots.push(elements.slice(i, i + pas));
  }
  return lots;
}
