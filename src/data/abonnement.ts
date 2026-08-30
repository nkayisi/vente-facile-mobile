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
 * **Le paiement reste le tunnel WEB.** Moko passe par une page hébergée, et
 * l'embarquer dans une WebView est le motif de refus 4.2 le plus courant à la
 * revue App Store. Le lien s'ouvre donc dans le NAVIGATEUR DU SYSTÈME, ce qui
 * est aussi ce qu'un marchand attend d'un paiement : il voit la barre
 * d'adresse.
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
