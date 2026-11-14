import { peutVendreSur } from "./session-vendeur";

describe("peutVendreSur", () => {
  it("un caissier encaisse sur SA session", () => {
    expect(peutVendreSur("u-caisse", { id: "u-caisse", role: "cashier" })).toBe(true);
  });

  it("un caissier n'encaisse PAS sur la session d'un autre", () => {
    // Le serveur refuserait la vente après le ticket : « Cette session a été
    // ouverte par un autre utilisateur ».
    expect(peutVendreSur("u-patron", { id: "u-caisse", role: "cashier" })).toBe(false);
  });

  it("le magasinier suit la règle du caissier", () => {
    // `is_manager_or_above` ne retient que owner et manager.
    expect(peutVendreSur("u-patron", { id: "u-mag", role: "stock_keeper" })).toBe(false);
    expect(peutVendreSur("u-mag", { id: "u-mag", role: "stock_keeper" })).toBe(true);
  });

  it("le propriétaire et le gérant encaissent sur n'importe quelle session", () => {
    expect(peutVendreSur("u-caisse", { id: "u-patron", role: "owner" })).toBe(true);
    expect(peutVendreSur("u-caisse", { id: "u-gerant", role: "manager" })).toBe(true);
  });

  it("un rôle inconnu n'ouvre RIEN de plus que la sienne", () => {
    // `null` arrive d'un instantané sans rôle : le serveur le traiterait comme
    // un non-gérant, donc le terminal aussi.
    expect(peutVendreSur("u-patron", { id: "u-x", role: null })).toBe(false);
  });

  it("sans vendeur connu, on ne filtre pas", () => {
    expect(peutVendreSur("u-patron", null)).toBe(true);
  });
});
