/**
 * Le miroir de `evaluate_checkout`, branche par branche.
 *
 * Le cas qui a motivé ce module est le DERNIER qu'on aurait deviné : sur un
 * ESSAI en cours, le plan payant partage son palier, donc « strictement
 * supérieur » n'était jamais vrai et RIEN n'était payable. L'écran proposait
 * quand même « Choisir ce plan », et le refus tombait après la saisie du
 * numéro de téléphone.
 */
import { eligibiliteDuPlan, planAProposer } from "./eligibilite";
import type { EtatAbonnement, PlanAbonnement } from "@/data/abonnement";

function plan(partiel: Partial<PlanAbonnement> = {}): PlanAbonnement {
  return {
    id: "std", nom: "Standard", code: "standard", description: "",
    prixMensuel: 3, prixAnnuel: 30, devise: "USD", tier: 1,
    miseEnAvant: false, limites: [], fonctions: [],
    ...partiel,
  };
}

function etat(partiel: Partial<EtatAbonnement> = {}): EtatAbonnement {
  return {
    aUnAbonnement: true, actif: true, bloque: false,
    statut: "active", statutLabel: "Actif", message: null,
    joursRestants: 10, planNom: "Standard", planId: "std",
    cycle: null, prix: 3, devise: "USD",
    debutPeriode: null, finPeriode: null, essai: false,
    tierPlancher: 0, tierCourant: 1, periodeEnCours: true,
    essaiEnCours: false, plafonds: [],
    ...partiel,
  };
}

describe("eligibiliteDuPlan", () => {
  describe("pendant un ESSAI", () => {
    const enEssai = etat({
      essaiEnCours: true, planId: "trial", tierCourant: 1, periodeEnCours: true,
    });

    it("laisse passer au PAYANT, même à palier égal", () => {
      // Le défaut d'origine : essai et plan payant partagent le palier 1.
      const e = eligibiliteDuPlan(plan({ tier: 1 }), enEssai);
      expect(e.possible).toBe(true);
      expect(e.possible && e.libelle).toBe("Passer au payant");
    });

    it("ne relance pas un essai gratuit par-dessus l'essai en cours", () => {
      const gratuit = plan({ id: "trial", prixMensuel: 0, prixAnnuel: 0 });
      expect(eligibiliteDuPlan(gratuit, enEssai).possible).toBe(false);
    });
  });

  describe("pendant une période PAYÉE", () => {
    it("propose de PROLONGER son propre plan", () => {
      const e = eligibiliteDuPlan(plan({ id: "std" }), etat({ planId: "std" }));
      expect(e.possible && e.mode).toBe("extend");
      expect(e.possible && e.libelle).toBe("Prolonger");
    });

    it("refuse un autre plan de palier ÉGAL ou inférieur", () => {
      // C'est la règle que le serveur oppose, et elle reste entière hors essai.
      const e = eligibiliteDuPlan(
        plan({ id: "autre", tier: 1 }),
        etat({ planId: "std", tierCourant: 1 })
      );
      expect(e.possible).toBe(false);
      expect(e.possible === false && e.raison).toContain("supérieur");
    });

    it("laisse monter vers un palier strictement supérieur", () => {
      const e = eligibiliteDuPlan(
        plan({ id: "pro", tier: 2 }),
        etat({ planId: "std", tierCourant: 1 })
      );
      expect(e.possible && e.mode).toBe("new");
    });
  });

  describe("période ÉCHUE ou aucun abonnement", () => {
    it("propose de RENOUVELER le plan échu", () => {
      const e = eligibiliteDuPlan(
        plan({ id: "std" }),
        etat({ planId: "std", periodeEnCours: false })
      );
      expect(e.possible && e.libelle).toBe("Renouveler");
      expect(e.possible && e.mode).toBe("new");
    });

    it("ouvre tous les plans quand il n'y a aucun abonnement", () => {
      const e = eligibiliteDuPlan(
        plan(),
        etat({ aUnAbonnement: false, periodeEnCours: false, planId: null })
      );
      expect(e.possible).toBe(true);
    });
  });

  it("le plancher anti-rétrogradation prime sur tout le reste", () => {
    // Redescendre retirerait des entrepôts ou des produits DÉJÀ créés.
    const e = eligibiliteDuPlan(
      plan({ tier: 1 }),
      etat({ tierPlancher: 3, essaiEnCours: true })
    );
    expect(e.possible).toBe(false);
    expect(e.possible === false && e.raison).toContain("déjà");
  });

  it("un état inconnu ne propose RIEN plutôt que de deviner", () => {
    expect(eligibiliteDuPlan(plan(), null).possible).toBe(false);
  });
});

describe("planAProposer", () => {
  const gratuit = plan({ id: "trial", nom: "Essai", prixMensuel: 0, prixAnnuel: 0 });
  const std = plan({ id: "std", tier: 1 });
  const pro = plan({ id: "pro", nom: "Pro", tier: 2, prixMensuel: 9 });

  it("écarte ce que le serveur refuserait", () => {
    // ⚠ Le voile ouvre sa feuille sans que personne ne choisisse : un plan
    // refusé proposé ici mène droit au mur.
    const choix = planAProposer(
      [gratuit, std],
      etat({ essaiEnCours: true, planId: "trial", tierCourant: 1 })
    );
    expect(choix?.plan.id).toBe("std");
  });

  it("préfère le plan EN COURS : on renouvelle plus souvent qu'on ne change", () => {
    const choix = planAProposer(
      [std, pro],
      etat({ planId: "std", periodeEnCours: false })
    );
    expect(choix?.plan.id).toBe("std");
  });

  it("rend null quand rien n'est payable, plutôt qu'un plan au hasard", () => {
    const choix = planAProposer([gratuit], etat({ essaiEnCours: true, planId: "trial" }));
    expect(choix).toBeNull();
  });
});
