import {
  erreursDuServeur,
  etapeApresConnexion,
  verifierSaisie,
} from "./apres-connexion";

const org = (id: string) => ({ id, name: id, role: "cashier", role_display: "Caissier" });

describe("etapeApresConnexion", () => {
  it("fait changer le mot de passe AVANT tout choix d'établissement", () => {
    expect(etapeApresConnexion({ organizations: [org("a")], mustChangePassword: true })).toEqual({
      type: "changer_mot_de_passe",
    });
    expect(etapeApresConnexion({ organizations: [], mustChangePassword: true }).type).toBe(
      "changer_mot_de_passe"
    );
  });

  it("choisit d'office une boutique unique, demande au-delà", () => {
    expect(etapeApresConnexion({ organizations: [org("a")], mustChangePassword: false })).toEqual({
      type: "choisir_d_office",
      organizationId: "a",
    });
    expect(
      etapeApresConnexion({ organizations: [org("a"), org("b")], mustChangePassword: false }).type
    ).toBe("demander");
  });

  it("nomme l'absence d'établissement", () => {
    expect(etapeApresConnexion({ organizations: [], mustChangePassword: false }).type).toBe(
      "aucun_etablissement"
    );
  });
});

describe("verifierSaisie", () => {
  const ok = { actuel: "kivu-4821-mara", nouveau: "goma-7395-tana", confirmation: "goma-7395-tana" };

  it("laisse passer une saisie complète", () => {
    expect(verifierSaisie(ok)).toEqual({});
  });

  it("refuse de garder le mot de passe dicté", () => {
    expect(
      verifierSaisie({ ...ok, nouveau: ok.actuel, confirmation: ok.actuel }).nouveau
    ).toMatch(/différent/);
  });

  it("refuse une confirmation différente et un mot de passe trop court", () => {
    expect(verifierSaisie({ ...ok, confirmation: "autre" }).confirmation).toBeDefined();
    expect(verifierSaisie({ ...ok, nouveau: "court", confirmation: "court" }).nouveau).toMatch(/8/);
  });

  it("exige le mot de passe communiqué", () => {
    expect(verifierSaisie({ ...ok, actuel: "" }).actuel).toBeDefined();
  });
});

describe("erreursDuServeur", () => {
  it("range chaque erreur sous son champ", () => {
    expect(
      erreursDuServeur({
        current_password: ["Mot de passe actuel incorrect."],
        new_password: ["Ce mot de passe est trop courant.", "Il est entièrement numérique."],
      })
    ).toEqual({
      actuel: "Mot de passe actuel incorrect.",
      nouveau: "Ce mot de passe est trop courant. Il est entièrement numérique.",
    });
  });

  it("ne lève pas sur un corps inattendu", () => {
    expect(erreursDuServeur(undefined)).toEqual({});
    expect(erreursDuServeur("<html>")).toEqual({});
  });
});
