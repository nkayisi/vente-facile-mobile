/**
 * Les points qu'une vente rapporte, et le cumul imprime sur le ticket.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MIROIR A DEJA ETE FAUX UNE FOIS, SUR L'AUTRE SURFACE.                 │
 * │                                                                          │
 * │ Le point de vente du back-office « rejouait le bareme avec la seule      │
 * │ formule POURCENTAGE en dur : sur un programme `fixed_per_amount`, qui    │
 * │ est le DEFAUT, le recu annoncait dix fois les points reellement          │
 * │ credites ». Les deux modes sont donc eprouves ici, et separement.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { SessionLoyaltyProgram } from "@/session/types";

import { pointsGagnes, soldeApresVente } from "./fidelite";

function programme(patch: Partial<SessionLoyaltyProgram> = {}): SessionLoyaltyProgram {
  return {
    id: "p1",
    name: "Fidélité",
    is_active: true,
    points_calculation_type: "fixed_per_amount",
    points_per_unit: 1,
    amount_per_unit: "1000",
    points_percentage: "1",
    point_value: "1",
    ...patch,
  };
}

describe("un barème par tranches", () => {
  it("ne compte PAS une tranche entamée", () => {
    // « X points pour CHAQUE Y dépensé » est ce que le libellé promet au
    // marchand : arrondir au plus proche relèverait tous les barèmes existants
    // sans qu'il l'ait demandé.
    expect(
      pointsGagnes({ programme: programme(), totalFacture: 2500, taux: 1, venteSoldee: true })
    ).toBe(2);
    expect(
      pointsGagnes({ programme: programme(), totalFacture: 999, taux: 1, venteSoldee: true })
    ).toBe(0);
  });

  it("RAMÈNE LA FACTURE EN DEVISE PRINCIPALE avant de compter", () => {
    // ⚠ `amount_per_unit` est libellé en devise principale. Comparer
    // directement un total en devise de facture faisait qu'une facture de
    // 50 USD (~140 000 CDF) rapportait ZÉRO point avec un barème de 1 point
    // par 1 000 CDF - le défaut que le serveur documente.
    expect(
      pointsGagnes({ programme: programme(), totalFacture: 50, taux: 2800, venteSoldee: true })
    ).toBe(140);
    // Sans la conversion, la même facture ne rapporterait rien.
    expect(
      pointsGagnes({ programme: programme(), totalFacture: 50, taux: 1, venteSoldee: true })
    ).toBe(0);
  });

  it("refuse de diviser par une tranche nulle", () => {
    expect(
      pointsGagnes({
        programme: programme({ amount_per_unit: "0" }),
        totalFacture: 5000,
        taux: 1,
        venteSoldee: true,
      })
    ).toBe(0);
  });
});

describe("un barème en pourcentage", () => {
  const pct = programme({ points_calculation_type: "percentage", points_percentage: "1" });

  it("est CONTINU : il ne tronque pas à l'entier", () => {
    // Le serveur a corrigé ce défaut précis : « 1 % d'un panier de 58 USD
    // valait 0,58 point, ramené à ZÉRO sans le moindre signal. La fidélité y
    // devenait inerte. »
    expect(pointsGagnes({ programme: pct, totalFacture: 58, taux: 1, venteSoldee: true })).toBe(0.58);
    expect(pointsGagnes({ programme: pct, totalFacture: 396, taux: 1, venteSoldee: true })).toBe(3.96);
  });

  it("ne se confond PAS avec le barème par tranches", () => {
    // Le même panier, les deux modes : c'est l'écart que le back-office avait
    // imprimé sur ses reçus.
    const panier = { totalFacture: 2500, taux: 1, venteSoldee: true } as const;
    expect(pointsGagnes({ programme: programme(), ...panier })).toBe(2);
    expect(pointsGagnes({ programme: pct, ...panier })).toBe(25);
  });
});

describe("quand la vente ne rapporte rien", () => {
  it("UNE VENTE À CRÉDIT NE RAPPORTE AUCUN POINT À L'ÉMISSION", () => {
    // Le serveur n'attribue que sur une vente `completed` : les points d'une
    // vente à crédit viennent au règlement du solde. Les annoncer sur le
    // ticket serait une promesse qu'il ne tient pas ce jour-là.
    expect(
      pointsGagnes({ programme: programme(), totalFacture: 5000, taux: 1, venteSoldee: false })
    ).toBe(0);
  });

  it("respecte un programme éteint", () => {
    expect(
      pointsGagnes({
        programme: programme({ is_active: false }),
        totalFacture: 5000,
        taux: 1,
        venteSoldee: true,
      })
    ).toBe(0);
  });

  it("ne compte rien sur une facture nulle, ni sans programme", () => {
    expect(pointsGagnes({ programme: programme(), totalFacture: 0, taux: 1, venteSoldee: true })).toBe(0);
    expect(pointsGagnes({ programme: null, totalFacture: 5000, taux: 1, venteSoldee: true })).toBe(0);
  });
});

describe("le cumul imprimé sur le ticket", () => {
  it("retranche ce qui vient d'être dépensé et ajoute ce qui vient d'être gagné", () => {
    expect(soldeApresVente(1776.12, 1122.4, 2)).toBe(655.72);
  });

  it("rend le solde tel quel quand rien n'est dépensé ni gagné", () => {
    // C'est le cas que l'utilisateur signale : un client rattaché qui ne
    // dépense pas ses points doit quand même lire son cumul.
    expect(soldeApresVente(1798.57, 0, 0)).toBe(1798.57);
  });

  it("ne descend JAMAIS sous zéro", () => {
    // Un solde négatif ne veut rien dire sur un papier remis au client.
    expect(soldeApresVente(50, 200, 0)).toBe(0);
  });
});
