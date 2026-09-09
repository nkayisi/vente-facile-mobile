/**
 * Lectures du livre de caisse. Miroir de `frontend/actions/cashbook.actions.ts`.
 *
 * **Tout est ventilé par devise, sans exception.** Le back-office l'a appris à
 * ses dépens : un solde de caisse est une somme d'espèces physiques, et le
 * tiroir contient des billets de plusieurs devises qui ne s'additionnent pas.
 * Les mouvements sont d'ailleurs déjà enregistrés dans la devise physique.
 */
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@/db/client";
import { deviseOuPrincipale } from "./devise-principale";
import {
  cashMovements,
  expenseCategories,
  expenses,
  incomeCategories,
  paymentMethods,
  payments,
  registerSessions,
  registers,
  sales,
  warehouses,
} from "@/db/schema";

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
    const d = deviseOuPrincipale(m.currency);
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
    devise: deviseOuPrincipale(m.currency),
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
    devise: deviseOuPrincipale(e.currency),
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

// ------------------------------------------------------------------- lot 9

export interface SoldeDeviseSession {
  devise: string;
  ouverture: number;
  /** Entrées espèces de la session, dans cette devise. */
  entrees: number;
  /** Sorties espèces rattachées à la session. */
  sorties: number;
  attendu: number;
}

export interface SessionACloturer {
  id: string;
  caisse: string;
  entrepot: string | null;
  ouverteLe: Date | null;
  nbVentes: number;
  /** Un solde par devise. On ne somme JAMAIS entre devises. */
  soldes: SoldeDeviseSession[];
  /** Encaissements par moyen de paiement, pour le Z. */
  parMoyen: { moyen: string; devise: string; montant: number }[];
}

/**
 * Ce qu'il faut pour clôturer, calculé LOCALEMENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE CALCUL EST UN APERÇU. Le serveur refait l'arithmétique du tiroir à la │
 * │ clôture, et c'est la sienne qui est écrite. Celui-ci sert à afficher le  │
 * │ solde attendu au caissier PENDANT qu'il compte, y compris hors ligne -   │
 * │ sans quoi il compterait à l'aveugle.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La formule suit celle du serveur : fonds d'ouverture, plus les règlements
 * ESPÈCES des ventes de la session (montant remis), moins les sorties espèces
 * rattachées à la session. Une devise = une ligne, jamais une somme.
 */
export async function sessionACloturer(
  sessionId: string
): Promise<SessionACloturer | null> {
  const [s] = await db
    .select({
      id: registerSessions.id,
      openedAt: registerSessions.openedAt,
      openingBalance: registerSessions.openingBalance,
      caisse: registers.name,
      entrepot: warehouses.name,
    })
    .from(registerSessions)
    .leftJoin(registers, eq(registers.id, registerSessions.registerId))
    .leftJoin(warehouses, eq(warehouses.id, registers.warehouseId))
    .where(eq(registerSessions.id, sessionId))
    .limit(1);
  if (!s) return null;

  const ventesSession = await db
    .select({ id: sales.id })
    .from(sales)
    .where(eq(sales.sessionId, sessionId));
  const idsVentes = ventesSession.map((v) => v.id);

  // Les ENCAISSEMENTS de la session, par moyen et par devise.
  const reglements =
    idsVentes.length > 0
      ? await db
          .select({
            amount: payments.amount,
            tendered: payments.tenderedAmount,
            currency: payments.currency,
            moyen: paymentMethods.name,
            type: paymentMethods.methodType,
          })
          .from(payments)
          .leftJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
          .where(inArray(payments.saleId, idsVentes))
      : [];

  const entrees = new Map<string, number>();
  const parMoyen = new Map<string, { moyen: string; devise: string; montant: number }>();
  for (const p of reglements) {
    const devise = deviseOuPrincipale(p.currency);
    // Le MONTANT REMIS, pas le montant imputé : c'est ce qui est entré au
    // tiroir. Le serveur emploie `coalesce(tendered_amount, amount)`.
    const montant = nb(p.tendered ?? p.amount);
    const cle = `${p.moyen ?? "Espèces"}|${devise}`;
    const ligne = parMoyen.get(cle) ?? {
      moyen: p.moyen ?? "Espèces",
      devise,
      montant: 0,
    };
    ligne.montant += montant;
    parMoyen.set(cle, ligne);
    // SEULES LES ESPÈCES entrent au tiroir : un règlement mobile money n'y
    // met aucun billet, et le compter ferait constater un écart chaque soir.
    if (p.type === "cash") {
      entrees.set(devise, (entrees.get(devise) ?? 0) + montant);
    }
  }

  const sorties = new Map<string, number>();
  for (const m of await db
    .select({
      amount: cashMovements.amount,
      currency: cashMovements.currency,
      direction: cashMovements.direction,
      annule: cashMovements.isCancelled,
    })
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, sessionId))) {
    if (m.annule || m.direction !== "out") continue;
    const d = deviseOuPrincipale(m.currency);
    sorties.set(d, (sorties.get(d) ?? 0) + nb(m.amount));
  }

  const devises = new Set<string>([
    ...entrees.keys(),
    ...sorties.keys(),
  ]);
  // Le fonds d'ouverture est scalaire dans la table tirée : il appartient à la
  // devise principale, et les autres devises partent de zéro.
  const principale = [...devises][0] ?? "";
  devises.add(principale);

  const soldes: SoldeDeviseSession[] = [...devises]
    .filter(Boolean)
    .sort()
    .map((devise) => {
      const ouverture = devise === principale ? nb(s.openingBalance) : 0;
      const e = entrees.get(devise) ?? 0;
      const so = sorties.get(devise) ?? 0;
      return { devise, ouverture, entrees: e, sorties: so, attendu: ouverture + e - so };
    });

  return {
    id: s.id,
    caisse: s.caisse ?? "Caisse",
    entrepot: s.entrepot ?? null,
    ouverteLe: s.openedAt ?? null,
    nbVentes: idsVentes.length,
    soldes,
    parMoyen: [...parMoyen.values()].sort((a, b) => a.moyen.localeCompare(b.moyen)),
  };
}

export interface DetailDepense {
  id: string;
  reference: string;
  description: string;
  categorie: string | null;
  montant: number;
  devise: string;
  statut: string;
  beneficiaire: string | null;
  moyen: string | null;
  reference_paiement: string | null;
  notes: string;
  date: Date | null;
  payeeLe: Date | null;
}

export async function detailDepense(id: string): Promise<DetailDepense | null> {
  const [d] = await db
    .select({
      depense: expenses,
      categorie: expenseCategories.name,
      moyen: paymentMethods.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .leftJoin(paymentMethods, eq(paymentMethods.id, expenses.paymentMethodId))
    .where(eq(expenses.id, id))
    .limit(1);
  if (!d) return null;

  const e = d.depense;
  return {
    id: e.id,
    reference: e.reference,
    description: e.description ?? "",
    categorie: d.categorie ?? null,
    montant: nb(e.amount),
    devise: e.currency,
    statut: e.status,
    beneficiaire: e.beneficiary?.trim() || null,
    moyen: d.moyen ?? null,
    reference_paiement: e.paymentReference?.trim() || null,
    notes: e.notes ?? "",
    date: e.expenseDate ?? null,
    payeeLe: e.paidDate ?? null,
  };
}

/** Catégories de dépense, pour la saisie. */
export async function categoriesDepense(): Promise<{ id: string; nom: string }[]> {
  const lignes = await db
    .select({ id: expenseCategories.id, nom: expenseCategories.name })
    .from(expenseCategories)
    .orderBy(expenseCategories.name);
  return lignes;
}

/** Catégories de recette, pour une entrée de caisse. */
export async function categoriesRecette(): Promise<{ id: string; nom: string }[]> {
  const lignes = await db
    .select({ id: incomeCategories.id, nom: incomeCategories.name })
    .from(incomeCategories)
    .orderBy(incomeCategories.name);
  return lignes;
}
