/**
 * La porte d'abonnement, règle par règle.
 *
 * Deux d'entre elles valent tout le reste, et se lisent dans les deux sens :
 *
 * - **verdict absent ⇒ OUVERT** : sans elle, la mise à jour met dehors tout le
 *   parc déjà en service, dont les instantanés ne portent pas le champ ;
 * - **échéance dépassée ⇒ FERMÉ** : sans elle, le mode avion offre des mois
 *   gratuits, le dernier verdict connu restant « non bloqué » indéfiniment.
 */
import { avertissementAbonnement, jugerAcces } from "./porte";
import type { SessionSubscription } from "@/session/types";

const LE_10 = new Date("2026-09-10T12:00:00.000Z");

function abonnement(partiel: Partial<SessionSubscription> = {}): SessionSubscription {
  return {
    is_blocked: false,
    status: "active",
    message: null,
    access_until: "2026-09-30T00:00:00.000Z",
    days_remaining: 20,
    plan_id: null,
    plan_name: null,
    can_manage: true,
    ...partiel,
  };
}

describe("jugerAcces", () => {
  it("ouvre quand le verdict n'a jamais été reçu (le parc en service)", () => {
    expect(jugerAcces(null, null, LE_10)).toEqual({ ouvert: true });
    expect(jugerAcces(undefined, null, LE_10)).toEqual({ ouvert: true });
  });

  it("ferme quand le serveur a tranché", () => {
    expect(jugerAcces(abonnement({ is_blocked: true }), null, LE_10)).toEqual({
      ouvert: false,
      motif: "serveur",
    });
  });

  it("ferme même si le verdict lu disait « ouvert », dès que la date est passée", () => {
    const echu = abonnement({ access_until: "2026-09-01T00:00:00.000Z" });
    expect(jugerAcces(echu, null, LE_10)).toEqual({
      ouvert: false,
      motif: "echeance",
    });
  });

  it("ouvre tant que la date payée n'est pas atteinte", () => {
    expect(jugerAcces(abonnement(), null, LE_10)).toEqual({ ouvert: true });
  });

  it("ouvre plutôt que de fabriquer une échéance absente ou illisible", () => {
    expect(jugerAcces(abonnement({ access_until: null }), null, LE_10)).toEqual({
      ouvert: true,
    });
    expect(jugerAcces(abonnement({ access_until: "pas une date" }), null, LE_10)).toEqual({
      ouvert: true,
    });
  });

  describe("l'horloge du terminal", () => {
    const echu = abonnement({ access_until: "2026-09-01T00:00:00.000Z" });
    const dernierReveil = "2026-09-10T12:00:00.000Z";

    it("reculée de deux mois, ne rouvre RIEN", () => {
      // Le geste du fraudeur : reculer la date pour se rendre « en cours ».
      // Le plancher est l'heure SERVEUR du dernier réveil, qui ne recule pas.
      const enJuillet = new Date("2026-07-01T00:00:00.000Z");
      expect(jugerAcces(echu, dernierReveil, enJuillet)).toEqual({
        ouvert: false,
        motif: "echeance",
      });
    });

    it("reculée, ne rouvre pas non plus un abonnement encore valide par erreur", () => {
      // Sans plancher, on lirait juillet contre une échéance de septembre et
      // on ouvrirait : c'est le bon résultat ici, et il doit le rester.
      const enJuillet = new Date("2026-07-01T00:00:00.000Z");
      expect(jugerAcces(abonnement(), dernierReveil, enJuillet)).toEqual({
        ouvert: true,
      });
    });

    it("avancée, ferme plus tôt - et c'est assumé", () => {
      const enOctobre = new Date("2026-10-01T00:00:00.000Z");
      expect(jugerAcces(abonnement(), null, enOctobre)).toEqual({
        ouvert: false,
        motif: "echeance",
      });
    });
  });
});

describe("avertissementAbonnement", () => {
  it("se tait quand rien ne presse", () => {
    expect(avertissementAbonnement(abonnement({ days_remaining: 20 }))).toBeNull();
    expect(avertissementAbonnement(null)).toBeNull();
  });

  it("se tait quand la porte est DÉJÀ fermée : la surcouche parle à sa place", () => {
    expect(avertissementAbonnement(abonnement({ is_blocked: true }))).toBeNull();
  });

  it("prévient pendant la période de grâce", () => {
    const a = avertissementAbonnement(abonnement({ status: "past_due" }));
    expect(a?.titre).toBe("Abonnement échu");
  });

  it("prévient dans les cinq derniers jours, et accorde le pluriel", () => {
    expect(avertissementAbonnement(abonnement({ days_remaining: 3 }))?.message).toContain(
      "3 jours",
    );
    expect(avertissementAbonnement(abonnement({ days_remaining: 1 }))?.message).toContain(
      "1 jour",
    );
  });

  it("distingue l'essai d'un abonnement payant", () => {
    const essai = avertissementAbonnement(
      abonnement({ status: "trial", days_remaining: 2 }),
    );
    expect(essai?.titre).toBe("Essai gratuit");
  });
});
