import type { MoneyHelpers } from "@vente-facile/core";
import { createMoneyHelpers } from "@vente-facile/core";

import {
  deviseAffichageValide,
  devisesAffichables,
  prixAffiche,
} from "./affichage-devise";

/** Un établissement en USD qui encaisse aussi des francs, au taux 2 300. */
function helpers(): MoneyHelpers {
  return createMoneyHelpers(
    [
      {
        currency_code: "USD", currency_name: "Dollar", currency_symbol: "$",
        currency_decimal_places: 2, exchange_rate: "1", is_primary: true,
      },
      {
        currency_code: "CDF", currency_name: "Franc", currency_symbol: "FC",
        currency_decimal_places: 0, exchange_rate: "0.000434782609", is_primary: false,
      },
    ] as never,
    { code: "USD", name: "Dollar", symbol: "$", decimal_places: 2 }
  );
}

describe("les devises proposées à l'affichage", () => {
  it("met la PRINCIPALE en tête : c'est la devise de facturation", () => {
    expect(devisesAffichables(helpers())[0]).toBe("USD");
  });

  it("propose les secondaires ensuite", () => {
    expect(devisesAffichables(helpers())).toEqual(["USD", "CDF"]);
  });

  it("ne propose rien d'autre que ce que l'établissement a réglé", () => {
    const mono = createMoneyHelpers(
      [
        {
          currency_code: "CDF", currency_name: "Franc", currency_symbol: "FC",
          currency_decimal_places: 0, exchange_rate: "1", is_primary: true,
        },
      ] as never,
      { code: "CDF", name: "Franc", symbol: "FC", decimal_places: 0 }
    );
    expect(devisesAffichables(mono)).toEqual(["CDF"]);
  });
});

describe("le prix affiché", () => {
  it("porte TOUJOURS le prix facturé", () => {
    expect(prixAffiche(10, null, helpers()).facture).toContain("10");
    expect(prixAffiche(10, "CDF", helpers()).facture).toContain("10");
  });

  it("ne convertit pas vers la devise de facturation", () => {
    const p = prixAffiche(10, "USD", helpers());
    expect(p.converti).toBeNull();
    expect(p.parite).toBeNull();
  });

  it("convertit vers une secondaire, et NOMME la parité", () => {
    const p = prixAffiche(10, "CDF", helpers());
    // 10 $ au taux 2 300 : 23 000 FC, sans décimale (le franc n'en a pas).
    expect(p.converti).toMatch(/23\s?000/);
    expect(p.parite).toMatch(/USD/);
    expect(p.parite).toMatch(/FC|CDF/);
  });

  it("NE CONVERTIT RIEN vers une devise inconnue", () => {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ `rateOf` rend 1 pour une devise qu'elle ne connaît pas :         │
    // │ convertir quand même afficherait le MÊME nombre sous un autre    │
    // │ symbole, c'est-à-dire un prix faux présenté comme exact.         │
    // └──────────────────────────────────────────────────────────────────┘
    const p = prixAffiche(10, "EUR", helpers());
    expect(p.converti).toBeNull();
    expect(p.parite).toBeNull();
  });

  it("aucun montant ne sort sans devise", () => {
    const p = prixAffiche(10, "CDF", helpers());
    expect(p.facture).toMatch(/[^\d\s.,]/);
    expect(p.converti).toMatch(/[^\d\s.,]/);
  });
});

describe("la devise d'affichage retenue", () => {
  it("retombe sur la principale quand le réglage désigne l'inconnu", () => {
    // Un réglage rangé hier peut désigner une devise retirée depuis : mieux
    // vaut la principale que de convertir à un taux de 1.
    expect(deviseAffichageValide("EUR", helpers())).toBe("USD");
    expect(deviseAffichageValide(null, helpers())).toBe("USD");
    expect(deviseAffichageValide("", helpers())).toBe("USD");
  });

  it("garde un réglage valide", () => {
    expect(deviseAffichageValide("CDF", helpers())).toBe("CDF");
  });
});
