/**
 * Règles d'envoi.
 *
 * Ce que ces tests protègent : une opération refusée ne doit jamais entraîner
 * les autres, et un message d'erreur doit rester lisible par un commerçant.
 * L'ancienne file marquait les deux cents opérations d'un lot en échec dès
 * qu'une seule était refusée, et affichait le JSON brut du serveur.
 */
import { backoffMs, messageOf } from "./policy";

describe("temporisation", () => {
  it("croît avec les essais", () => {
    // Avec la gigue, on compare des plages plutôt que des valeurs exactes.
    const moyenne = (n: number) =>
      Array.from({ length: 200 }, () => backoffMs(n)).reduce((a, b) => a + b, 0) / 200;

    expect(moyenne(2)).toBeGreaterThan(moyenne(1));
    expect(moyenne(4)).toBeGreaterThan(moyenne(2));
  });

  it("plafonne à quinze minutes", () => {
    for (let n = 1; n <= 40; n++) {
      // Le plafond porte sur la base ; la gigue peut ajouter 20 %.
      expect(backoffMs(n)).toBeLessThanOrEqual(15 * 60_000 * 1.2 + 1);
    }
  });

  it("porte une gigue, pour que douze terminaux ne repartent pas en chœur", () => {
    const valeurs = new Set(Array.from({ length: 50 }, () => backoffMs(3)));
    expect(valeurs.size).toBeGreaterThan(1);
  });

  it("reste positive dès le premier essai", () => {
    expect(backoffMs(0)).toBeGreaterThan(0);
    expect(backoffMs(1)).toBeGreaterThan(0);
  });
});

describe("message de refus", () => {
  it("préfère le détail du serveur", () => {
    expect(messageOf({ errors: { detail: "Stock insuffisant." } })).toBe(
      "Stock insuffisant."
    );
  });

  it("déplie la forme de DRF plutôt que d'afficher du JSON", () => {
    // « [object Object] » ou du JSON brut sur l'écran d'un commerçant ne lui
    // apprend rien sur ce qu'il doit corriger.
    expect(
      messageOf({ errors: { errors: { register: ["Aucune session ouverte."] } } })
    ).toBe("Aucune session ouverte.");
    expect(messageOf({ errors: { errors: { amount: "Montant invalide." } } })).toBe(
      "Montant invalide."
    );
  });

  it("se rabat sur le code quand il n'y a rien de lisible", () => {
    expect(messageOf({ errors: { code: "session_already_open" } })).toBe(
      "session_already_open"
    );
  });

  it("dit quelque chose même sans erreur", () => {
    expect(messageOf({ errors: null })).toBeTruthy();
  });
});
