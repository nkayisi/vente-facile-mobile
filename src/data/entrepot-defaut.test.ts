import { entrepotParDefaut } from "./entrepot-defaut";

const e = (id: string, parDefaut = false, actif = true) => ({ id, parDefaut, actif });

describe("entrepôt proposé par défaut", () => {
  it("retient l'entrepôt marqué PAR DÉFAUT", () => {
    expect(entrepotParDefaut([e("a"), e("b", true), e("c")])).toBe("b");
  });

  it("retient l'unique entrepôt quand il n'y en a qu'un", () => {
    // Faire taper sur la seule option possible est une friction sans
    // contrepartie, et la plupart des marchands visés n'ont qu'un dépôt.
    expect(entrepotParDefaut([e("a")])).toBe("a");
  });

  it("ne choisit RIEN entre plusieurs dépôts sans principal", () => {
    // Choisir à la place du magasinier ferait sortir du stock du mauvais
    // endroit, et il ne s'en apercevrait qu'à l'inventaire suivant.
    expect(entrepotParDefaut([e("a"), e("b")])).toBeNull();
  });

  it("ignore les entrepôts inactifs", () => {
    expect(entrepotParDefaut([e("a", false, false), e("b")])).toBe("b");
    expect(entrepotParDefaut([e("a", true, false), e("b")])).toBe("b");
  });

  it("une liste vide ou absente ne choisit rien", () => {
    expect(entrepotParDefaut([])).toBeNull();
    expect(entrepotParDefaut(null)).toBeNull();
  });
});
