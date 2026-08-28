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
});
