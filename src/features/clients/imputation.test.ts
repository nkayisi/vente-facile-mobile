import { imputer, montantAjustement } from "./imputation";

const f = (reference: string, resteAPayer: number) => ({ reference, resteAPayer });

describe("imputation d'un règlement", () => {
  it("solde les factures les plus anciennes d'abord", () => {
    // L'ordre du tableau EST l'ordre d'imputation du serveur : la plus vieille
    // dette d'abord. Un tri différent ferait diverger l'annonce du résultat.
    const r = imputer(150, [f("VT-1", 100), f("VT-2", 100)]);
    expect(r.soldees).toEqual(["VT-1"]);
    expect(r.partielle).toBe("VT-2");
    expect(r.avance).toBe(0);
  });

  it("solde plusieurs factures d'un seul versement", () => {
    const r = imputer(250, [f("VT-1", 100), f("VT-2", 100), f("VT-3", 100)]);
    expect(r.soldees).toEqual(["VT-1", "VT-2"]);
    expect(r.partielle).toBe("VT-3");
  });

  it("le reliquat devient une avance", () => {
    const r = imputer(250, [f("VT-1", 100), f("VT-2", 100)]);
    expect(r.soldees).toEqual(["VT-1", "VT-2"]);
    expect(r.partielle).toBeNull();
    expect(r.avance).toBe(50);
  });

  it("sans aucune facture ouverte, tout part en avance", () => {
    const r = imputer(80, []);
    expect(r.soldees).toEqual([]);
    expect(r.partielle).toBeNull();
    expect(r.avance).toBe(80);
  });

  it("une facture au reste nul est SAUTÉE, pas comptée comme soldée", () => {
    // Le serveur la saute (`if locked.amount_due <= 0: continue`). La compter
    // ferait lire au caissier une facture réglée qui ne l'a pas été.
    const r = imputer(100, [f("VT-DEJA", 0), f("VT-1", 100)]);
    expect(r.soldees).toEqual(["VT-1"]);
  });

  it("un centième résiduel ne fabrique pas une facture partielle", () => {
    // 3 × 33,33 laisse 0,01 sur une conversion : sans tolérance, l'écran
    // annoncerait « solde partiellement VT-3 » pour un montant que personne
    // ne peut remettre.
    const r = imputer(99.99, [f("VT-1", 33.33), f("VT-2", 33.33), f("VT-3", 33.33)]);
    expect(r.soldees).toEqual(["VT-1", "VT-2", "VT-3"]);
    expect(r.partielle).toBeNull();
    expect(r.avance).toBe(0);
  });

  it("un versement nul n'impute rien", () => {
    const r = imputer(0, [f("VT-1", 100)]);
    expect(r).toEqual({ soldees: [], partielle: null, avance: 0 });
  });
});

describe("signe d'un ajustement", () => {
  it("le sens décide, la saisie ne fait qu'apporter une valeur", () => {
    expect(montantAjustement("augmenter", 500)).toBe(500);
    expect(montantAjustement("reduire", 500)).toBe(-500);
  });

  it("une saisie déjà signée n'inverse PAS l'opération", () => {
    // C'est le cas qui motive la fonction : « -500 » tapé dans « augmenter »
    // aurait réduit la dette, et le reçu serait sorti juste.
    expect(montantAjustement("augmenter", -500)).toBe(500);
    expect(montantAjustement("reduire", -500)).toBe(-500);
  });
});
