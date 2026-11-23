import {
  AVIS_AUTRE_ARTICLE,
  inscrireSelecteur,
  rescanDansLaSaisie,
  selecteurOuvert,
} from "./selecteur-actif";

function selecteur(article: { barcode?: string | null; sku?: string | null }) {
  const gestes = { plusUn: 0, autre: 0 };
  const retirer = inscrireSelecteur({
    article,
    ajouterUn: () => {
      gestes.plusUn += 1;
    },
    signalerAutre: () => {
      gestes.autre += 1;
    },
  });
  return { gestes, retirer };
}

describe("un re-scan pendant la saisie de quantité", () => {
  it("aucune saisie ouverte : le scan suit son chemin habituel", () => {
    expect(selecteurOuvert()).toBeNull();
    expect(rescanDansLaSaisie(["600123"])).toBeNull();
  });

  it("le même article ajoute un, par code-barres comme par SKU", () => {
    const { gestes, retirer } = selecteur({ barcode: "600123", sku: "ART-1" });
    expect(rescanDansLaSaisie(["600123"])).toBe("plus_un");
    expect(rescanDansLaSaisie(["art-1"])).toBe("plus_un");
    expect(gestes).toEqual({ plusUn: 2, autre: 0 });
    retirer();
  });

  it("un autre article est signalé, sans rien ajouter", () => {
    const { gestes, retirer } = selecteur({ barcode: "600123" });
    expect(rescanDansLaSaisie(["999"])).toBe("autre");
    expect(gestes).toEqual({ plusUn: 0, autre: 1 });
    retirer();
  });

  it("une fois fermée, la saisie ne reçoit plus rien", () => {
    const { gestes, retirer } = selecteur({ barcode: "600123" });
    retirer();
    expect(rescanDansLaSaisie(["600123"])).toBeNull();
    expect(gestes.plusUn).toBe(0);
  });

  it("une saisie remplacée ne retire pas celle qui l'a remplacée", () => {
    const premiere = selecteur({ barcode: "111" });
    const seconde = selecteur({ barcode: "222" });
    premiere.retirer();
    expect(rescanDansLaSaisie(["222"])).toBe("plus_un");
    expect(seconde.gestes.plusUn).toBe(1);
    seconde.retirer();
  });

  it("l'avis est celui du web, mot pour mot", () => {
    expect(AVIS_AUTRE_ARTICLE).toBe("Un autre article a été scanné : terminez d'abord cette saisie.");
  });
});
