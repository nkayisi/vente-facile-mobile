import {
  composerBordereau,
  filtrerAffichage,
  ligneAjoutee,
  lignesRetenues,
  nombreDeRefus,
  refusDeLigne,
  type LigneRequise,
} from "./bordereau-requisition";
import type { LigneProposee } from "./proposition-requisition";

const proposee = (id: string, suggere = 10): LigneProposee =>
  ({
    produitId: id,
    produit: id,
    sku: `SKU-${id}`,
    unite: null,
    stock: 2,
    stockAffiche: "2",
    seuil: 12,
    suggere,
  }) as LigneProposee;

const lait = ligneAjoutee({ produit: "lait", nom: "Lait", sku: null, unite: null, stockAffiche: "Aucun stock ici" });

describe("le bordereau d'une réquisition, au terminal", () => {
  it("la proposition arrive cochée, à sa suggestion", () => {
    const [l] = composerBordereau([proposee("savon", 8)], []);
    expect(l).toMatchObject({ retenue: true, saisie: "8", quantite: 8, ajoutee: false });
  });

  it("la saisie prime sur la proposition relue", () => {
    const corrigee: LigneRequise = { ...composerBordereau([proposee("savon")], [])[0], saisie: "24", quantite: 24 };
    expect(composerBordereau([proposee("savon")], [corrigee])[0].saisie).toBe("24");
  });

  it("un article ajouté reste quand la proposition change", () => {
    expect(composerBordereau([], [lait]).map((l) => l.produit)).toEqual(["lait"]);
  });

  /**
   * Le défaut d'origine : le bordereau était bâti sur la liste FILTRÉE, et une
   * ligne masquée par la recherche ne partait pas.
   */
  it("une ligne masquée par la recherche part quand même", () => {
    const bordereau = composerBordereau([proposee("savon"), proposee("riz")], []);
    expect(filtrerAffichage(bordereau, "riz").map((l) => l.produit)).toEqual(["riz"]);
    expect(lignesRetenues(bordereau).map((l) => l.produit)).toEqual(["savon", "riz"]);
  });

  it("un article ajouté attend sa quantité : il ne part pas vide", () => {
    expect(lignesRetenues([lait])).toEqual([]);
  });

  it("une saisie illisible cochée retient l'envoi ; décochée, non", () => {
    expect(refusDeLigne({ ...lait, saisie: "12,5,0" })).toBe("illisible");
    expect(refusDeLigne({ ...lait, saisie: "-2" })).toBe("negatif");
    expect(refusDeLigne({ ...lait, saisie: "12,5,0", retenue: false })).toBeNull();
    expect(nombreDeRefus([{ ...lait, saisie: "abc" }, lait])).toBe(1);
  });

  it("« 12 500 » et « 2,5 » se lisent", () => {
    const ok = lignesRetenues([
      { ...lait, produit: "a", saisie: "12 500" },
      { ...lait, produit: "b", saisie: "2,5" },
    ]);
    expect(ok.map((l) => l.produit)).toEqual(["a", "b"]);
  });
});
