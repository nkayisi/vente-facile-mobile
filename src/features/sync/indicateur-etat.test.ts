import type { OutboxState } from "@/sync";

import { PLAFOND_BADGE, etatIndicateur } from "./indicateur-etat";

function compteurs(p: Partial<Record<OutboxState, number>> = {}): Record<OutboxState, number> {
  return { pending: 0, inflight: 0, done: 0, quarantined: 0, blocked: 0, ...p };
}

const REPOS = { cycleEnCours: false, enLigne: true, compteurs: compteurs() };

describe("l'état du témoin de synchronisation", () => {
  describe("la priorité des états", () => {
    it("un cycle qui tourne prime sur tout le reste", () => {
      const e = etatIndicateur({
        cycleEnCours: true,
        enLigne: false,
        compteurs: compteurs({ pending: 3, blocked: 1, quarantined: 2 }),
      });
      expect(e.icone).toBe("RefreshCw");
      expect(e.anime).toBe(true);
    });

    it("un refus prime sur un blocage, sur l'absence de réseau et sur l'attente", () => {
      const e = etatIndicateur({
        ...REPOS,
        enLigne: false,
        compteurs: compteurs({ pending: 4, blocked: 2, quarantined: 1 }),
      });
      expect(e.icone).toBe("AlertTriangle");
      expect(e.couleur).toBe("destructive");
    });

    it("un blocage prime sur l'absence de réseau et sur l'attente", () => {
      const e = etatIndicateur({
        ...REPOS,
        enLigne: false,
        compteurs: compteurs({ pending: 4, blocked: 2 }),
      });
      expect(e.icone).toBe("AlertTriangle");
      expect(e.couleur).toBe("warning");
    });

    it("l'absence de réseau prime sur la simple attente", () => {
      const e = etatIndicateur({ ...REPOS, enLigne: false, compteurs: compteurs({ pending: 4 }) });
      expect(e.icone).toBe("CloudOff");
    });

    it("l'attente se lit quand tout le reste est calme", () => {
      const e = etatIndicateur({ ...REPOS, compteurs: compteurs({ pending: 2, inflight: 1 }) });
      expect(e.icone).toBe("Clock");
    });

    it("rien à signaler reste VISIBLE et discret", () => {
      // Un bouton qui disparaît quand tout va bien est un bouton qu'on ne
      // retrouve plus quand il le faut.
      const e = etatIndicateur(REPOS);
      expect(e.icone).toBe("CheckCircle2");
      expect(e.couleur).toBe("mutedForeground");
      expect(e.anime).toBe(false);
    });
  });

  describe("la rotation", () => {
    it("ne tourne que pendant un cycle", () => {
      for (const c of [compteurs(), compteurs({ pending: 5 }), compteurs({ quarantined: 1 })]) {
        expect(etatIndicateur({ ...REPOS, compteurs: c }).anime).toBe(false);
      }
      expect(etatIndicateur({ ...REPOS, cycleEnCours: true }).anime).toBe(true);
    });
  });

  describe("la pastille", () => {
    it("compte TOUT ce qui n'est pas arrivé, quarantaine comprise", () => {
      // Une opération refusée qui ne serait pas comptée laisserait croire que
      // tout est parti, alors qu'une vente est bloquée.
      const e = etatIndicateur({
        ...REPOS,
        compteurs: compteurs({ pending: 2, inflight: 1, blocked: 3, quarantined: 4 }),
      });
      expect(e.badge).toBe("10");
    });

    it("ne compte pas ce qui est arrivé", () => {
      const e = etatIndicateur({ ...REPOS, compteurs: compteurs({ done: 120 }) });
      expect(e.badge).toBeNull();
    });

    it("disparaît quand il n'y a rien à compter", () => {
      expect(etatIndicateur(REPOS).badge).toBeNull();
    });

    it("plafonne plutôt que de déborder de sa pastille", () => {
      const e = etatIndicateur({ ...REPOS, compteurs: compteurs({ pending: PLAFOND_BADGE + 1 }) });
      expect(e.badge).toBe(`${PLAFOND_BADGE}+`);
    });

    it("rend le nombre exact tant qu'il tient", () => {
      const e = etatIndicateur({ ...REPOS, compteurs: compteurs({ pending: PLAFOND_BADGE }) });
      expect(e.badge).toBe(String(PLAFOND_BADGE));
    });
  });

  describe("l'étiquette parlée", () => {
    it("s'accorde en nombre", () => {
      // « +1 nouveaux » ne s'accorde pas : le dépôt a déjà dû corriger cette
      // faute sur le tableau de bord.
      const un = etatIndicateur({ ...REPOS, compteurs: compteurs({ pending: 1 }) }).libelle;
      const trois = etatIndicateur({ ...REPOS, compteurs: compteurs({ pending: 3 }) }).libelle;
      expect(un).toContain("1 opération attend son envoi");
      expect(trois).toContain("3 opérations attendent leur envoi");
    });

    it("nomme le nombre de refus", () => {
      const e = etatIndicateur({ ...REPOS, compteurs: compteurs({ quarantined: 2 }) });
      expect(e.libelle).toContain("2 opérations refusées");
    });

    it("emprunte au vocabulaire commun pour un blocage", () => {
      // Deux écrans qui nomment différemment le même état font douter qu'il
      // s'agisse du même.
      const e = etatIndicateur({ ...REPOS, compteurs: compteurs({ blocked: 1 }) });
      expect(e.libelle).toMatch(/en attente d'un droit/i);
      expect(e.libelle).not.toMatch(/synchronis|réessay/i);
    });

    it("dit ce qui attend le réseau quand il n'y en a pas", () => {
      const avec = etatIndicateur({ ...REPOS, enLigne: false, compteurs: compteurs({ pending: 2 }) });
      expect(avec.libelle).toContain("Hors ligne");
      expect(avec.libelle).toContain("2 opérations attendent le réseau");

      const sans = etatIndicateur({ ...REPOS, enLigne: false });
      expect(sans.libelle).toBe("Hors ligne.");
    });

    it("porte toujours une aide qui nomme la pression longue", () => {
      const cas = [
        REPOS,
        { ...REPOS, cycleEnCours: true },
        { ...REPOS, enLigne: false },
        { ...REPOS, compteurs: compteurs({ quarantined: 1 }) },
        { ...REPOS, compteurs: compteurs({ blocked: 1 }) },
        { ...REPOS, compteurs: compteurs({ pending: 1 }) },
      ];
      for (const c of cas) {
        expect(etatIndicateur(c).hint).toMatch(/pression longue/i);
      }
    });
  });
});
