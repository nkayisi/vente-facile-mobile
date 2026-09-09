import { etatDuRayon, ETAT_STOCK, type EtatStock } from "./etats-stock";

describe("l'état d'un rayon", () => {
  it("range en RUPTURE dès que rien ne reste", () => {
    expect(etatDuRayon({ total: 0, seuil: 10, suitLeStock: true })).toBe("rupture");
    expect(etatDuRayon({ total: -3, seuil: 10, suitLeStock: true })).toBe("rupture");
  });

  it("range en BAS sous un seuil RÉEL", () => {
    expect(etatDuRayon({ total: 4, seuil: 10, suitLeStock: true })).toBe("bas");
    // Le seuil est inclusif, comme `quantity__lte=F('product__reorder_point')`.
    expect(etatDuRayon({ total: 10, seuil: 10, suitLeStock: true })).toBe("bas");
  });

  it("ne range JAMAIS en bas un produit sans seuil", () => {
    // Un seuil à zéro ne déclenche rien : le produit est suivi, pas alerté.
    expect(etatDuRayon({ total: 1, seuil: 0, suitLeStock: true })).toBe("ok");
  });

  it("ne range PAS en bas un produit dont on ne suit pas le stock", () => {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ LE DÉFAUT QUE CE TEST FERME.                                     │
    // │                                                                  │
    // │ `low_only` et `healthy` du serveur exigent tous deux             │
    // │ `product__track_inventory=True` dans leur `sous_le_seuil`. Un    │
    // │ produit non suivi qui a gardé un `reorder_point` s'affichait     │
    // │ donc « Stock bas » à l'écran et sortait en « En stock » dans le  │
    // │ document - dans les DEUX sens, sur le même écran.                │
    // └──────────────────────────────────────────────────────────────────┘
    expect(etatDuRayon({ total: 4, seuil: 10, suitLeStock: false })).toBe("ok");
    // Mais une rupture reste une rupture : `out` du serveur ne regarde que la
    // quantité, et un rayon vide est vide qu'on le suive ou non.
    expect(etatDuRayon({ total: 0, seuil: 10, suitLeStock: false })).toBe("rupture");
  });

  it("PARTITIONNE : tout rayon tombe dans une case, et une seule", () => {
    // C'est l'invariant que le serveur tient de son côté
    // (`out` ∪ `low_only` ∪ `healthy`). S'il se rompait, un rayon
    // disparaîtrait de tous les documents à la fois.
    const cases = Object.keys(ETAT_STOCK) as Exclude<EtatStock, "tous">[];
    for (const total of [-5, 0, 1, 4, 10, 11, 500]) {
      for (const seuil of [0, 10]) {
        for (const suitLeStock of [true, false]) {
          const etat = etatDuRayon({ total, seuil, suitLeStock });
          expect(cases).toContain(etat);
        }
      }
    }
  });
});
