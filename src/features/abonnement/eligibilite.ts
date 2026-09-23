/**
 * Ce que le serveur acceptera de faire payer, décidé AVANT de le lui demander.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN BOUTON NE DOIT JAMAIS PROPOSER CE QUI SERA REFUSÉ.                   │
 * │                                                                          │
 * │ L'écran offrait « Choisir ce plan » sur des offres que `evaluate_checkout│
 * │ ` refuse. Relevé au comptoir : le marchand choisit sa fréquence, son     │
 * │ opérateur, tape son numéro, appuie sur « Payer » - et lit                │
 * │ « Pendant la période en cours, seul un plan à palier strictement         │
 * │ supérieur est disponible ». Tout ce travail pour un refus que l'écran    │
 * │ connaissait dès son premier rendu.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ **Miroir de `SubscriptionService.evaluate_checkout`**, dans son ordre
 * exact. Le serveur reste l'autorité - il refuse pour de bon, et son message
 * prime - mais le comptoir ne doit pas conduire jusqu'à lui pour rien.
 *
 * Module PUR : la règle se lit sans base ni réseau, et chaque branche a son
 * test. Une règle fausse ici ne lève rien, elle grise un bouton qui devrait
 * s'ouvrir - ou pire, en ouvre un qui devrait rester fermé.
 */
import type { EtatAbonnement, PlanAbonnement } from "@/data/abonnement";

export type ModeAchat = "new" | "extend";

export type Eligibilite =
  | { possible: true; mode: ModeAchat; libelle: string }
  | { possible: false; libelle: string; raison: string };

/**
 * Ce que ce plan propose, et pourquoi il ne propose rien.
 *
 * Les libellés reprennent ceux du back-office : « Prolonger », « Renouveler »,
 * « Choisir ce plan ». Deux surfaces qui nomment différemment le même geste
 * font douter qu'il s'agisse du même.
 */
export function eligibiliteDuPlan(
  plan: PlanAbonnement,
  etat: EtatAbonnement | null
): Eligibilite {
  if (!etat) {
    return { possible: false, libelle: "Choisir", raison: "État de l'abonnement inconnu." };
  }

  // 1. Le plancher anti-rétrogradation, que rien ne lève.
  if (plan.tier < etat.tierPlancher) {
    return {
      possible: false,
      libelle: "Indisponible",
      raison: "Ce plan est en dessous de ce que vous utilisez déjà.",
    };
  }

  const payant = plan.prixMensuel > 0 || plan.prixAnnuel > 0;

  // 2. Aucun abonnement en cours : tout ce qui est au-dessus du plancher passe.
  if (!etat.aUnAbonnement || !etat.periodeEnCours) {
    if (!payant) {
      return {
        possible: false,
        libelle: "Indisponible",
        raison: "Ce plan ne se règle pas en ligne.",
      };
    }
    return {
      possible: true,
      mode: "new",
      libelle: etat.planId === plan.id ? "Renouveler" : "Choisir ce plan",
    };
  }

  // 3. UN ESSAI N'EST PAS UNE PÉRIODE PAYÉE : on le convertit quand on veut.
  //    Sans cette branche, le plan d'essai et le premier plan payant partageant
  //    le palier 1, aucun plan n'était « strictement supérieur » et le marchand
  //    ne pouvait rien régler avant d'être bloqué.
  if (etat.essaiEnCours) {
    if (!payant) {
      return {
        possible: false,
        libelle: "Essai en cours",
        raison: "Votre essai est déjà en cours.",
      };
    }
    return { possible: true, mode: "new", libelle: "Passer au payant" };
  }

  // 4. Période PAYÉE en cours : on prolonge le sien, on ne renouvelle pas tôt.
  if (etat.planId === plan.id) {
    return { possible: true, mode: "extend", libelle: "Prolonger" };
  }

  // 5. Un autre plan pendant une période payée : seulement vers le haut.
  if (etat.tierCourant !== null && plan.tier <= etat.tierCourant) {
    return {
      possible: false,
      libelle: "Indisponible",
      raison:
        "Pendant la période en cours, seul un plan supérieur peut être souscrit.",
    };
  }

  return { possible: true, mode: "new", libelle: "Passer à ce plan" };
}

/**
 * Le plan à proposer d'emblée, ou `null` si aucun n'est payable.
 *
 * Celui en cours d'abord - on renouvelle bien plus souvent qu'on ne change
 * d'offre - puis le moins cher de ce qui reste. ⚠ On ne retient QUE des plans
 * éligibles : le voile de blocage ouvre sa feuille sans que personne ne
 * choisisse, et proposer là un plan refusé mènerait droit au mur.
 */
export function planAProposer(
  plans: PlanAbonnement[],
  etat: EtatAbonnement | null
): { plan: PlanAbonnement; mode: ModeAchat } | null {
  const possibles = plans
    .map((p) => ({ plan: p, e: eligibiliteDuPlan(p, etat) }))
    .filter((x): x is { plan: PlanAbonnement; e: Extract<Eligibilite, { possible: true }> } =>
      x.e.possible
    );
  if (possibles.length === 0) return null;

  const courant = possibles.find((x) => x.plan.id === etat?.planId);
  const retenu = courant ?? possibles.sort((a, b) => a.plan.tier - b.plan.tier)[0];
  return { plan: retenu.plan, mode: retenu.e.mode };
}
