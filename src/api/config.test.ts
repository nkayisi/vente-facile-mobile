/**
 * L'adresse du backend, et les deux fautes qu'on ne voit pas dans un JSON.
 *
 * Ces tests ne gardent pas un style : ils gardent le fait qu'une erreur de
 * configuration SE VOIE. Une barre finale ou un `http://` laissés passer
 * donnent une application installée qui ne joint jamais son serveur, et le
 * marchand n'a aucun moyen de savoir que la faute est dans le profil de
 * compilation.
 */
import { resoudreApiBaseUrl, resoudreWebBaseUrl, urlDepuisMetro } from "./config";

const DISTANT = "https://backend.vente-facile.net/api/v1";

describe("resoudreApiBaseUrl", () => {
  it("rend l'adresse du profil telle quelle quand elle est juste", () => {
    expect(
      resoudreApiBaseUrl({ fournie: DISTANT, dev: false, hostUri: "" })
    ).toBe(DISTANT);
  });

  it("RETIRE la barre finale : les chemins appelés commencent tous par une barre", () => {
    expect(
      resoudreApiBaseUrl({ fournie: `${DISTANT}/`, dev: false, hostUri: "" })
    ).toBe(DISTANT);
    expect(
      resoudreApiBaseUrl({ fournie: `${DISTANT}///`, dev: false, hostUri: "" })
    ).toBe(DISTANT);
  });

  it("tolère les espaces autour d'une valeur recopiée à la main", () => {
    expect(
      resoudreApiBaseUrl({ fournie: `  ${DISTANT}  `, dev: false, hostUri: "" })
    ).toBe(DISTANT);
  });

  it("REFUSE le trafic en clair hors développement, en nommant l'adresse reçue", () => {
    expect(() =>
      resoudreApiBaseUrl({
        fournie: "http://backend.vente-facile.net/api/v1",
        dev: false,
        hostUri: "",
      })
    ).toThrow(/HTTPS.*http:\/\/backend\.vente-facile\.net/s);
  });

  it("REFUSE une adresse absente hors développement", () => {
    expect(() =>
      resoudreApiBaseUrl({ fournie: undefined, dev: false, hostUri: "" })
    ).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it("REFUSE une adresse VIDE hors développement, comme une adresse absente", () => {
    // Une clé posée à `""` dans un profil EAS passe le `??` : sans ce cas,
    // l'application partirait avec une adresse vide.
    expect(() =>
      resoudreApiBaseUrl({ fournie: "   ", dev: false, hostUri: "" })
    ).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it("en développement, déduit l'adresse de l'hôte Metro plutôt que d'échouer", () => {
    expect(
      resoudreApiBaseUrl({ fournie: undefined, dev: true, hostUri: "192.168.0.128:8081" })
    ).toBe("http://192.168.0.128:8005/api/v1");
  });

  it("en développement, le trafic en clair reste permis : le backend local n'est pas en HTTPS", () => {
    expect(
      resoudreApiBaseUrl({
        fournie: "http://10.0.2.2:8005/api/v1",
        dev: true,
        hostUri: "",
      })
    ).toBe("http://10.0.2.2:8005/api/v1");
  });

  it("sans hôte Metro, se replie sur la boucle locale", () => {
    expect(urlDepuisMetro("")).toBe("http://127.0.0.1:8005/api/v1");
  });
});

describe("resoudreWebBaseUrl", () => {
  it("rend l'adresse du profil, sans barre finale", () => {
    expect(
      resoudreWebBaseUrl({
        fournie: "https://vente-facile.net/",
        dev: false,
        apiBaseUrl: DISTANT,
      })
    ).toBe("https://vente-facile.net");
  });

  it("ABSENTE, elle ne lève pas : on ne bloque pas un comptoir pour un lien de facturation", () => {
    expect(
      resoudreWebBaseUrl({ fournie: undefined, dev: false, apiBaseUrl: DISTANT })
    ).toBeNull();
  });

  it("en développement, suit la machine qui sert l'API, sur le port du back-office", () => {
    expect(
      resoudreWebBaseUrl({
        fournie: undefined,
        dev: true,
        apiBaseUrl: "http://192.168.0.128:8005/api/v1",
      })
    ).toBe("http://192.168.0.128:3005");
  });
});
