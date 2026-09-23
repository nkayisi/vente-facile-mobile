/**
 * L'abonnement, servi par le SERVEUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN EXIGE LE RÉSEAU, ET C'EST LE BON ARBITRAGE.                   │
 * │                                                                          │
 * │ `subscriptions` n'est pas au manifeste de tirage, et n'a rien à y faire :│
 * │ un abonnement est une relation avec l'éditeur, pas une donnée de         │
 * │ comptoir. Le terminal n'a besoin de rien de tout cela pour vendre.       │
 * │                                                                          │
 * │ Ce qui DOIT marcher hors ligne, c'est vendre et encaisser. Un abonnement │
 * │ expiré ne bloque d'ailleurs pas la vente locale : il fait répondre 402   │
 * │ à la POUSSÉE, verdict `blocked`, opérations conservées. L'écran des      │
 * │ opérations à corriger le dit déjà ; celui-ci dit POURQUOI.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Le paiement est NATIF, et il n'a jamais eu besoin de ne pas l'être.**
 * Ce fichier a longtemps affirmé que « Moko passe par une page hébergée » et
 * qu'il fallait donc sortir vers le navigateur du système. C'était FAUX :
 * `frontend/app/payment/checkout/page.tsx` est un simple formulaire REST - un
 * cycle, un opérateur, un numéro - suivi d'une interrogation toutes les douze
 * secondes. Aucune page hébergée, aucune redirection, donc aucune WebView et
 * aucun motif de refus 4.2. Le terminal fait exactement la même chose.
 */
import { api } from "@/api/client";

const nb = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Un plafond du plan. `limite` à `null` : illimité, ce qui n'est PAS zéro. */
export interface Plafond {
  label: string;
  utilise: number;
  limite: number | null;
}

export interface PlanAbonnement {
  id: string;
  nom: string;
  code: string;
  description: string;
  prixMensuel: number;
  prixAnnuel: number;
  devise: string;
  tier: number;
  miseEnAvant: boolean;
  /** Les plafonds du plan, dans l'ordre du web. */
  limites: { label: string; valeur: string }[];
  fonctions: string[];
}

export interface PaiementAbonnement {
  id: string;
  montant: number;
  devise: string;
  moyen: string;
  statut: string;
  statutLabel: string;
  reference: string;
  paye: Date | null;
}

export interface FactureAbonnement {
  id: string;
  numero: string;
  statut: string;
  statutLabel: string;
  total: number;
  devise: string;
  emise: Date | null;
  echeance: Date | null;
  payee: Date | null;
}

export interface EtatAbonnement {
  aUnAbonnement: boolean;
  actif: boolean;
  bloque: boolean;
  statut: string;
  statutLabel: string;
  message: string | null;
  joursRestants: number | null;
  planNom: string | null;
  planId: string | null;
  cycle: string | null;
  prix: number | null;
  devise: string;
  debutPeriode: Date | null;
  finPeriode: Date | null;
  essai: boolean;
  /** Le plancher anti-rétrogradation : un plan en dessous est refusé. */
  tierPlancher: number;
  /** Le palier du plan EN COURS, et si sa période court encore. */
  tierCourant: number | null;
  periodeEnCours: boolean;
  /** Un essai n'est pas une période payée : il se convertit, il ne se prolonge pas. */
  essaiEnCours: boolean;
  plafonds: Plafond[];
}

/** Libellés et tons des statuts, repris du back-office mot pour mot. */
export const STATUT_ABONNEMENT: Record<
  string,
  { label: string; ton: "neutral" | "warning" | "success" | "primary" | "destructive" }
> = {
  trial: { label: "Essai", ton: "primary" },
  active: { label: "Actif", ton: "success" },
  past_due: { label: "En retard", ton: "warning" },
  expired: { label: "Expiré", ton: "destructive" },
  cancelled: { label: "Annulé", ton: "neutral" },
  suspended: { label: "Suspendu", ton: "destructive" },
};

export const STATUT_PAIEMENT: Record<
  string,
  { label: string; ton: "neutral" | "warning" | "success" | "destructive" }
> = {
  pending: { label: "En attente", ton: "warning" },
  completed: { label: "Payé", ton: "success" },
  failed: { label: "Échoué", ton: "destructive" },
  refunded: { label: "Remboursé", ton: "neutral" },
};

/**
 * Le CODE d'une devise, d'où qu'il vienne.
 *
 * `Plan.currency` est un OBJET (`{ id, code, symbol }`), là où `Subscription`
 * porte une chaîne. Passer l'objet au formateur imprimait « 3 [object Object] »
 * sur la grille des plans - relevé sur l'émulateur, invisible à la relecture
 * puisque les deux champs portent le même nom.
 */
export const codeDevise = (v: unknown, repli = "CDF"): string => {
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object") {
    const c = (v as { code?: unknown }).code;
    if (typeof c === "string" && c) return c;
  }
  return repli;
};

const date = (v: unknown): Date | null => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

function entetes(organisation: string) {
  return { headers: { "X-Organization-ID": organisation } };
}

/** Un plafond se lit « 3 sur 10 », ou « 3 » quand rien ne borne. */
export function lirePlafond(p: Plafond): string {
  return p.limite === null ? `${p.utilise}` : `${p.utilise} sur ${p.limite}`;
}

export async function etatAbonnement(organisation: string): Promise<EtatAbonnement> {
  const d = await api.get<Record<string, any>>(
    "/subscriptions/status/",
    entetes(organisation)
  );
  const s = d.subscription ?? null;
  const plan = d.plan ?? null;
  const q = d.quotas ?? {};

  // `limit` à `null` veut dire ILLIMITÉ, et se lit comme tel. Le confondre
  // avec zéro afficherait « 3 sur 0 », c'est-à-dire un dépassement imaginaire.
  const plafond = (label: string, brut: any): Plafond | null =>
    brut
      ? {
          label,
          utilise: nb(brut.current),
          limite: brut.limit === null || brut.limit === undefined ? null : nb(brut.limit),
        }
      : null;

  const statut = String(d.status ?? s?.status ?? "");

  return {
    aUnAbonnement: Boolean(d.has_subscription),
    actif: Boolean(d.is_active),
    bloque: Boolean(d.is_blocked),
    statut,
    statutLabel: STATUT_ABONNEMENT[statut]?.label ?? statut,
    message: typeof d.message === "string" && d.message ? d.message : null,
    joursRestants:
      d.days_remaining === null || d.days_remaining === undefined
        ? (s?.days_remaining ?? null)
        : nb(d.days_remaining),
    planNom: plan?.name ?? null,
    planId: s?.plan ?? q.current_plan_id ?? null,
    cycle: s?.billing_cycle_display ?? null,
    prix: s?.price === undefined || s?.price === null ? null : nb(s.price),
    devise: codeDevise(s?.currency ?? plan?.currency),
    debutPeriode: date(s?.current_period_start),
    finPeriode: date(s?.current_period_end ?? q.period_end),
    essai: Boolean(s?.is_trial),
    tierPlancher: nb(q.subscription_floor_tier),
    tierCourant:
      q.plan_tier === null || q.plan_tier === undefined ? null : nb(q.plan_tier),
    periodeEnCours: Boolean(q.period_not_ended),
    essaiEnCours: Boolean(s?.is_trial),
    plafonds: [
      plafond("Utilisateurs", q.users),
      plafond("Succursales", q.branches),
      plafond("Entrepôts", q.warehouses),
      plafond("Produits", q.products),
    ].filter((p): p is Plafond => p !== null),
  };
}

/** Le nombre brut, ou « Illimité ». Jamais « 0 » pour une absence de borne. */
function borne(v: unknown): string {
  if (v === null || v === undefined) return "Illimité";
  return String(nb(v));
}

export async function plansDisponibles(
  organisation: string
): Promise<PlanAbonnement[]> {
  const d = await api.get<any>("/plans/", entetes(organisation));
  const liste: any[] = Array.isArray(d) ? d : (d?.results ?? []);
  return (
    liste
      // Le web écarte l'essai de la grille : on ne « choisit » pas un essai.
      .filter((p) => String(p.code ?? "").toLowerCase() !== "trial")
      .map((p) => ({
        id: String(p.id),
        nom: String(p.name ?? ""),
        code: String(p.code ?? ""),
        description: String(p.description ?? ""),
        prixMensuel: nb(p.price_monthly),
        prixAnnuel: nb(p.price_yearly),
        devise: codeDevise(p.currency),
        tier: nb(p.tier),
        miseEnAvant: Boolean(p.is_featured),
        limites: [
          { label: "Utilisateurs", valeur: borne(p.max_users) },
          { label: "Succursales", valeur: borne(p.max_branches) },
          { label: "Entrepôts", valeur: borne(p.max_warehouses) },
          { label: "Produits", valeur: borne(p.max_products) },
        ],
        fonctions: Array.isArray(p.plan_features)
          ? p.plan_features
              .map((f: any) => String(f.name ?? f.feature_name ?? ""))
              .filter(Boolean)
          : [],
      }))
      .sort((a, b) => a.tier - b.tier)
  );
}

export async function paiementsAbonnement(
  organisation: string
): Promise<PaiementAbonnement[]> {
  const d = await api.get<any>("/subscriptions/payments/", entetes(organisation));
  const liste: any[] = Array.isArray(d) ? d : (d?.results ?? []);
  return liste.map((p) => ({
    id: String(p.id),
    montant: nb(p.amount),
    devise: codeDevise(p.currency),
    moyen: String(p.payment_method_display ?? p.payment_method ?? ""),
    statut: String(p.status ?? ""),
    statutLabel: String(
      p.status_display ?? STATUT_PAIEMENT[String(p.status)]?.label ?? p.status ?? ""
    ),
    reference: String(p.reference ?? ""),
    paye: date(p.paid_at),
  }));
}

export async function facturesAbonnement(
  organisation: string
): Promise<FactureAbonnement[]> {
  const d = await api.get<any>("/subscriptions/invoices/", entetes(organisation));
  const liste: any[] = Array.isArray(d) ? d : (d?.results ?? []);
  return liste.map((f) => ({
    id: String(f.id),
    numero: String(f.invoice_number ?? ""),
    statut: String(f.status ?? ""),
    statutLabel: String(f.status_display ?? f.status ?? ""),
    total: nb(f.total),
    devise: codeDevise(f.currency),
    emise: date(f.issue_date),
    echeance: date(f.due_date),
    payee: date(f.paid_date),
  }));
}


// --------------------------------------------------------------- paiement

/**
 * Les quatre opérateurs Mobile Money, dans l'ordre du back-office.
 *
 * La liste est FERMÉE côté serveur (`MokoOperator`) : en ajouter un ici sans
 * l'ajouter là-bas ferait refuser le paiement après la saisie du numéro.
 */
export const OPERATEURS = [
  { id: "airtel", label: "Airtel Money", court: "Airtel" },
  { id: "orange", label: "Orange Money", court: "Orange" },
  { id: "mpesa", label: "M-Pesa", court: "M-Pesa" },
  { id: "africell", label: "Afrimoney", court: "Afrimoney" },
] as const;

export type OperateurMoko = (typeof OPERATEURS)[number]["id"];
export type CycleFacturation = "monthly" | "quarterly" | "yearly";

export const CYCLES = [
  { id: "monthly", label: "Mensuel", par: "par mois", jours: 30 },
  { id: "quarterly", label: "Trimestriel", par: "par trimestre", jours: 90 },
  { id: "yearly", label: "Annuel", par: "par an", jours: 360 },
] as const;

/** Les jours qu'un cycle ajoute, tels que le serveur les compte. */
export function joursDuCycle(cycle: CycleFacturation): number {
  return CYCLES.find((c) => c.id === cycle)?.jours ?? 30;
}

/** Douze secondes entre deux sondages, trois minutes avant d'abandonner. */
export const INTERVALLE_SONDAGE_MS = 12_000;
export const DELAI_SONDAGE_MS = 180_000;

/**
 * Le montant d'un cycle.
 *
 * ⚠ **C'est le SERVEUR qui arrête le montant** (`_subscription_checkout_amount`).
 * Cette fonction n'existe que pour l'ANNONCER avant l'envoi : un écart ferait
 * payer autre chose que ce qui est écrit à l'écran. Les trois formules sont
 * donc recopiées à l'identique, et un test les y compare.
 */
export function montantDuCycle(plan: PlanAbonnement, cycle: CycleFacturation): number {
  if (cycle === "yearly") return plan.prixAnnuel;
  if (cycle === "quarterly") return plan.prixMensuel * 3;
  return plan.prixMensuel;
}

/**
 * Le numéro Mobile Money, tel que le serveur le lira.
 *
 * Miroir de `_normalize_customer_number` : chiffres seuls. Le contrôle des neuf
 * chiffres est fait ici pour épargner un aller-retour, mais le serveur reste
 * l'autorité - on ne se contente jamais d'une validation de client.
 */
export function normaliserNumero(saisie: string): string {
  return (saisie || "").replace(/\D/g, "");
}

export function numeroUtilisable(saisie: string): boolean {
  return normaliserNumero(saisie).length >= 9;
}

export interface DemandePaiement {
  planId: string;
  cycle: CycleFacturation;
  mode: "new" | "extend";
  operateur: OperateurMoko;
  numero: string;
}

export interface PaiementInitie {
  reference: string;
  transactionId: string | null;
  abonnementActive: boolean;
  message: string;
}

/**
 * Lance le paiement. Le client confirme ensuite sur son téléphone.
 *
 * ⚠ **Exempté de la porte d'abonnement**, et c'est la condition sans laquelle
 * tout ce lot serait un cul-de-sac : `/api/v1/subscriptions/` est un préfixe
 * exempté du middleware, et cette action ne porte pas `HasActiveSubscription`.
 * Un marchand bloqué peut donc payer.
 *
 * ⚠ Réservée au PROPRIÉTAIRE (`IsTenantOwner`) : l'écran doit le savoir avant
 * d'offrir le bouton, sinon le refus tombe après la saisie du numéro.
 */
export async function initierPaiementMoko(
  organisation: string,
  demande: DemandePaiement
): Promise<PaiementInitie> {
  const d = await api.post<Record<string, any>>(
    "/subscriptions/moko/initiate/",
    {
      plan_id: demande.planId,
      billing_cycle: demande.cycle,
      mode: demande.mode,
      method: demande.operateur,
      customer_number: normaliserNumero(demande.numero),
    },
    entetes(organisation)
  );
  return {
    reference: String(d.reference ?? ""),
    transactionId: d.transaction_id ? String(d.transaction_id) : null,
    abonnementActive: Boolean(d.subscription_activated),
    message: String(d.message ?? ""),
  };
}

export type StatutPaiement = "pending" | "completed" | "failed" | "unknown";

/**
 * L'état d'un paiement en cours.
 *
 * ⚠ `IsTenantMember` seulement : tout membre peut sonder. Seul le LANCEMENT
 * est réservé au propriétaire.
 */
export async function statutPaiementMoko(
  organisation: string,
  reference: string
): Promise<{ statut: StatutPaiement; message: string; abonnementActive: boolean }> {
  const d = await api.get<Record<string, any>>(
    `/subscriptions/moko/status/?reference=${encodeURIComponent(reference)}`,
    entetes(organisation)
  );
  const brut = String(d.status ?? "unknown");
  const statut: StatutPaiement =
    brut === "completed" || brut === "failed" || brut === "pending"
      ? brut
      : "unknown";
  return {
    statut,
    message: String(d.message ?? ""),
    abonnementActive: Boolean(d.subscription_activated),
  };
}


/**
 * L'économie de l'abonnement annuel, en pour cent, ou zéro.
 *
 * Le back-office l'affiche sur sa carte « Annuel » : c'est ce qui fait choisir,
 * et un plan sans remise ne doit pas porter une pastille « -0 % ».
 */
export function economieAnnuelle(plan: PlanAbonnement): number {
  const douzeMois = plan.prixMensuel * 12;
  if (plan.prixMensuel <= 0 || plan.prixAnnuel <= 0) return 0;
  if (plan.prixAnnuel >= douzeMois) return 0;
  return Math.round((1 - plan.prixAnnuel / douzeMois) * 100);
}

/**
 * L'échéance annoncée après paiement.
 *
 * ⚠ **C'est un APERÇU, et le serveur reste l'autorité.** Il compte en
 * `duration_months * 30` - un an vaut donc 360 jours, pas 365 - et c'est cette
 * arithmétique-là qui est reprise. Un aperçu qui annoncerait cinq jours de plus
 * que la réalité serait une promesse que la facture ne tient pas.
 *
 * En PROLONGATION, on part de l'échéance en cours : c'est ce que fait
 * `extend_subscription`, et repartir d'aujourd'hui ferait perdre au marchand
 * les jours qu'il avait déjà payés.
 */
export function finEstimee(
  finActuelle: Date | null,
  cycle: CycleFacturation,
  mode: "new" | "extend"
): Date | null {
  const depart = mode === "extend" ? finActuelle : new Date();
  if (!depart) return null;
  const fin = new Date(depart.getTime());
  fin.setDate(fin.getDate() + joursDuCycle(cycle));
  return fin;
}
