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

export interface Rangee<T> {
  item: T;
  profondeur: number;
}

/**
 * Les noeuds à plat, dans l'ordre d'un parcours d'arbre.
 *
 * « Sodas » doit apparaître SOUS « Boissons » : une liste alphabétique plate
 * les séparerait, et le marchand ne verrait pas que l'une contient l'autre.
 *
 * L'ORDRE D'ENTRÉE EST CONSERVÉ dans une fratrie : c'est à l'appelant de
 * trier, et il trie comme le serveur (`Category.Meta.ordering`).
 *
 * ⚠ Un noeud dont le parent a disparu revient en FIN de liste, à la profondeur
 * zéro. Le perdre le rendrait inatteignable sans que rien ne le signale, et
 * c'est un cas ordinaire : le parent peut avoir été supprimé entre deux
 * tirages. Le parcours est borné par les identifiants déjà vus, si bien qu'une
 * hiérarchie accidentellement cyclique ralentit sans boucler.
 */
export function ordreArbre<T extends NoeudCategorie>(noeuds: T[]): Rangee<T>[] {
  const enfants = new Map<string | null, T[]>();
  for (const n of noeuds) {
    const cle = n.parentId ?? null;
    const fratrie = enfants.get(cle);
    if (fratrie) fratrie.push(n);
    else enfants.set(cle, [n]);
  }

  const rendu: Rangee<T>[] = [];
  const vus = new Set<string>();
  const descendre = (parent: string | null, profondeur: number) => {
    for (const n of enfants.get(parent) ?? []) {
      if (vus.has(n.id)) continue;
      vus.add(n.id);
      rendu.push({ item: n, profondeur });
      descendre(n.id, profondeur + 1);
    }
  };
  descendre(null, 0);

  for (const n of noeuds) {
    if (!vus.has(n.id)) rendu.push({ item: n, profondeur: 0 });
  }
  return rendu;
}
