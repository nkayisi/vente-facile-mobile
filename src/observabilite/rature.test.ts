import { raturer } from "./rature";

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN RAPPORT DE PLANTAGE NE DOIT EMPORTER NI CLIENT, NI JETON.             │
 * │                                                                          │
 * │ Ce terminal manipule des noms, des téléphones, des soldes de crédit et   │
 * │ des jetons d'appareil. La rature porte sur la CHAÎNE rendue et non sur   │
 * │ des champs nommés : un message d'erreur porte la donnée en clair, et     │
 * │ aucune liste de champs n'attrape « Client X +243… : solde insuffisant ». │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("raturer", () => {
  it("rature un téléphone congolais, quelle que soit sa mise en forme", () => {
    expect(raturer("Client +243 997 876 765 injoignable")).toBe(
      "Client [numéro] injoignable"
    );
    expect(raturer("appel au 0997876765")).toBe("appel au [numéro]");
    expect(raturer("+243-997-876-765")).toBe("[numéro]");
  });

  it("rature une adresse de courriel", () => {
    expect(raturer("échec pour nelly.k@example.com")).toBe("échec pour [courriel]");
  });

  it("rature un jeton porteur", () => {
    expect(raturer("Authorization: Bearer eyJhbGciOi.JIUzI1NiJ9.abc-_1")).toBe(
      "Authorization: Bearer [jeton]"
    );
  });

  it("rature un UUID, qui DÉSIGNE un client précis", () => {
    expect(raturer("vente ddcfb8a3-3d5c-477e-a1b4-ad0501ed3cf8 refusée")).toBe(
      "vente [id] refusée"
    );
  });

  it("descend dans les objets et les tableaux sans changer leur forme", () => {
    const entree = {
      message: "solde de +243997876765 insuffisant",
      lignes: [{ client: "a@b.com" }, { client: "c@d.fr" }],
      montant: 12500,
      actif: true,
    };
    expect(raturer(entree)).toEqual({
      message: "solde de [numéro] insuffisant",
      lignes: [{ client: "[courriel]" }, { client: "[courriel]" }],
      montant: 12500,
      actif: true,
    });
  });

  it("laisse passer ce qui n'est pas une donnée personnelle", () => {
    // Un montant, une référence de vente, une quantité : ce sont EUX qui
    // rendent un rapport utile. Tout rayer ne laisserait rien à diagnostiquer.
    expect(raturer("VT-20260830-JJK6-0042 : stock insuffisant (3 restants)")).toBe(
      "VT-20260830-JJK6-0042 : stock insuffisant (3 restants)"
    );
    expect(raturer(null)).toBe(null);
    expect(raturer(42)).toBe(42);
  });

  it("s'arrête sur une structure trop profonde plutôt que de boucler", () => {
    let profond: unknown = "a@b.com";
    for (let i = 0; i < 12; i += 1) profond = { suivant: profond };
    // Ne lève pas, et ne s'exécute pas indéfiniment : c'est tout ce qu'on
    // demande d'un garde-fou de profondeur.
    expect(() => raturer(profond)).not.toThrow();
  });
});
