/**
 * Lectures des ventes. Miroir de `frontend/actions/sales.actions.ts`.
 *
 * **Les totaux ne se somment JAMAIS entre devises** : chaque vente porte la
 * sienne, et le hub les rend par devise. C'est la règle que le back-office a dû
 * apprendre à ses dépens (`MultiCurrencyTotal`), et elle vaut ici mot pour mot.
 */
import { and, desc, eq, gte, inArray, like, lt, or, sql } from "drizzle-orm";

import { db } from "@/db/client";

import { depuisQuand, type Periode } from "./periodes";

export type { Periode };
import { customers, registerSessions, registers, sales } from "@/db/schema";

const nb = (v: string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Bornes du jour en heure LOCALE, comme le back-office (`day_bounds`). */
function bornesDuJour(): { debut: Date; fin: Date } {
  const d = new Date();
  const debut = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { debut, fin };
}

export interface VenteResume {
  id: string;
  reference: string;
  client: string | null;
  statut: string;
  total: number;
  resteAPayer: number;
  devise: string;
  date: Date | null;
}

export interface RelevesVentes {
  /** Une entrée par devise : on ne somme jamais entre devises. */
  totalParDevise: { devise: string; montant: number }[];
  transactions: number;
  panierMoyenParDevise: { devise: string; montant: number }[];
  aEncaisserParDevise: { devise: string; montant: number }[];
  nbAEncaisser: number;
  ventesDuJour: VenteResume[];
}

export async function relevesVentes(): Promise<RelevesVentes> {
  const { debut, fin } = bornesDuJour();

  const lignes = await db
    .select({
      id: sales.id,
      reference: sales.reference,
      statut: sales.status,
      total: sales.total,
      amountDue: sales.amountDue,
      currency: sales.currency,
      saleDate: sales.saleDate,
      client: customers.name,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(gte(sales.saleDate, debut), lt(sales.saleDate, fin)))
    .orderBy(desc(sales.saleDate));

  const parDevise = (choisir: (l: (typeof lignes)[number]) => number) => {
    const m = new Map<string, number>();
    for (const l of lignes) {
      const v = choisir(l);
      if (v === 0) continue;
      const d = l.currency ?? "";
      m.set(d, (m.get(d) ?? 0) + v);
    }
    return [...m.entries()]
      .map(([devise, montant]) => ({ devise, montant }))
      .sort((a, b) => a.devise.localeCompare(b.devise));
  };

  const dues = lignes.filter((l) => nb(l.amountDue) > 0);
  const n = lignes.length;

  return {
    totalParDevise: parDevise((l) => nb(l.total)),
    transactions: n,
    panierMoyenParDevise: n === 0 ? [] : parDevise((l) => nb(l.total) / n),
    aEncaisserParDevise: parDevise((l) => nb(l.amountDue)),
    nbAEncaisser: dues.length,
    ventesDuJour: lignes.map((l) => ({
      id: l.id,
      reference: l.reference,
      client: l.client ?? null,
      statut: l.statut,
      total: nb(l.total),
      resteAPayer: nb(l.amountDue),
      devise: l.currency ?? "",
      date: l.saleDate ?? null,
    })),
  };
}

export interface SessionOuverte {
  id: string;
  caisse: string;
  ouverteLe: Date | null;
  nbVentes: number;
  encaisseParDevise: { devise: string; montant: number }[];
}

/** La session de caisse en cours, s'il y en a une. */
export async function sessionOuverteResume(): Promise<SessionOuverte | null> {
  const [s] = await db
    .select({
      id: registerSessions.id,
      registerId: registerSessions.registerId,
      openedAt: registerSessions.openedAt,
      caisse: registers.name,
    })
    .from(registerSessions)
    .leftJoin(registers, eq(registers.id, registerSessions.registerId))
    .where(eq(registerSessions.status, "open"))
    .limit(1);
  if (!s) return null;

  const ventes = await db
    .select({ total: sales.total, currency: sales.currency })
    .from(sales)
    .where(inArray(sales.sessionId, [s.id]));

  const m = new Map<string, number>();
  for (const v of ventes) m.set(v.currency ?? "", (m.get(v.currency ?? "") ?? 0) + nb(v.total));

  return {
    id: s.id,
    caisse: s.caisse ?? "Caisse",
    ouverteLe: s.openedAt ?? null,
    nbVentes: ventes.length,
    encaisseParDevise: [...m.entries()].map(([devise, montant]) => ({ devise, montant })),
  };
}

/** Libellés et tons des statuts, repris du back-office mot pour mot. */
export const STATUT_VENTE: Record<string, { label: string; ton: "neutral" | "warning" | "success" | "primary" | "destructive" }> = {
  draft: { label: "Brouillon", ton: "neutral" },
  pending: { label: "En attente", ton: "warning" },
  completed: { label: "Terminée", ton: "success" },
  partially_paid: { label: "Partiel", ton: "primary" },
  cancelled: { label: "Annulée", ton: "destructive" },
  refunded: { label: "Remboursée", ton: "neutral" },
};

/** « depuis 3 h 20 », « depuis 5 min », « depuis 80 j » - formulation du web. */
export function depuis(d: Date | null): string {
  if (!d) return "";
  const min = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (min < 60) return `depuis ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const r = min % 60;
    return r === 0 ? `depuis ${h} h` : `depuis ${h} h ${String(r).padStart(2, "0")}`;
  }
  return `depuis ${Math.floor(h / 24)} j`;
}

// --------------------------------------------------------------- lot 6

export interface FiltresHistorique {
  recherche?: string;
  /** Code de statut, ou `null` pour tous. */
  statut?: string | null;
  periode?: Periode;
  limite?: number;
}

export interface PageVentes {
  elements: VenteResume[];
  /** Nombre total AVANT la limite : c'est lui que le sous-titre annonce. */
  total: number;
}

/**
 * L'historique complet.
 *
 * La recherche et les filtres sont poussés dans le SQL, pas appliqués après
 * coup sur une page déjà tronquée. Filtrer en mémoire une liste limitée à cent
 * lignes ferait mentir le compteur et cacherait les ventes plus anciennes que
 * la centième, ce qui est précisément le défaut que le back-office a dû
 * corriger sur son écran de niveaux de stock.
 */
export async function historiqueVentes(f: FiltresHistorique = {}): Promise<PageVentes> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;
  const borne = depuisQuand(f.periode ?? "tout");

  const conditions = [
    borne ? gte(sales.saleDate, borne) : undefined,
    f.statut ? eq(sales.status, f.statut) : undefined,
    terme
      ? or(
          like(sql`lower(${sales.reference})`, motif),
          like(sql`lower(coalesce(${customers.name}, ''))`, motif)
        )
      : undefined,
  ].filter(Boolean);
  const filtre = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ n: total } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(filtre);

  const lignes = await db
    .select({
      id: sales.id,
      reference: sales.reference,
      statut: sales.status,
      total: sales.total,
      amountDue: sales.amountDue,
      currency: sales.currency,
      saleDate: sales.saleDate,
      client: customers.name,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(filtre)
    .orderBy(desc(sales.saleDate))
    .limit(f.limite ?? 50);

  return {
    total,
    elements: lignes.map((l) => ({
      id: l.id,
      reference: l.reference,
      client: l.client ?? null,
      statut: l.statut,
      total: nb(l.total),
      resteAPayer: nb(l.amountDue),
      devise: l.currency ?? "",
      date: l.saleDate ?? null,
    })),
  };
}

export interface ReglementsEnAttente {
  ventes: VenteResume[];
  enAttente: number;
  partiellementPayees: number;
  /** Restant dû ventilé par devise : jamais une somme inter-devises. */
  duParDevise: { devise: string; montant: number }[];
  /** Factures dont l'échéance est dépassée. */
  enRetard: number;
}

/**
 * Les factures qui restent à encaisser.
 *
 * Le critère est `amount_due > 0` sur un statut ouvert, exactement celui
 * d'`open_credit_sales` côté serveur. S'en écarter ferait apparaître ici des
 * factures que le serveur refuserait de solder, ou l'inverse.
 */
export async function reglementsEnAttente(recherche = ""): Promise<ReglementsEnAttente> {
  const terme = recherche.trim().toLowerCase();
  const motif = `%${terme}%`;

  const lignes = await db
    .select({
      id: sales.id,
      reference: sales.reference,
      statut: sales.status,
      total: sales.total,
      amountDue: sales.amountDue,
      currency: sales.currency,
      saleDate: sales.saleDate,
      dueDate: sales.dueDate,
      client: customers.name,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(
      and(
        inArray(sales.status, ["pending", "partially_paid"]),
        sql`cast(${sales.amountDue} as real) > 0`,
        terme
          ? or(
              like(sql`lower(${sales.reference})`, motif),
              like(sql`lower(coalesce(${customers.name}, ''))`, motif)
            )
          : undefined
      )
    )
    .orderBy(desc(sales.saleDate));

  const parDevise = new Map<string, number>();
  let enRetard = 0;
  const maintenant = Date.now();
  for (const l of lignes) {
    parDevise.set(l.currency ?? "", (parDevise.get(l.currency ?? "") ?? 0) + nb(l.amountDue));
    if (l.dueDate && l.dueDate.getTime() < maintenant) enRetard += 1;
  }

  return {
    enAttente: lignes.filter((l) => l.statut === "pending").length,
    partiellementPayees: lignes.filter((l) => l.statut === "partially_paid").length,
    enRetard,
    duParDevise: [...parDevise.entries()]
      .map(([devise, montant]) => ({ devise, montant }))
      .sort((a, b) => a.devise.localeCompare(b.devise)),
    ventes: lignes.map((l) => ({
      id: l.id,
      reference: l.reference,
      client: l.client ?? null,
      statut: l.statut,
      total: nb(l.total),
      resteAPayer: nb(l.amountDue),
      devise: l.currency ?? "",
      date: l.saleDate ?? null,
    })),
  };
}
