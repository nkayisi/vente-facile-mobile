import type { MoneyHelpers } from "@vente-facile/core";
import { createMoneyHelpers } from "@vente-facile/core";

import {
  deviseEquivalente,
  devisesAffichables,
  prixAvecEquivalent,
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

/** Trois devises, dont une que le marchand a désactivée. */
function troisDevises(actifEur: boolean): MoneyHelpers {
  return createMoneyHelpers(
    [
      {
        currency_code: "USD", currency_name: "Dollar", currency_symbol: "$",
        currency_decimal_places: 2, exchange_rate: "1", is_primary: true,
      },
      {
        currency_code: "CDF", currency_name: "Franc", currency_symbol: "FC",
        currency_decimal_places: 0, exchange_rate: "0.000434782609", is_primary: false,
        is_active: false,
      },
      {
        currency_code: "EUR", currency_name: "Euro", currency_symbol: "€",
        currency_decimal_places: 2, exchange_rate: "1.1", is_primary: false,
        is_active: actifEur,
      },
    ] as never,
    { code: "USD", name: "Dollar", symbol: "$", decimal_places: 2 }
  );
}

describe("la devise de l'équivalent", () => {
  it("est l'autre devise d'un établissement qui en tient deux", () => {
    expect(deviseEquivalente(helpers())).toBe("CDF");
  });

  it("n'existe pas sur un établissement mono-devise", () => {
    const mono = createMoneyHelpers(
      [
        {
          currency_code: "CDF", currency_name: "Franc", currency_symbol: "FC",
          currency_decimal_places: 0, exchange_rate: "1", is_primary: true,
        },
      ] as never,
      { code: "CDF", name: "Franc", symbol: "FC", decimal_places: 0 }
    );
    expect(deviseEquivalente(mono)).toBeNull();
  });

  it("écarte une devise désactivée : le marchand l'a retirée de sa caisse", () => {
    // CDF est désactivée : c'est l'euro, actif, qui donne l'équivalent.
    expect(deviseEquivalente(troisDevises(true))).toBe("EUR");
    // Plus aucune autre devise active : pas d'équivalent du tout.
    expect(deviseEquivalente(troisDevises(false))).toBeNull();
  });
});

describe("le prix et son équivalent", () => {
  it("porte TOUJOURS le prix facturé, en devise principale", () => {
    expect(prixAvecEquivalent(10, helpers()).facture).toMatch(/10.*\$/);
  });

  it("donne l'équivalent dans l'autre devise, au taux en vigueur", () => {
    // 10 $ au taux 2 300 : 23 000 FC, sans décimale (le franc n'en a pas).
    expect(prixAvecEquivalent(10, helpers()).equivalent).toMatch(/23\s?000.*FC/);
  });

  it("ne donne aucun équivalent sans seconde devise active", () => {
    expect(prixAvecEquivalent(10, troisDevises(false)).equivalent).toBeNull();
  });

  it("aucun montant ne sort sans devise", () => {
    const p = prixAvecEquivalent(10, helpers());
    expect(p.facture).toMatch(/[^\d\s.,]/);
    expect(p.equivalent).toMatch(/[^\d\s.,]/);
  });
});
