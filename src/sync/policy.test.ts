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

  it("NOMME LA LIGNE d'une livraison refusée", () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ UN REFUS DE LIGNE RESSORTAIT EN « rejected », SANS SA PHRASE.      │
    // │                                                                    │
    // │ Une livraison de masse est UN acte : son refus condamne les        │
    // │ quarante lignes, et c'est le message qui doit dire laquelle        │
    // │ corriger. L'ancienne lecture ne descendait que d'un niveau : le    │
    // │ premier membre de `{ lines: { … } }` est un OBJET, aucune branche  │
    // │ ne mordait, et le magasinier lisait un code technique sur l'écran  │
    // │ même où il doit décider.                                           │
    // └────────────────────────────────────────────────────────────────────┘
    expect(
      messageOf({
        errors: {
          code: "rejected",
          errors: { lines: { "1": { quantity: ["Indiquez une quantité."] } } },
        },
      })
    ).toBe("Ligne 2 : Indiquez une quantité.");
  });

  it("nomme aussi la ligne d'un serializer imbriqué en TABLEAU", () => {
    // `sale.create` avec un article fautif rend `{ items: [ {}, { … } ] }` :
    // c'est la même forme, et elle passait par le même silence.
    expect(
      messageOf({
        errors: {
          code: "rejected",
          errors: { items: [{}, { quantity: ["Stock insuffisant."] }] },
        },
      })
    ).toBe("Ligne 2 : Stock insuffisant.");
  });

  it("ne nomme AUCUNE ligne sur une liste de messages du même champ", () => {
    // ⚠ LE CONTRÔLE. DRF rend toujours ses messages en tableau : prendre
    //   l'indice de CE tableau ferait écrire « Ligne 1 : » devant chaque refus
    //   ordinaire, et le mot « ligne » cesserait de vouloir dire quelque chose.
    expect(
      messageOf({ errors: { errors: { quantity: ["Trop grand.", "Entier."] } } })
    ).toBe("Trop grand.");
  });

  it("ignore une phrase vide et continue de chercher", () => {
    expect(
      messageOf({ errors: { errors: { a: [""], b: ["Le vrai motif."] } } })
    ).toBe("Le vrai motif.");
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
