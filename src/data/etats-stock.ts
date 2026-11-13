/**
 * Les trois états d'un rayon, et leur ton.
 *
 * Module PUR, et c'est le motif de l'extraction : ils vivaient dans
 * `data/stock-niveaux`, qui ouvre la base SQLite au chargement. Tout module qui
 * veut seulement NOMMER un état - la traduction pour le serveur, son test -
 * embarquait donc une base de données et devenait intestable hors appareil.
 * C'est le déplacement déjà fait pour `data/statuts-vente` et
 * `data/types-mouvement`.
 *
 * ⚠ Ils sont EXCLUSIFS et partitionnent le stock, là où `low` et `available`
 * du serveur se recouvrent. Voir `features/stock/statut-stock.ts`.
 */

/** Les trois états du back-office, mot pour mot. */
export type EtatStock = "tous" | "bas" | "rupture" | "ok";

/**
 * Un FILTRE de la liste, qui n'est pas un état de rayon : « à
 * réapprovisionner », c'est-à-dire l'ALERTE du serveur (`low` :
 * `quantity <= reorder_point`, produit suivi), ruptures comprises.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA TUILE « STOCK BAS » DU TABLEAU DE BORD MENAIT À UNE AUTRE LISTE.     │
 * │                                                                          │
 * │ Elle compte comme le serveur, et c'est voulu : le back-office affiche    │
 * │ le même chiffre au même endroit, vérifié chiffre par chiffre. Mais elle  │
 * │ ouvrait `/rayon?etat=bas`, où « bas » est un état EXCLUSIF de la         │
 * │ rupture : on tapait sur « 2 » pour arriver sur une liste vide. Un relevé │
 * │ doit compter ce que sa destination montre - la destination devient donc │
 * │ ce filtre, et son document sort sous `low`, le même ensemble.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Il n'a pas de puce propre : on y arrive depuis une alerte, et la puce n'est
 * affichée que tant qu'il est actif - un filtre posé doit se voir, et se
 * retirer.
 */
export type FiltreEtatStock = EtatStock | "alerte";

export const ETAT_STOCK: Record<
  Exclude<EtatStock, "tous">,
  { label: string; ton: "destructive" | "warning" | "success" }
> = {
  rupture: { label: "Rupture", ton: "destructive" },
  bas: { label: "Stock bas", ton: "warning" },
  ok: { label: "En stock", ton: "success" },
};

/** Ce qu'il faut savoir d'un rayon pour le ranger. */
export interface RayonAClasser {
  /** Total en unité de détail. */
  total: number;
  /** Point de réapprovisionnement du produit. Zéro : aucun seuil posé. */
  seuil: number;
  /** `Product.track_inventory` : le stock de ce produit est-il suivi ? */
  suitLeStock: boolean;
}

/**
 * Range un rayon dans UNE case.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MIROIR STRICT DE `StockFilter.filter_status`, `low_only` ET `healthy`.  │
 * │                                                                          │
 * │ Le serveur exige `product__track_inventory=True` dans son `sous_le_seuil`│
 * │ ; le terminal l'omettait. Un produit non suivi qui a gardé un            │
 * │ `reorder_point` s'affichait donc « Stock bas » à l'écran et sortait en   │
 * │ « En stock » dans le document, et réciproquement : la liste et le fichier│
 * │ qu'elle déclenche ne portaient pas les mêmes lignes, dans les deux sens. │
 * │                                                                          │
 * │ Et cette lecture était écrite DEUX FOIS dans `data/stock-niveaux`, à     │
 * │ côté de la condition SQL : trois copies d'une même règle, dont la        │
 * │ divergence ne se voit sur aucun écran. D'où ce point unique.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le seuil est INCLUSIF (`quantity <= reorder_point`), et un seuil à zéro ne
 * déclenche rien : un produit sans point de réapprovisionnement n'est jamais
 * « bas », il est simplement suivi.
 */
export function etatDuRayon(r: RayonAClasser): Exclude<EtatStock, "tous"> {
  if (r.total <= 0) return "rupture";
  // La rupture, elle, ne regarde QUE la quantité : `out` du serveur ne teste
  // pas `track_inventory`, et un rayon vide est vide qu'on le suive ou non.
  if (r.suitLeStock && r.seuil > 0 && r.total <= r.seuil) return "bas";
  return "ok";
}
