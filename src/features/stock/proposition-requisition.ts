/**
 * Ce qu'il faut acheter : la règle, et elle seule.
 *
 * Module PUR, et c'est le motif habituel : `data/requisitions` et
 * `data/stock-niveaux` ouvrent la base SQLite au chargement, donc une règle
 * écrite là-bas ne serait éprouvable sur aucune machine sans appareil. Or une
 * proposition fausse ne lève rien - elle fait acheter ce qui ne manque pas, ou
 * tait ce qui manque.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MIROIR DE `lignes_proposees` (apps/purchases/services.py), QUI EST       │
 * │ LUI-MÊME LE CRITÈRE DE `check_low_stock_alerts`.                        │
 * │                                                                          │
 * │   track_inventory ET reorder_point > 0 ET quantity <= reorder_point      │
 * │                                                                          │
 * │ Trois conditions, et il faut les trois. Un second critère écrit ici      │
 * │ ferait proposer au terminal des articles que le back-office ne propose    │
 * │ pas, et deux surfaces diraient deux choses du même rayon.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Ce qu'il faut savoir d'un rayon pour juger s'il manque. */
export interface RayonProposable {
  produitId: string;
  produit: string;
  sku: string | null;
  unite: string | null;
  /** Total en unités de détail, tel que le rayon le porte. */
  total: number;
  /** Lecture en contenants : « 3 casiers + 7 bouteilles ». */
  quantiteAffichee: string;
  seuilReassort: number;
  /** `Product.track_inventory`. */
  suitLeStock: boolean;
}

export interface LigneProposee {
  produitId: string;
  produit: string;
  sku: string | null;
  unite: string | null;
  stock: number;
  stockAffiche: string;
  seuil: number;
  /**
   * Ce qu'il faudrait acheter pour remonter AU seuil.
   *
   * ⚠ UNE PROPOSITION, PAS UNE DÉCISION. Le magasinier corrige, et c'est le
   * cas ordinaire : il sait qu'un carton en contient vingt-quatre, et que le
   * fournisseur ne vend pas à l'unité. Lui imposer la quantité ferait acheter
   * trois bouteilles là où il faut un casier.
   *
   * Le serveur calcule la même chose (`suggested`), et pour la même raison :
   * les deux surfaces doivent partir du même chiffre.
   */
  suggere: number;
}

/**
 * Range les rayons qui manquent, du plus urgent au moins.
 *
 * ⚠ LA RUPTURE SE RANGE PLUS LARGEMENT QU'ELLE NE SE PROPOSE. `etatDuRayon`
 * met un rayon vide en « rupture » SANS regarder le suivi ni le seuil - c'est
 * juste pour l'affichage, `out` du serveur ne les teste pas non plus - alors
 * que la proposition exige les trois conditions. Sans ce filtre, un article
 * non suivi à zéro serait proposé ici et pas là-bas.
 */
export function proposerDepuisRayons(
  rayons: RayonProposable[],
  opts: { rupturesSeules?: boolean } = {}
): LigneProposee[] {
  const retenus = rayons.filter(
    (r) =>
      r.suitLeStock &&
      r.seuilReassort > 0 &&
      r.total <= r.seuilReassort &&
      (!opts.rupturesSeules || r.total <= 0)
  );

  // Dédoublonné par ARTICLE : un rayon ne peut figurer qu'une fois dans une
  // demande, et deux lignes du même article donneraient deux instantanés de
  // stock contradictoires sur le même document.
  const par = new Map<string, LigneProposee>();
  for (const r of retenus) {
    if (par.has(r.produitId)) continue;
    par.set(r.produitId, {
      produitId: r.produitId,
      produit: r.produit,
      sku: r.sku,
      unite: r.unite,
      stock: r.total,
      stockAffiche: r.quantiteAffichee,
      seuil: r.seuilReassort,
      // Jamais négatif : un rayon au-dessus de son seuil n'est pas proposé du
      // tout, et un `Math.max` protège du cas limite où il y est exactement.
      suggere: Math.max(r.seuilReassort - r.total, 0),
    });
  }

  return [...par.values()].sort((a, b) => {
    // Le plus urgent d'abord : un rayon VIDE passe devant un rayon bas, quel
    // que soit son nom. C'est l'ordre dans lequel on fait ses courses.
    const videA = a.stock <= 0 ? 0 : 1;
    const videB = b.stock <= 0 ? 0 : 1;
    if (videA !== videB) return videA - videB;
    return a.produit.localeCompare(b.produit, "fr");
  });
}
