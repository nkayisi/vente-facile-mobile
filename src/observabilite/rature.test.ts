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

  it("NE MANGE PAS un horodatage, qui est la première chose qu'on lit", () => {
    // Le motif d'origine (`\+?\d[\d\s().-]{7,}\d`) rendait « [numéro]:46:47 » :
    // une rature qui détruit le diagnostic sans rien protéger.
    expect(raturer("2026-08-31 00:46:47 échec de poussée")).toBe(
      "2026-08-31 00:46:47 échec de poussée"
    );
    expect(raturer("expiré le 2026-08-31T00:46:47Z")).toBe(
      "expiré le 2026-08-31T00:46:47Z"
    );
  });

  it("ne confond pas un écart ventilé ni une quantité avec un téléphone", () => {
    expect(raturer("-2 casiers, +5 bouteilles")).toBe("-2 casiers, +5 bouteilles");
    expect(raturer("13 BOITES + 14 AMPOULES")).toBe("13 BOITES + 14 AMPOULES");
  });

  it("rature un montant, qui est ancré sur sa devise", () => {
    // Le montant part, mais il part SOUS SON NOM : « [numéro] » laissait
    // croire à un téléphone là où il n'y en avait pas.
    expect(raturer("Total 12 500 000.00 CDF")).toBe("Total [montant]");
    expect(raturer("solde 1 250 036,40 USD restant")).toBe("solde [montant] restant");
    expect(raturer("reste $ 42.50 à payer")).toBe("reste [montant] à payer");
  });

  it("RATURE, et ne laisse pas passer, un sous-arbre trop profond", () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Un garde-fou de parcours se ferme, il ne s'ouvre pas.              │
    // │                                                                    │
    // │ La borne rendait le sous-arbre TEL QUEL : une erreur d'API         │
    // │ sérialisée profondément repartait en clair, téléphone compris.     │
    // └────────────────────────────────────────────────────────────────────┘
    let profond: unknown = { tel: "+243997876765" };
    for (let i = 0; i < 40; i += 1) profond = { suivant: profond };
    expect(JSON.stringify(raturer(profond))).not.toContain("243997876765");
  });

  it("descend assez profond pour ne pas amputer un cadre de pile", () => {
    // Un événement Sentry porte
    // `exception.values[0].stacktrace.frames[i].vars.…` : huit niveaux avant
    // la moindre donnée. Une borne à six coupait DEDANS.
    const evenement = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: "app/(app)/pos.tsx", vars: { qte: "3" } }],
            },
          },
        ],
      },
    };
    expect(raturer(evenement)).toEqual(evenement);
  });

  it("s'arrête sur un cycle sans boucler, et sans amputer un partage légitime", () => {
    const cycle: Record<string, unknown> = { nom: "a@b.com" };
    cycle.moi = cycle;
    expect(() => raturer(cycle)).not.toThrow();

    // Deux références au MÊME objet côte à côte ne sont pas un cycle : les
    // couper reviendrait à amputer un rapport valide.
    const partage = { valeur: "ok" };
    expect(raturer({ a: partage, b: partage })).toEqual({
      a: { valeur: "ok" },
      b: { valeur: "ok" },
    });
  });
});
