/**
 * Lectures des clients et fournisseurs.
 * Miroir de `frontend/actions/contacts.actions.ts`.
 *
 * **Le solde d'un client est ventilé par devise** (`customer_balances`), et
 * `current_balance` n'est qu'un cumul converti en devise principale. Comparer
 * un montant converti à un montant de facture est le défaut que le back-office
 * a dû corriger sur ses règlements.
 */
import { desc, inArray, like, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { customerBalances, customers, suppliers } from "@/db/schema";
import { deviseOuPrincipale } from "./devise-principale";

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
  /**
   * La devise du solde. **Jamais vide, jamais `null`.**
   *
   * Elle valait `null` quand la colonne était vide, et les deux écrans qui
   * l'affichaient la dénormalisaient aussitôt en `?? ""` - c'est-à-dire en un
   * montant SANS SYMBOLE. Le repli est désormais posé ici, une fois, sur la
   * devise principale de l'établissement.
   */
  devise: string;
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
      devise: deviseOuPrincipale(s.currency),
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
      devise: deviseOuPrincipale(s.currency),
      actif: Boolean(s.isActive),
      solde: nb(s.currentBalance),
    })),
  };
}

/**
 * Les téléphones d'un lot de clients, en UNE requête.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN NUMÉRO PAR LIGNE DE LISTE COÛTERAIT UNE REQUÊTE PAR LIGNE.           │
 * │                                                                          │
 * │ C'est le motif déjà retenu partout ailleurs (les soldes d'une liste de   │
 * │ clients, les compteurs d'une liste de sessions) : on lit le lot, on      │
 * │ range dans une `Map`, et l'appelant assemble. Deux cents débiteurs       │
 * │ feraient sinon deux cents ouvertures de curseur pendant que le doigt     │
 * │ fait défiler.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Un client absent de la table - créé sur un autre terminal et pas encore
 * descendu - n'a simplement pas d'entrée : l'appelant retire alors le bouton
 * d'appel plutôt que de composer un numéro vide.
 */
export async function telephonesDesClients(
  ids: string[]
): Promise<Map<string, string>> {
  const uniques = [...new Set(ids.filter(Boolean))];
  if (uniques.length === 0) return new Map();

  const lignes = await db
    .select({ id: customers.id, phone: customers.phone })
    .from(customers)
    .where(inArray(customers.id, uniques));

  const par = new Map<string, string>();
  for (const l of lignes) {
    const t = (l.phone ?? "").trim();
    if (t) par.set(l.id, t);
  }
  return par;
}
