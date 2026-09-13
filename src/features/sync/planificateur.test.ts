import {
  CADENCE_ENVOI_MS,
  DEBOUNCE_JOURNAL_MS,
  DELAI_ENTREE_MS,
  GIGUE_RESEAU_MS,
  PLANCHER_COMPLET_MS,
  decider,
  type Declencheur,
  type EntreePlanificateur,
} from "./planificateur";

const MAINTENANT = new Date("2026-09-12T10:00:00.000Z");

function entree(p: Partial<EntreePlanificateur> = {}): EntreePlanificateur {
  return {
    declencheur: "manuel",
    enLigne: true,
    cycleEnCours: false,
    nbPret: 0,
    prochaineTentativeAt: null,
    derniereComplete: null,
    maintenant: MAINTENANT,
    alea: 0.5,
    ...p,
  };
}

const AUTOMATIQUES: Declencheur[] = [
  "entree",
  "reseau",
  "premier-plan",
  "journal",
  "minuteur",
];

describe("le planificateur de synchronisation", () => {
  describe("hors ligne", () => {
    it("ne lance AUCUN déclencheur automatique", () => {
      for (const declencheur of AUTOMATIQUES) {
        const d = decider(entree({ declencheur, enLigne: false, nbPret: 5 }));
        expect(d.lancer).toBe(false);
        expect(d.motif).toBe("hors ligne");
      }
    });

    it("lance quand même la demande de l'utilisateur", () => {
      // Il a appuyé : il mérite une réponse, fût-elle « Serveur injoignable ».
      const d = decider(entree({ declencheur: "manuel", enLigne: false }));
      expect(d.lancer).toBe(true);
      expect(d.portee).toBe("complet");
    });

    it("ne programme aucun réveil, même avec des opérations prêtes", () => {
      const d = decider(entree({ declencheur: "journal", enLigne: false, nbPret: 9 }));
      expect(d.reveilDans).toBeNull();
    });
  });

  describe("un seul cycle à la fois", () => {
    it("refuse tout déclencheur pendant qu'un cycle tourne, le manuel compris", () => {
      for (const declencheur of [...AUTOMATIQUES, "manuel" as const]) {
        const d = decider(entree({ declencheur, cycleEnCours: true, nbPret: 3 }));
        expect(d.lancer).toBe(false);
      }
    });
  });

  describe("l'écriture locale", () => {
    it("ne lance rien quand le journal n'a rien de prêt", () => {
      // C'est la pièce maîtresse : sans elle, les écritures de `pushOnce`
      // relanceraient un cycle à vide, et les boutons de vingt écrans
      // clignoteraient au hasard.
      const d = decider(entree({ declencheur: "journal", nbPret: 0 }));
      expect(d.lancer).toBe(false);
    });

    it("envoie, sans tirer, et laisse le temps à la rafale de se réunir", () => {
      const d = decider(entree({ declencheur: "journal", nbPret: 1 }));
      expect(d.lancer).toBe(true);
      expect(d.portee).toBe("envoi");
      expect(d.delaiMs).toBeGreaterThanOrEqual(DEBOUNCE_JOURNAL_MS);
    });
  });

  describe("le réveil programmé", () => {
    it("ne lance rien quand le journal n'a rien de prêt", () => {
      expect(decider(entree({ declencheur: "minuteur", nbPret: 0 })).lancer).toBe(false);
    });

    it("envoie sans attendre", () => {
      const d = decider(entree({ declencheur: "minuteur", nbPret: 2 }));
      expect(d.lancer).toBe(true);
      expect(d.portee).toBe("envoi");
      expect(d.delaiMs).toBe(0);
    });
  });

  describe("l'entrée dans l'application", () => {
    it("tire tout, après avoir laissé le premier écran peindre", () => {
      const d = decider(entree({ declencheur: "entree" }));
      expect(d.lancer).toBe(true);
      expect(d.portee).toBe("complet");
      expect(d.delaiMs).toBe(DELAI_ENTREE_MS);
      expect(d.delaiMs).toBeGreaterThan(0);
    });
  });

  describe("le retour du réseau", () => {
    it("tire tout, mais jamais en choeur avec les terminaux voisins", () => {
      const d = decider(entree({ declencheur: "reseau", alea: 0.5 }));
      expect(d.lancer).toBe(true);
      expect(d.portee).toBe("complet");
      expect(d.delaiMs).toBeGreaterThan(0);
      expect(d.delaiMs).toBeLessThanOrEqual(GIGUE_RESEAU_MS);
    });

    it("étale les départs sur toute la fenêtre de gigue", () => {
      const bas = decider(entree({ declencheur: "reseau", alea: 0 })).delaiMs;
      const haut = decider(entree({ declencheur: "reseau", alea: 1 })).delaiMs;
      expect(bas).toBe(0);
      expect(haut).toBe(GIGUE_RESEAU_MS);
    });

    it("borne un tirage aberrant plutôt que de le propager", () => {
      expect(decider(entree({ declencheur: "reseau", alea: -3 })).delaiMs).toBe(0);
      expect(decider(entree({ declencheur: "reseau", alea: 42 })).delaiMs).toBe(GIGUE_RESEAU_MS);
      expect(decider(entree({ declencheur: "reseau", alea: Number.NaN })).delaiMs).toBe(0);
    });
  });

  describe("le retour au premier plan", () => {
    it("tire tout quand rien n'a jamais été tiré", () => {
      const d = decider(entree({ declencheur: "premier-plan", derniereComplete: null }));
      expect(d.portee).toBe("complet");
    });

    it("tire tout quand le dernier tirage a passé le plancher", () => {
      const vieux = new Date(MAINTENANT.getTime() - PLANCHER_COMPLET_MS - 1);
      const d = decider(entree({ declencheur: "premier-plan", derniereComplete: vieux }));
      expect(d.portee).toBe("complet");
    });

    it("ne refait PAS un tirage complet sous le plancher", () => {
      // Le verrouillage remonte le groupe (app) toutes les cinq minutes : sans
      // plancher, un caissier qui repose son terminal sonderait trente-huit
      // tables à chaque reprise.
      const recent = new Date(MAINTENANT.getTime() - 60_000);
      const d = decider(entree({ declencheur: "premier-plan", derniereComplete: recent, nbPret: 0 }));
      expect(d.lancer).toBe(false);
    });

    it("se rabat sur l'envoi seul quand il reste quelque chose à pousser", () => {
      const recent = new Date(MAINTENANT.getTime() - 60_000);
      const d = decider(entree({ declencheur: "premier-plan", derniereComplete: recent, nbPret: 4 }));
      expect(d.lancer).toBe(true);
      expect(d.portee).toBe("envoi");
    });
  });

  describe("le prochain réveil", () => {
    it("est NUL quand le journal est vide et qu'aucune tentative n'est programmée", () => {
      // Aucun minuteur en régime normal : c'est ce qui empêche les boutons de
      // vingt écrans de clignoter.
      const d = decider(entree({ declencheur: "journal", nbPret: 0 }));
      expect(d.reveilDans).toBeNull();
    });

    it("bat à la cadence d'envoi tant qu'il reste quelque chose de prêt", () => {
      const d = decider(entree({ declencheur: "journal", nbPret: 1 }));
      expect(d.reveilDans).toBe(CADENCE_ENVOI_MS);
    });

    it("honore une temporisation à venir, sans quoi un `retry` n'est jamais réessayé", () => {
      const dans10s = new Date(MAINTENANT.getTime() + 10_000);
      const d = decider(entree({ declencheur: "minuteur", nbPret: 0, prochaineTentativeAt: dans10s }));
      expect(d.lancer).toBe(false);
      expect(d.reveilDans).toBe(10_000);
    });

    it("retient la plus proche des deux échéances", () => {
      const dans10s = new Date(MAINTENANT.getTime() + 10_000);
      const d = decider(entree({ declencheur: "journal", nbPret: 2, prochaineTentativeAt: dans10s }));
      expect(d.reveilDans).toBe(10_000);
    });

    it("ne rend jamais un délai négatif pour une échéance déjà passée", () => {
      const passe = new Date(MAINTENANT.getTime() - 90_000);
      const d = decider(entree({ declencheur: "minuteur", nbPret: 0, prochaineTentativeAt: passe }));
      expect(d.reveilDans).toBe(0);
    });
  });
});
