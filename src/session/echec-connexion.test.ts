import { ApiError } from "@/api/errors";

import {
  PHRASE_ATTENTE,
  PHRASE_IDENTIFIANTS,
  PHRASE_REPLI,
  PHRASE_RESEAU,
  messageEchecConnexion,
} from "./echec-connexion";

describe("messageEchecConnexion", () => {
  it("dit le temps d'attente du verrou, avec la phrase du serveur", () => {
    const verrou = new ApiError("throttled", "Trop de tentatives de connexion. Réessayez dans 15 minutes.", {
      status: 429,
      code: "login_locked",
    });
    expect(messageEchecConnexion(verrou)).toBe("Trop de tentatives de connexion. Réessayez dans 15 minutes.");
  });

  it("ne dit JAMAIS « mot de passe incorrect » à qui est verrouillé ou limité", () => {
    for (const erreur of [
      new ApiError("throttled", "Trop de tentatives de connexion. Réessayez dans 3 minutes.", { code: "login_locked" }),
      new ApiError("throttled", "Erreur 429", { status: 429 }),
    ]) {
      expect(messageEchecConnexion(erreur)).not.toBe(PHRASE_IDENTIFIANTS);
    }
  });

  it("rend une phrase d'attente quand la limite n'est pas le verrou", () => {
    expect(messageEchecConnexion(new ApiError("throttled", "Erreur 429", { status: 429 }))).toBe(PHRASE_ATTENTE);
  });

  it("distingue le réseau d'un refus d'identité", () => {
    expect(messageEchecConnexion(new ApiError("network", "Le serveur est injoignable."))).toBe(PHRASE_RESEAU);
    expect(messageEchecConnexion(new ApiError("auth", "Email ou mot de passe incorrect", { status: 401 }))).toBe(
      PHRASE_IDENTIFIANTS
    );
  });

  it("garde le message du serveur pour les autres refus, et un repli sinon", () => {
    expect(messageEchecConnexion(new ApiError("request", "Saisissez une adresse valide.", { status: 400 }))).toBe(
      "Saisissez une adresse valide."
    );
    expect(messageEchecConnexion("inattendu")).toBe(PHRASE_REPLI);
  });
});
