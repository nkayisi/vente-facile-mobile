/**
 * La porte de mise à jour, règle par règle.
 *
 * Chaque règle a son test parce qu'une porte qui se ferme de travers met un
 * marchand dehors pour une raison qu'il ne peut pas corriger : il n'existe
 * aucune version plus récente à installer. Et ces règles ne lèvent jamais - la
 * seule trace d'une erreur est un terminal inutilisable.
 */
import type { SessionAppUpdate } from "@/session/types";

import { comparerVersions, jugerMiseAJour } from "./porte";

function exigence(partiel: Partial<SessionAppUpdate> = {}): SessionAppUpdate {
  return {
    minimum_version: null,
    current_version: null,
    store_urls: [],
    message: null,
    ...partiel,
  };
}

describe("comparerVersions", () => {
  it("compare en ENTIERS, jamais en chaînes", () => {
    // Le piège lexicographique : "1.10.0" < "1.9.0" en chaînes, donc le seuil
    // s'appliquerait à l'envers.
    expect(comparerVersions("1.10.0", "1.9.0")).toBe(1);
    expect(comparerVersions("1.9.0", "1.10.0")).toBe(-1);
    expect(comparerVersions("2.0.0", "1.99.99")).toBe(1);
  });

  it("complète les segments manquants par des ZÉROS", () => {
    expect(comparerVersions("1.2", "1.2.0")).toBe(0);
    expect(comparerVersions("1", "1.0.0")).toBe(0);
    // Les segments en trop sont comparés, pas tronqués.
    expect(comparerVersions("1.2.0.1", "1.2.0")).toBe(1);
  });

  it("absorbe les zéros de tête", () => {
    expect(comparerVersions("1.02.0", "1.2.0")).toBe(0);
  });

  it("ignore un suffixe", () => {
    // On ne publie pas de version candidate au magasin, et ordonner un suffixe
    // qu'on ne sait pas lire reviendrait à trancher sur l'illisible.
    expect(comparerVersions("1.2.3-rc.1", "1.2.3")).toBe(0);
    expect(comparerVersions("1.2.3 (42)", "1.2.3")).toBe(0);
  });

  it("rend null sur tout ce qui n'est pas lisible", () => {
    for (const valeur of ["v1.2.3", "", "abc", "...", ".1.2", null, undefined]) {
      expect(comparerVersions(valeur, "1.0.0")).toBeNull();
      expect(comparerVersions("1.0.0", valeur)).toBeNull();
    }
  });

  it("refuse un segment hors des entiers sûrs", () => {
    // `Number` y perdrait la précision et rendrait un ordre FAUX, en silence.
    // Le miroir serveur refuse au même seuil.
    expect(comparerVersions("9007199254740993.0.0", "1.0.0")).toBeNull();
  });
});

describe("jugerMiseAJour", () => {
  it("OUVRE quand l'exigence est absente", () => {
    // Le parc déjà en service : un instantané écrit avant ce lot ne porte pas
    // la clé. Fermer ici mettrait tout le monde dehors le jour de la mise à
    // jour, ce qui est exactement l'accident qu'on veut éviter.
    expect(jugerMiseAJour(undefined, "1.0.0")).toEqual({ ouvert: true });
    expect(jugerMiseAJour(null, "1.0.0")).toEqual({ ouvert: true });
  });

  it("OUVRE quand aucun seuil n'est posé", () => {
    // L'état par DÉFAUT, et la sortie d'urgence : vider le champ en
    // administration rouvre la porte au réveil suivant.
    expect(jugerMiseAJour(exigence(), "1.0.0")).toEqual({ ouvert: true });
    expect(jugerMiseAJour(exigence({ minimum_version: "" }), "1.0.0")).toEqual({
      ouvert: true,
    });
  });

  it("OUVRE quand la version installée est illisible", () => {
    // `nativeApplicationVersion` peut rendre `null`. On ne ferme JAMAIS sur ce
    // qu'on n'a pas su lire : ce serait enfermer un terminal pour un défaut
    // d'instrument.
    const e = exigence({ minimum_version: "9.9.9" });
    expect(jugerMiseAJour(e, null)).toEqual({ ouvert: true });
    expect(jugerMiseAJour(e, "")).toEqual({ ouvert: true });
    expect(jugerMiseAJour(e, "inconnue")).toEqual({ ouvert: true });
  });

  it("OUVRE quand le seuil lui-même est illisible", () => {
    // Le serveur valide la forme à la saisie ; ceci est la ceinture, pour ne
    // pas dépendre de lui afin de ne pas fermer.
    expect(jugerMiseAJour(exigence({ minimum_version: "derniere" }), "1.0.0")).toEqual({
      ouvert: true,
    });
  });

  it("FERME quand la version installée est sous le seuil", () => {
    expect(jugerMiseAJour(exigence({ minimum_version: "1.3.0" }), "1.2.9")).toEqual({
      ouvert: false,
      motif: "version_minimale",
    });
  });

  it("OUVRE à égalité, et au-dessus", () => {
    // Le seuil est un MINIMUM : l'exiger strictement supérieur bloquerait la
    // version même qu'on demande d'installer.
    const e = exigence({ minimum_version: "1.3.0" });
    expect(jugerMiseAJour(e, "1.3.0")).toEqual({ ouvert: true });
    expect(jugerMiseAJour(e, "1.4.0")).toEqual({ ouvert: true });
    expect(jugerMiseAJour(e, "2.0.0")).toEqual({ ouvert: true });
  });

  it("ne regarde QUE le seuil, jamais la version courante du magasin", () => {
    // `current_version` sert à NOMMER ce qu'il faut installer. La prendre pour
    // un seuil bloquerait le parc à chaque publication.
    const e = exigence({ minimum_version: "1.0.0", current_version: "9.9.9" });
    expect(jugerMiseAJour(e, "1.0.0")).toEqual({ ouvert: true });
  });
});
