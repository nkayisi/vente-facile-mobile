/**
 * Classification des échecs.
 *
 * Le défaut de l'ancienne application tenait en une ligne : elle traitait un
 * échec réseau comme un jeton invalide, et enchaînait sur l'effacement du
 * trousseau. Démarrer sans réseau enfermait donc l'utilisateur dehors.
 *
 * La règle que ces tests protègent : **dans le doute, c'est le réseau.**
 */
import { ApiError, classifyStatus, classifyThrown, isOffline, readableMessage } from "./errors";

describe("classifyStatus", () => {
  it("ne traite comme un refus d'identité que 401 et 403", () => {
    expect(classifyStatus(401)).toBe("auth");
    expect(classifyStatus(403)).toBe("auth");
    expect(classifyStatus(400)).toBe("request");
    expect(classifyStatus(404)).toBe("request");
    expect(classifyStatus(409)).toBe("request");
  });

  it("distingue l'abonnement et la limitation de débit", () => {
    expect(classifyStatus(402)).toBe("subscription");
    expect(classifyStatus(429)).toBe("throttled");
  });

  it("range les 5xx en transitoire", () => {
    expect(classifyStatus(500)).toBe("server");
    expect(classifyStatus(502)).toBe("server");
    expect(classifyStatus(503)).toBe("server");
  });
});

describe("classifyThrown", () => {
  it("traite un abandon de requête comme un fait de réseau", () => {
    const abort = new Error("Aborted");
    abort.name = "AbortError";
    expect(classifyThrown(abort)).toBe("network");
  });

  it("se replie sur le réseau pour tout ce qu'il ne reconnaît pas", () => {
    // C'est LA règle : jamais « auth » par défaut. Mieux vaut laisser
    // travailler hors ligne que mettre un caissier dehors sur un doute.
    expect(classifyThrown(new TypeError("Network request failed"))).toBe("network");
    expect(classifyThrown(undefined)).toBe("network");
    expect(classifyThrown("boum")).toBe("network");
    expect(classifyThrown({})).toBe("network");
  });

  it("respecte la nature d'une ApiError déjà classée", () => {
    expect(classifyThrown(new ApiError("auth", "refusé"))).toBe("auth");
    expect(classifyThrown(new ApiError("server", "cassé"))).toBe("server");
  });

  it("isOffline ne dit vrai que pour le transport", () => {
    expect(isOffline(new ApiError("network", "injoignable"))).toBe(true);
    expect(isOffline(new ApiError("auth", "refusé"))).toBe(false);
  });
});

describe("readableMessage", () => {
  it("déplie les formes d'erreur de DRF", () => {
    expect(readableMessage({ detail: "Introuvable" }, "x")).toBe("Introuvable");
    expect(readableMessage({ error: "Cassé" }, "x")).toBe("Cassé");
    expect(readableMessage({ email: ["Adresse invalide."] }, "x")).toBe("Adresse invalide.");
  });

  it("se rabat sur le message fourni quand le corps n'apprend rien", () => {
    expect(readableMessage(null, "repli")).toBe("repli");
    expect(readableMessage({}, "repli")).toBe("repli");
    expect(readableMessage(42, "repli")).toBe("repli");
  });

  it("rend une chaîne courte telle quelle", () => {
    expect(readableMessage("Abonnement expiré.", "repli")).toBe("Abonnement expiré.");
  });

  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UN MESSAGE D'ERREUR EST UNE PHRASE, JAMAIS UNE PAGE.                  │
   * │                                                                        │
   * │ Mesuré sur l'émulateur : un appel à une route inexistante a fait       │
   * │ rendre à Django sa page de débogage complète, que ce module renvoyait  │
   * │ telle quelle et que le bandeau d'erreur affichait sur DEUX ÉCRANS de   │
   * │ balises. Le marchand ne pouvait ni comprendre, ni faire défiler        │
   * │ jusqu'au bouton « Réessayer ».                                         │
   * │                                                                        │
   * │ Le cas n'a rien d'exceptionnel : page 404 ou 500 de Django, page d'un  │
   * │ proxy inverse, portail captif d'un hôtel. Aucun ne parle JSON.         │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it("REFUSE une page HTML de Django", () => {
    const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Page not found at /api/v1/subscriptions/plans/</title>
</head>
<body><h1>Page not found <small>(404)</small></h1></body>
</html>`;
    expect(readableMessage(page, "repli")).toBe("repli");
  });

  it("REFUSE une page servie sans doctype", () => {
    expect(readableMessage("<html><body>502 Bad Gateway</body></html>", "repli")).toBe(
      "repli"
    );
  });

  it("REFUSE une trace trop longue pour être un message", () => {
    expect(readableMessage("Traceback: ".repeat(60), "repli")).toBe("repli");
  });

  it("ignore un champ présent mais blanc", () => {
    expect(readableMessage({ detail: "  " }, "repli")).toBe("repli");
    expect(readableMessage("   ", "repli")).toBe("repli");
  });
});
