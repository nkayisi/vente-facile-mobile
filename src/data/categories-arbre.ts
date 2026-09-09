/**
 * Le sous-arbre d'une catégorie, miroir de `Category.subtree_ids` du serveur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ FILTRER SUR « BOISSONS » DOIT RAMENER « BOISSONS > SODAS ».              │
 * │                                                                          │
 * │ Le serveur filtre sur le sous-arbre entier (`CategorySubtreeFilter`), et │
 * │ l'en-tête de ses documents l'écrit : « Boissons (sous-catégories         │
 * │ incluses) ». Ne prendre que la catégorie choisie ferait montrer à        │
 * │ l'écran MOINS de lignes que le document n'en porte - une sous-estimation │
 * │ silencieuse, plus difficile à voir qu'une erreur.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : la lecture en base vit dans `data/categories.ts`.
 */

export interface NoeudCategorie {
  id: string;
  parentId: string | null;
}

/**
 * La catégorie et TOUTE sa descendance.
 *
 * ⚠ Une racine INCONNUE rend `[racine]`, jamais `[]`. Le serveur fait de même,
 * et surtout : un tableau vide se traduirait en « aucun filtre », donc en un
 * périmètre ÉLARGI là où l'on en demandait un plus étroit. Une catégorie
 * supprimée entre deux tirages doit rendre une liste vide, pas tout le stock.
 *
 * Le parcours est borné par le jeu des identifiants déjà vus : une hiérarchie
 * accidentellement cyclique ralentit, elle ne boucle pas. La donnée vient du
 * serveur, mais une base locale ne se répare pas au comptoir.
 */
export function sousArbre(
  categories: NoeudCategorie[],
  racine: string | null
): string[] | null {
  if (!racine) return null;

  // Un index par parent : sans lui, le parcours est quadratique et le
  // catalogue d'un grossiste porte des centaines de catégories.
  const enfants = new Map<string, string[]>();
  for (const c of categories) {
    if (!c.parentId) continue;
    const fratrie = enfants.get(c.parentId);
    if (fratrie) fratrie.push(c.id);
    else enfants.set(c.parentId, [c.id]);
  }

  const vus = new Set<string>([racine]);
  const aVisiter = [racine];
  while (aVisiter.length > 0) {
    const courant = aVisiter.shift() as string;
    for (const enfant of enfants.get(courant) ?? []) {
      if (vus.has(enfant)) continue;
      vus.add(enfant);
      aVisiter.push(enfant);
    }
  }
  return [...vus];
}
