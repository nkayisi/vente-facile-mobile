/**
 * La cagnotte qu'une vente rapporte, et le cumul imprime sur le ticket.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MIROIR A DEJA ETE FAUX UNE FOIS, SUR L'AUTRE SURFACE.                 │
 * │                                                                          │
 * │ Le point de vente du back-office « rejouait le bareme avec la seule      │
 * │ formule POURCENTAGE en dur : sur un programme `fixed_per_amount`, qui    │
 * │ etait le DEFAUT, le recu annoncait dix fois les points reellement        │
 * │ credites ».                                                              │
 * │                                                                          │
 * │ ⚠ IL N'Y A PLUS QU'UN SEUL BAREME, et la classe d'erreur entiere         │
 * │   disparait avec le mode par tranches. Ce qui reste a eprouver est le    │
 * │   POURCENTAGE, la conversion en devise principale, et les trois cas ou   │
 * │   la vente ne rapporte rien.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { SessionLoyaltyProgram } from "@/session/types";

import { gainFidelite, cagnotteApresVente } from "./fidelite";

function programme(patch: Partial<SessionLoyaltyProgram> = {}): SessionLoyaltyProgram {
  return {
    id: "p1",
    name: "Fidélité",
    is_active: true,
    earn_percent: "2",
    max_redemption_percent: "50",
    ...patch,
  };
}

describe("le gain de cagnotte", () => {
  it("rend un POURCENTAGE de la facture, en argent", () => {
    // C'est l'aperçu que le back-office affiche au marchand : « sur une facture
    // de 10 000, le client gagne 200 ».
    expect(
      gainFidelite({ programme: programme(), totalFacture: 10000, taux: 1, venteSoldee: true })
    ).toBe(200);
  });

  it("est CONTINU : il ne tronque pas à l'entier", () => {
    // Le serveur a corrigé ce défaut précis : « 1 % d'un panier de 58 USD
    // valait 0,58 point, ramené à ZÉRO sans le moindre signal. La fidélité y
    // devenait inerte. »
    const pct = programme({ earn_percent: "1" });
    expect(gainFidelite({ programme: pct, totalFacture: 58, taux: 1, venteSoldee: true })).toBe(0.58);
    expect(gainFidelite({ programme: pct, totalFacture: 396, taux: 1, venteSoldee: true })).toBe(3.96);
  });

  it("quantise au centième, comme le serveur", () => {
    // Miroir de `quantize(Decimal('0.01'))` : une cagnotte est de l'argent, et
    // un montant à douze décimales ne s'imprime pas sur un ticket.
    expect(
      gainFidelite({
        programme: programme({ earn_percent: "3" }),
        totalFacture: 333.33,
        taux: 1,
        venteSoldee: true,
      })
    ).toBe(10);
  });

  it("RAMÈNE LA FACTURE EN DEVISE PRINCIPALE avant de créditer", () => {
    // ⚠ La cagnotte est tenue en devise PRINCIPALE. Sans cette conversion, une
    // facture de 50 USD créditerait 1 $ là où le serveur crédite 2 800 FC, et
    // le ticket annoncerait une cagnotte deux mille huit cents fois trop
    // petite.
    expect(
      gainFidelite({ programme: programme(), totalFacture: 50, taux: 2800, venteSoldee: true })
    ).toBe(2800);
    expect(
      gainFidelite({ programme: programme(), totalFacture: 50, taux: 1, venteSoldee: true })
    ).toBe(1);
  });

  it("se replie sur 1 quand le taux est absurde", () => {
    // Un taux nul ne peut pas sortir de la table des devises ; s'il en arrive
    // un, multiplier donnerait zéro en silence.
    expect(
      gainFidelite({ programme: programme(), totalFacture: 10000, taux: 0, venteSoldee: true })
    ).toBe(200);
  });
});

describe("quand la vente ne rapporte rien", () => {
  it("UNE VENTE À CRÉDIT NE RAPPORTE AUCUNE CAGNOTTE À L'ÉMISSION", () => {
    // Le serveur ne crédite que sur une vente `completed` : la cagnotte d'une
    // vente à crédit vient au règlement du solde. L'annoncer sur le ticket
    // serait une promesse qu'il ne tient pas ce jour-là.
    expect(
      gainFidelite({ programme: programme(), totalFacture: 5000, taux: 1, venteSoldee: false })
    ).toBe(0);
  });

  it("respecte un programme éteint", () => {
    expect(
      gainFidelite({
        programme: programme({ is_active: false }),
        totalFacture: 5000,
        taux: 1,
        venteSoldee: true,
      })
    ).toBe(0);
  });

  it("ne compte rien sur une facture nulle, ni sans programme", () => {
    expect(gainFidelite({ programme: programme(), totalFacture: 0, taux: 1, venteSoldee: true })).toBe(0);
    expect(gainFidelite({ programme: null, totalFacture: 5000, taux: 1, venteSoldee: true })).toBe(0);
  });

  it("ne compte rien sur un pourcentage nul", () => {
    expect(
      gainFidelite({
        programme: programme({ earn_percent: "0" }),
        totalFacture: 10000,
        taux: 1,
        venteSoldee: true,
      })
    ).toBe(0);
  });
});

describe("le cumul imprimé sur le ticket", () => {
  it("retranche ce qui vient d'être dépensé et ajoute ce qui vient d'être gagné", () => {
    expect(cagnotteApresVente(1776.12, 1122.4, 2)).toBe(655.72);
  });

  it("rend la cagnotte telle quelle quand rien n'est dépensé ni gagné", () => {
    // C'est le cas que l'utilisateur signale : un client rattaché qui ne
    // dépense pas sa cagnotte doit quand même lire son cumul.
    expect(cagnotteApresVente(1798.57, 0, 0)).toBe(1798.57);
  });

  it("ne descend JAMAIS sous zéro", () => {
    // Une cagnotte négative ne veut rien dire sur un papier remis au client.
    expect(cagnotteApresVente(50, 200, 0)).toBe(0);
  });
});
