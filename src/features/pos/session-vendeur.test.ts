import { peutVendreSur, refusDOuverture } from "./session-vendeur";

describe("peutVendreSur", () => {
  it("un caissier encaisse sur SA session", () => {
    expect(peutVendreSur("u-caisse", { id: "u-caisse", role: "cashier" })).toBe(true);
  });

  it("un caissier n'encaisse PAS sur la session d'un autre", () => {
    // Le serveur refuserait la vente après le ticket : `session_d_un_autre`.
    expect(peutVendreSur("u-patron", { id: "u-caisse", role: "cashier" })).toBe(false);
  });

  it("le propriétaire et le gérant non plus, et c'est le changement", () => {
    // Leurs ventes entraient dans un tiroir qu'ils ne comptaient pas : le Z du
    // caissier annonçait un excédent qu'il n'avait pas encaissé.
    expect(peutVendreSur("u-caisse", { id: "u-patron", role: "owner" })).toBe(false);
    expect(peutVendreSur("u-caisse", { id: "u-gerant", role: "manager" })).toBe(false);
    expect(peutVendreSur("u-gerant", { id: "u-gerant", role: "manager" })).toBe(true);
  });

  it("sans vendeur connu, on ne filtre pas", () => {
    expect(peutVendreSur("u-patron", null)).toBe(true);
  });
});

describe("refusDOuverture", () => {
  const date = () => "14/11 à 08:30";
  const sienne = { registerId: "c2", registerName: "Caisse 2", openedAt: new Date() };

  it("refuse une seconde session personnelle, en NOMMANT la caisse à clôturer", () => {
    const motif = refusDOuverture(sienne, "c1", date)!;
    expect(motif).toContain("Caisse 2");
    expect(motif).toContain("14/11 à 08:30");
    expect(motif).toContain("Clôturez-la");
  });

  it("n'oppose rien à qui ne tient aucune session", () => {
    expect(refusDOuverture(null, "c1", date)).toBeNull();
  });

  it("n'oppose rien sur la caisse qu'il tient déjà", () => {
    expect(refusDOuverture(sienne, "c2", date)).toBeNull();
  });

  it("n'invente pas de date qu'on ne connaît pas", () => {
    expect(refusDOuverture({ ...sienne, openedAt: null }, "c1", date)).not.toContain("depuis");
  });
});
