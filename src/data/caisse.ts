/**
 * Lectures du livre de caisse. Miroir de `frontend/actions/cashbook.actions.ts`.
 *
 * **Tout est ventilé par devise, sans exception.** Le back-office l'a appris à
 * ses dépens : un solde de caisse est une somme d'espèces physiques, et le
 * tiroir contient des billets de plusieurs devises qui ne s'additionnent pas.
 * Les mouvements sont d'ailleurs déjà enregistrés dans la devise physique.
 */
import { and, desc, eq, gte, lt } from "drizzle-orm";

import { db } from "@/db/client";
import { cashMovements, expenseCategories, expenses } from "@/db/schema";

const nb = (v: string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function bornesDuJour(): { debut: Date; fin: Date } {
  const d = new Date();
  const debut = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { debut, fin };
}

export type ParDevise = { devise: string; montant: number }[];

export interface RelevesCaisse {
  solde: ParDevise;
  entreesDuJour: ParDevise;
  sortiesDuJour: ParDevise;
  netDuJour: ParDevise;
}

const trier = (m: Map<string, number>): ParDevise =>
  [...m.entries()]
    .map(([devise, montant]) => ({ devise, montant }))
    .filter((x) => x.montant !== 0)
    .sort((a, b) => a.devise.localeCompare(b.devise));

export async function relevesCaisse(): Promise<RelevesCaisse> {
  const { debut, fin } = bornesDuJour();
  const tous = await db
    .select({
      direction: cashMovements.direction,
      amount: cashMovements.amount,
      currency: cashMovements.currency,
      movementDate: cashMovements.movementDate,
      isCancelled: cashMovements.isCancelled,
    })
    .from(cashMovements);

  const solde = new Map<string, number>();
  const entrees = new Map<string, number>();
  const sorties = new Map<string, number>();

  for (const m of tous) {
    if (m.isCancelled) continue;
    const d = m.currency ?? "";
    const v = nb(m.amount);
    const signe = m.direction === "in" ? 1 : -1;
    solde.set(d, (solde.get(d) ?? 0) + signe * v);

    const dt = m.movementDate;
    if (dt && dt >= debut && dt < fin) {
      if (signe > 0) entrees.set(d, (entrees.get(d) ?? 0) + v);
      else sorties.set(d, (sorties.get(d) ?? 0) + v);
    }
  }

  const net = new Map<string, number>();
  for (const d of new Set([...entrees.keys(), ...sorties.keys()])) {
    net.set(d, (entrees.get(d) ?? 0) - (sorties.get(d) ?? 0));
  }

  return {
    solde: trier(solde),
    entreesDuJour: trier(entrees),
    sortiesDuJour: trier(sorties),
    netDuJour: trier(net),
  };
}

export interface MouvementCaisse {
  id: string;
  reference: string | null;
  direction: string;
  type: string;
  description: string | null;
  montant: number;
  devise: string;
  date: Date | null;
  annule: boolean;
}

export async function mouvementsCaisse(limite = 50): Promise<MouvementCaisse[]> {
  const lignes = await db
    .select()
    .from(cashMovements)
    .orderBy(desc(cashMovements.movementDate))
    .limit(limite);
  return lignes.map((m) => ({
    id: m.id,
    reference: m.reference ?? null,
    direction: m.direction,
    type: m.movementType,
    description: m.description ?? null,
    montant: nb(m.amount),
    devise: m.currency ?? "",
    date: m.movementDate ?? null,
    annule: Boolean(m.isCancelled),
  }));
}

/** Libellés des types de mouvement, repris du back-office. */
export const TYPE_MOUVEMENT: Record<string, string> = {
  sale: "Vente",
  customer_refund: "Remboursement client",
  expense: "Dépense",
  supplier_purchase: "Achat fournisseur",
  supplier_refund: "Remboursement fournisseur",
  debt_collection: "Recouvrement dette",
  capital_injection: "Apport de fonds",
  capital_withdrawal: "Retrait de fonds",
  adjustment: "Ajustement",
  other_income: "Autre entrée",
  other_expense: "Autre sortie",
};

export interface DepenseResume {
  id: string;
  reference: string | null;
  description: string;
  categorie: string | null;
  couleur: string | null;
  montant: number;
  devise: string;
  statut: string;
  date: Date | null;
}

export async function listeDepenses(limite = 50): Promise<DepenseResume[]> {
  const lignes = await db
    .select({
      id: expenses.id,
      reference: expenses.reference,
      description: expenses.description,
      amount: expenses.amount,
      currency: expenses.currency,
      status: expenses.status,
      expenseDate: expenses.expenseDate,
      categorie: expenseCategories.name,
      couleur: expenseCategories.color,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .orderBy(desc(expenses.expenseDate))
    .limit(limite);

  return lignes.map((e) => ({
    id: e.id,
    reference: e.reference ?? null,
    description: e.description,
    categorie: e.categorie ?? null,
    couleur: e.couleur ?? null,
    montant: nb(e.amount),
    devise: e.currency ?? "",
    statut: e.status,
    date: e.expenseDate ?? null,
  }));
}

/** Statuts de dépense, libellés et tons du back-office. */
export const STATUT_DEPENSE: Record<
  string,
  { label: string; ton: "neutral" | "warning" | "primary" | "success" | "destructive" }
> = {
  draft: { label: "Brouillon", ton: "neutral" },
  pending: { label: "En attente", ton: "warning" },
  approved: { label: "Approuvée", ton: "primary" },
  paid: { label: "Payée", ton: "success" },
  rejected: { label: "Rejetée", ton: "destructive" },
  cancelled: { label: "Annulée", ton: "neutral" },
};
