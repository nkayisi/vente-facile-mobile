import {
  libelleBoutonImpression,
  phraseImpression,
  titreDeLaVente,
} from "./apres-vente-libelles";

describe("ce que disent les panneaux d'après-vente", () => {
  it("nomme une vente à crédit comme telle", () => {
    expect(titreDeLaVente(false)).toBe("Vente enregistrée");
    expect(titreDeLaVente(true)).toBe("Vente à crédit enregistrée");
  });

  it("propose l'ORIGINAL après un échec, et le duplicata après un succès", () => {
    // Rien n'est sorti après un échec : le prochain ticket est l'original.
    expect(libelleBoutonImpression(null)).toBe("Imprimer le reçu");
    expect(libelleBoutonImpression("echec")).toBe("Imprimer le reçu");
    expect(libelleBoutonImpression("faite")).toBe("Réimprimer (duplicata)");
    expect(libelleBoutonImpression("encours")).toBe("Impression…");
  });

  it("dit où le ticket est sorti", () => {
    expect(phraseImpression("faite", { id: "bluetooth", libelle: "Bluetooth" })).toBe(
      "Ticket imprimé (Bluetooth)."
    );
    expect(phraseImpression("faite", null)).toBe("Ticket imprimé.");
    expect(phraseImpression("encours", null)).toMatch(/en cours/);
  });

  it("ne dit pas « imprimé » d'un ticket parti en PDF", () => {
    // Rien n'est sorti de l'imprimante : le document est allé à la feuille de
    // partage du système.
    expect(phraseImpression("faite", { id: "pdf", libelle: "PDF" })).toBe("Ticket envoyé en PDF.");
  });

  it("laisse le bandeau parler d'un échec", () => {
    expect(phraseImpression("echec", null)).toBeNull();
    expect(phraseImpression(null, null)).toBeNull();
  });
});
