/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN LOGO NE DOIT JAMAIS EMPÊCHER D'IMPRIMER.                            │
 * │                                                                          │
 * │ C'est la seule règle qui compte ici : le papier du client ne se négocie  │
 * │ pas. Un logo injoignable, une URL expirée, un format inconnu ou un       │
 * │ fichier trop gros rendent `null`, et le bloc disparaît.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { urlDuLogo } from "./load-logo";

describe("l'URL du logo", () => {
  it("laisse une URL absolue telle quelle", () => {
    expect(urlDuLogo("https://exemple.test/media/logo.png")).toBe(
      "https://exemple.test/media/logo.png"
    );
    expect(urlDuLogo("http://exemple.test/logo.png")).toBe("http://exemple.test/logo.png");
  });

  it("préfixe un chemin RELATIF, et ce n'est pas défensif", () => {
    // Le serializer rend un chemin relatif quand il n'a pas de requête en
    // contexte, et c'est le cas de la charge utile de session.
    const u = urlDuLogo("/media/organizations/logos/x.png");
    expect(u).toMatch(/^https?:\/\//);
    expect(u).toMatch(/\/media\/organizations\/logos\/x\.png$/);
    // Le préfixe ne porte PAS `/api/v1` : un média n'est pas un endpoint.
    expect(u).not.toMatch(/\/api\/v1/);
  });

  it("ajoute la barre manquante plutôt que de coller les deux morceaux", () => {
    expect(urlDuLogo("media/x.png")).toMatch(/\/media\/x\.png$/);
    expect(urlDuLogo("media/x.png")).not.toMatch(/[^/]media/);
  });

  it("rend `undefined` quand il n'y a pas de logo", () => {
    expect(urlDuLogo(null)).toBeUndefined();
    expect(urlDuLogo(undefined)).toBeUndefined();
    expect(urlDuLogo("")).toBeUndefined();
  });
});
