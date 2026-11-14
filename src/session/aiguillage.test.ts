import { estDejaSurPlace } from "./aiguillage";

describe("estDejaSurPlace", () => {
  const LOGIN = "/(auth)/login";

  it("laisse un terminal à la session perdue traverser la suite de la connexion", () => {
    // C'est le terminal dont l'administration vient de réinitialiser le mot de
    // passe : il passe en `needs_password`, se reconnecte, et doit pouvoir
    // CHANGER le mot de passe communiqué, puis choisir son établissement.
    expect(estDejaSurPlace("needs_password", ["(auth)", "login"], LOGIN)).toBe(true);
    expect(estDejaSurPlace("needs_password", ["(auth)", "nouveau-mot-de-passe"], LOGIN)).toBe(true);
    expect(estDejaSurPlace("needs_password", ["(auth)", "organization"], LOGIN)).toBe(true);
  });

  it("ramène à la connexion tout le reste, inscription comprise", () => {
    expect(estDejaSurPlace("needs_password", ["(app)", "(tabs)"], LOGIN)).toBe(false);
    expect(estDejaSurPlace("needs_password", ["(auth)", "inscription", "compte"], LOGIN)).toBe(false);
    expect(estDejaSurPlace("needs_password", ["(auth)", "bienvenue"], LOGIN)).toBe(false);
  });

  it("garde les autres états comme avant", () => {
    expect(estDejaSurPlace("anonymous", ["(auth)", "inscription", "compte"], LOGIN)).toBe(true);
    expect(estDejaSurPlace("anonymous", ["(app)"], LOGIN)).toBe(false);
    expect(estDejaSurPlace("ready", ["(app)", "client", "abc"], "/(app)")).toBe(true);
    expect(estDejaSurPlace("ready", ["(auth)", "login"], "/(app)")).toBe(false);
    expect(estDejaSurPlace("locked", ["(locked)", "unlock"], "/(locked)/unlock")).toBe(true);
    expect(estDejaSurPlace("locked", ["(app)"], "/(locked)/unlock")).toBe(false);
  });
});
