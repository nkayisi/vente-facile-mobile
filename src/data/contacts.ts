/**
 * Lectures des clients et fournisseurs.
 * Miroir de `frontend/actions/contacts.actions.ts`.
 *
 * **Le solde d'un client est ventilé par devise** (`customer_balances`), et
 * `current_balance` n'est qu'un cumul converti en devise principale. Comparer
 * un montant converti à un montant de facture est le défaut que le back-office
 * a dû corriger sur ses règlements.
 */
import { desc, eq, like, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { customerBalances, customers, suppliers } from "@/db/schema";

const nb = (v: string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface ClientResume {
  id: string;
  nom: string;
  code: string | null;
  telephone: string | null;
  entreprise: boolean;
  actif: boolean;
  creditAutorise: boolean;
  /** Une entrée par devise ; jamais un total inter-devises. */
  soldes: { devise: string; montant: number }[];
  soldePrincipal: number;
}

export async function listeClients(
  f: { recherche?: string; limite?: number } = {}
): Promise<{ elements: ClientResume[]; total: number }> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;
  const filtre = terme
    ? or(
        like(sql`lower(${customers.name})`, motif),
        like(sql`lower(${customers.code})`, motif),
        like(sql`lower(${customers.phone})`, motif)
      )
    : undefined;

  const [{ n: total } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(customers)
    .where(filtre);

  const lignes = await db
    .select()
    .from(customers)
    .where(filtre)
    .orderBy(customers.name)
    .limit(f.limite ?? 100);

  const soldes = await db.select().from(customerBalances);
  const parClient = new Map<string, { devise: string; montant: number }[]>();
  for (const s of soldes) {
    const v = nb(s.amount);
    if (v === 0) continue;
    const l = parClient.get(s.customerId) ?? [];
    l.push({ devise: s.currency, montant: v });
    parClient.set(s.customerId, l);
  }

  return {
    total,
    elements: lignes.map((c) => ({
      id: c.id,
      nom: c.name,
      code: c.code ?? null,
      telephone: c.phone?.trim() || null,
      entreprise: c.customerType === "business",
      actif: Boolean(c.isActive),
      creditAutorise: Boolean(c.allowCredit),
      soldes: parClient.get(c.id) ?? [],
      soldePrincipal: nb(c.currentBalance),
    })),
  };
}

export interface FournisseurResume {
  id: string;
  nom: string;
  code: string | null;
  contact: string | null;
  telephone: string | null;
  devise: string | null;
  actif: boolean;
  solde: number;
}

export async function listeFournisseurs(
  f: { recherche?: string; limite?: number } = {}
): Promise<{ elements: FournisseurResume[]; total: number }> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;
  const filtre = terme
    ? or(
        like(sql`lower(${suppliers.name})`, motif),
        like(sql`lower(${suppliers.code})`, motif),
        like(sql`lower(${suppliers.contactPerson})`, motif)
      )
    : undefined;

  const [{ n: total } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(suppliers)
    .where(filtre);

  const lignes = await db
    .select()
    .from(suppliers)
    .where(filtre)
    .orderBy(suppliers.name)
    .limit(f.limite ?? 100);

  return {
    total,
    elements: lignes.map((s) => ({
      id: s.id,
      nom: s.name,
      code: s.code ?? null,
      contact: s.contactPerson?.trim() || null,
      telephone: s.phone?.trim() || null,
      devise: s.currency ?? null,
      actif: Boolean(s.isActive),
      solde: nb(s.currentBalance),
    })),
  };
}

export interface RelevesContacts {
  clients: number;
  fournisseurs: number;
  clientsAvecSolde: number;
  /** Créances ventilées par devise. */
  creances: { devise: string; montant: number }[];
  derniersClients: ClientResume[];
  derniersFournisseurs: FournisseurResume[];
}

export async function relevesContacts(): Promise<RelevesContacts> {
  const [{ n: nbClients } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(customers);
  const [{ n: nbFournisseurs } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(suppliers);

  const soldes = await db.select().from(customerBalances);
  const parDevise = new Map<string, number>();
  const avecSolde = new Set<string>();
  for (const s of soldes) {
    const v = nb(s.amount);
    if (v <= 0) continue;
    avecSolde.add(s.customerId);
    parDevise.set(s.currency, (parDevise.get(s.currency) ?? 0) + v);
  }

  const derniersC = await db
    .select()
    .from(customers)
    .orderBy(desc(customers.createdAt))
    .limit(5);
  const derniersF = await db
    .select()
    .from(suppliers)
    .orderBy(desc(suppliers.createdAt))
    .limit(5);

  return {
    clients: nbClients,
    fournisseurs: nbFournisseurs,
    clientsAvecSolde: avecSolde.size,
    creances: [...parDevise.entries()]
      .map(([devise, montant]) => ({ devise, montant }))
      .sort((a, b) => a.devise.localeCompare(b.devise)),
    derniersClients: derniersC.map((c) => ({
      id: c.id,
      nom: c.name,
      code: c.code ?? null,
      telephone: c.phone?.trim() || null,
      entreprise: c.customerType === "business",
      actif: Boolean(c.isActive),
      creditAutorise: Boolean(c.allowCredit),
      soldes: [],
      soldePrincipal: nb(c.currentBalance),
    })),
    derniersFournisseurs: derniersF.map((s) => ({
      id: s.id,
      nom: s.name,
      code: s.code ?? null,
      contact: s.contactPerson?.trim() || null,
      telephone: s.phone?.trim() || null,
      devise: s.currency ?? null,
      actif: Boolean(s.isActive),
      solde: nb(s.currentBalance),
    })),
  };
}
