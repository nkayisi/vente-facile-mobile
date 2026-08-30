import { codeDevise, lirePlafond } from "./abonnement";

/**
 * Deux pièges de l'abonnement, tous deux RELEVÉS SUR L'ÉMULATEUR.
 */
describe("codeDevise", () => {
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ `Plan.currency` EST UN OBJET, `Subscription.currency` EST UNE CHAÎNE.  │
   * │                                                                        │
   * │ Les deux champs portent le même nom, si bien que rien ne le signale à  │
   * │ la relecture. Passer l'objet au formateur a imprimé « 3 [object        │
   * │ Object] » en tête de la grille des plans, à l'endroit exact où le      │
   * │ marchand cherche le prix.                                              │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it("lit le code d'un objet devise", () => {
    expect(codeDevise({ id: "x", code: "USD", symbol: "$" })).toBe("USD");
  });

  it("laisse passer une chaîne", () => {
    expect(codeDevise("CDF")).toBe("CDF");
  });

  it("se replie sans jamais rendre un objet", () => {
    expect(codeDevise(null)).toBe("CDF");
    expect(codeDevise(undefined)).toBe("CDF");
    expect(codeDevise({})).toBe("CDF");
    expect(codeDevise({ code: "" })).toBe("CDF");
  });
});

describe("lirePlafond", () => {
  it("dit « 3 sur 12 » quand une borne existe", () => {
    expect(lirePlafond({ label: "Utilisateurs", utilise: 3, limite: 12 })).toBe(
      "3 sur 12"
    );
  });

  /**
   * `null` ne se lit JAMAIS comme zéro. « 3 sur 0 » annoncerait un
   * dépassement imaginaire là où le plan n'impose aucune borne.
   */
  it("n'invente pas une borne quand il n'y en a pas", () => {
    expect(lirePlafond({ label: "Produits", utilise: 3, limite: null })).toBe("3");
  });
});
