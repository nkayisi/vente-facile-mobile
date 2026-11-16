/**
 * Fiche d'un client, fiche d'un fournisseur.
 * Miroir de `app/dashboard/contacts/{customers,suppliers}/[id]/page.tsx`.
 *
 * **Le solde d'un client est VENTILÉ PAR DEVISE**, et c'est la seule vérité :
 * `customer_balances` porte une ligne par devise. `current_balance` n'est qu'un
 * cumul converti en devise principale, utile au tri et au plafond de crédit,
 * jamais à un règlement. Comparer un montant converti à un `amount_due` de
 * facture est le défaut que le back-office a dû corriger : un client devant
 * 50 USD qui payait 50 USD se voyait refuser son règlement, comparé à 140 000.
 *
 * **« Aucune dette » n'est pas « solde inconnu ».** Un client sans ligne de
 * solde n'a rien à devoir ; la fiche le dit, plutôt que d'afficher un zéro qui
 * pourrait passer pour une absence de données.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { deviseOuPrincipale } from "./devise-principale";
import { pireEnvoi } from "./envoi";
import { enAttenteParType, type EtatEnvoi } from "@/sync";
import { corpsDepuisLigneClient, type CorpsClient } from "@/features/clients/edition-client";
import {
  customerBalances,
  customerLoyalty,
  loyaltyTransactions,
  customerTransactions,
  customers,
  loyaltyPrograms,
  sales,
  suppliers,
} from "@/db/schema";
import { conditionEntrepot } from "@/data/perimetre-sql";
import type { FiltrePerimetre } from "@/features/perimetre/filtre-perimetre";

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Libellés des mouvements de compte, repris du back-office. */
export const TYPE_TRANSACTION: Record<
  string,
  { label: string; augmente: boolean }
> = {
  debt: { label: "Dette", augmente: true },
  payment: { label: "Règlement", augmente: false },
  advance: { label: "Avance", augmente: false },
  refund: { label: "Remboursement", augmente: false },
  adjustment: { label: "Ajustement", augmente: true },
};

export interface SoldeDevise {
  devise: string;
  montant: number;
}

export interface MouvementCompte {
  id: string;
  type: string;
  typeLabel: string;
  augmente: boolean;
  montant: number;
  devise: string;
  soldeApres: number;
  numeroRecu: string | null;
  reference: string | null;
  notes: string;
  venteId: string | null;
  date: Date | null;
}

export interface FactureOuverte {
  id: string;
  reference: string;
  total: number;
  resteAPayer: number;
  devise: string;
  date: Date | null;
  echeance: Date | null;
  /** Vrai quand l'échéance est passée. */
  enRetard: boolean;
}

export interface DetailClient {
  id: string;
  nom: string;
  code: string | null;
  type: "individual" | "business";
  raisonSociale: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  numeroImpot: string | null;
  notes: string;
  actif: boolean;

  /** Autorisation d'acheter à crédit, INDÉPENDANTE du plafond. */
  creditAutorise: boolean;
  /** 0 signifie « sans plafond », jamais « crédit refusé ». */
  plafondCredit: number;
  /** Cumul converti en devise principale : pour le plafond, pas pour un règlement. */
  soldePrincipal: number;
  /** Crédit encore disponible, null quand aucun plafond n'est fixé. */
  creditDisponible: number | null;

  /** La vérité du solde : une ligne par devise, jamais sommées. */
  soldes: SoldeDevise[];
  /** Ce que le client doit, par devise (part positive des soldes). */
  dettes: SoldeDevise[];
  /** Ce qu'il a versé d'avance, par devise (part négative, en valeur absolue). */
  avances: SoldeDevise[];

  /** Cagnotte disponible, en devise PRINCIPALE. `null` : aucun registre. */
  cagnotte: number | null;
  cagnotteGagnee: number;
  cagnotteUtilisee: number;
  programmeActif: boolean;

  facturesOuvertes: FactureOuverte[];
  dernieresVentes: {
    id: string;
    reference: string;
    total: number;
    devise: string;
    statut: string;
    date: Date | null;
  }[];
  mouvements: MouvementCompte[];
  /** Total des achats, ventilé par devise : jamais un cumul inter-devises. */
  achatsParDevise: SoldeDevise[];
}

/** Les ventes que le périmètre laisse voir ; aucun périmètre, aucune borne. */
function ventesDuPerimetre(perimetre?: FiltrePerimetre) {
  if (!perimetre) return [];
  return [
    conditionEntrepot(sales.warehouseId, perimetre, { inclureSansEntrepot: true }),
    perimetre.utilisateur ? eq(sales.soldById, perimetre.utilisateur) : undefined,
  ];
}

/**
 * ⚠ `perimetre` : le défaut du membre (`usePerimetreParDefaut`). Les ventes
 * d'un client sont des ventes : un caissier n'y voit que les siennes, même
 * sous « Voir tout dans son entrepôt ». Le SOLDE, lui, est celui du client,
 * tous vendeurs confondus - c'est ce qu'il doit.
 */
export async function detailClient(
  id: string,
  perimetre?: FiltrePerimetre
): Promise<DetailClient | null> {
  const [c] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!c) return null;

  const [soldes, fidelite, programme, ventes, mouvements] = await Promise.all([
    db.select().from(customerBalances).where(eq(customerBalances.customerId, id)),
    db
      .select()
      .from(customerLoyalty)
      .where(eq(customerLoyalty.customerId, id))
      .limit(1),
    db.select().from(loyaltyPrograms).limit(1),
    db
      .select({
        id: sales.id,
        reference: sales.reference,
        total: sales.total,
        amountDue: sales.amountDue,
        currency: sales.currency,
        status: sales.status,
        saleDate: sales.saleDate,
        dueDate: sales.dueDate,
      })
      .from(sales)
      .where(and(eq(sales.customerId, id), ...ventesDuPerimetre(perimetre)))
      .orderBy(desc(sales.saleDate))
      .limit(50),
    db
      .select()
      .from(customerTransactions)
      .where(eq(customerTransactions.customerId, id))
      .orderBy(desc(customerTransactions.createdAt))
      .limit(50),
  ]);

  const lignesSolde = soldes
    .map((s) => ({ devise: s.currency, montant: nb(s.amount) }))
    .filter((s) => s.montant !== 0)
    .sort((a, b) => a.devise.localeCompare(b.devise));

  const plafond = nb(c.creditLimit);
  const soldePrincipal = nb(c.currentBalance);

  const maintenant = Date.now();
  const achats = new Map<string, number>();
  for (const v of ventes) {
    // Une vente annulée n'est pas un achat.
    if (v.status === "cancelled" || v.status === "refunded") continue;
    achats.set(v.currency, (achats.get(v.currency) ?? 0) + nb(v.total));
  }

  const prog = programme[0];
  const loy = fidelite[0];

  return {
    id: c.id,
    nom: c.name,
    code: c.code?.trim() || null,
    type: c.customerType === "business" ? "business" : "individual",
    raisonSociale: c.companyName?.trim() || null,
    telephone: c.phone?.trim() || null,
    email: c.email?.trim() || null,
    adresse: c.address?.trim() || null,
    numeroImpot: c.taxId?.trim() || null,
    notes: c.notes ?? "",
    actif: Boolean(c.isActive),

    creditAutorise: Boolean(c.allowCredit),
    plafondCredit: plafond,
    soldePrincipal,
    // Sans plafond, il n'y a pas de « disponible » à afficher : rendre un
    // nombre ici laisserait croire à une limite qui n'existe pas.
    creditDisponible: plafond > 0 ? Math.max(0, plafond - soldePrincipal) : null,

    soldes: lignesSolde,
    dettes: lignesSolde.filter((s) => s.montant > 0),
    avances: lignesSolde
      .filter((s) => s.montant < 0)
      .map((s) => ({ devise: s.devise, montant: -s.montant })),

    // `null` quand aucun registre n'existe pour ce client : « aucune cagnotte »
    // et « cagnotte inconnue » ne se disent pas de la même façon.
    cagnotte: loy ? nb(loy.balance) : null,
    cagnotteGagnee: nb(loy?.totalEarned),
    cagnotteUtilisee: nb(loy?.totalUsed),
    programmeActif: Boolean(prog?.isActive),

    facturesOuvertes: ventes
      .filter(
        (v) =>
          nb(v.amountDue) > 0 &&
          (v.status === "pending" || v.status === "partially_paid")
      )
      .map((v) => ({
        id: v.id,
        reference: v.reference,
        total: nb(v.total),
        resteAPayer: nb(v.amountDue),
        devise: v.currency,
        date: v.saleDate ?? null,
        echeance: v.dueDate ?? null,
        enRetard: Boolean(v.dueDate && v.dueDate.getTime() < maintenant),
      })),

    dernieresVentes: ventes.slice(0, 10).map((v) => ({
      id: v.id,
      reference: v.reference,
      total: nb(v.total),
      devise: v.currency,
      statut: v.status,
      date: v.saleDate ?? null,
    })),

    mouvements: mouvements.map((m) => {
      const t = TYPE_TRANSACTION[m.transactionType] ?? {
        label: m.transactionType,
        augmente: true,
      };
      return {
        id: m.id,
        type: m.transactionType,
        typeLabel: t.label,
        augmente: t.augmente,
        montant: nb(m.amount),
        devise: m.currency,
        soldeApres: nb(m.balanceAfter),
        numeroRecu: m.receiptNumber?.trim() || null,
        reference: m.reference?.trim() || null,
        notes: m.notes ?? "",
        venteId: m.saleId ?? null,
        date: m.createdAt ?? null,
      };
    }),

    achatsParDevise: [...achats.entries()]
      .map(([devise, montant]) => ({ devise, montant }))
      .sort((a, b) => a.devise.localeCompare(b.devise)),
  };
}

/**
 * Les factures ouvertes d'un client, dans une devise donnée.
 *
 * Même critère que `open_credit_sales` du serveur, y compris l'ORDRE : la plus
 * ancienne d'abord, parce que c'est l'ordre d'imputation d'un règlement. Un
 * écran qui les présenterait autrement ferait attendre au caissier une
 * imputation différente de celle qui aura lieu.
 */
export async function facturesOuvertes(
  clientId: string,
  devise?: string,
  /** Le défaut du membre ; ce qu'il ne voit pas se lit dans `detteNonVisible`. */
  perimetre?: FiltrePerimetre
): Promise<FactureOuverte[]> {
  const maintenant = Date.now();
  const lignes = await db
    .select({
      id: sales.id,
      reference: sales.reference,
      total: sales.total,
      amountDue: sales.amountDue,
      currency: sales.currency,
      saleDate: sales.saleDate,
      dueDate: sales.dueDate,
    })
    .from(sales)
    .where(
      and(
        eq(sales.customerId, clientId),
        inArray(sales.status, ["pending", "partially_paid"]),
        sql`cast(${sales.amountDue} as real) > 0`,
        devise ? eq(sales.currency, devise) : undefined,
        ...ventesDuPerimetre(perimetre)
      )
    )
    .orderBy(sales.createdAt);

  return lignes.map((v) => ({
    id: v.id,
    reference: v.reference,
    total: nb(v.total),
    resteAPayer: nb(v.amountDue),
    devise: v.currency,
    date: v.saleDate ?? null,
    echeance: v.dueDate ?? null,
    enRetard: Boolean(v.dueDate && v.dueDate.getTime() < maintenant),
  }));
}

export interface DetailFournisseur {
  id: string;
  nom: string;
  code: string | null;
  raisonSociale: string | null;
  contact: string | null;
  telephone: string | null;
  email: string | null;
  siteWeb: string | null;
  adresse: string | null;
  numeroImpot: string | null;
  /**
   * La devise du solde. **Jamais vide, jamais `null`.**
   *
   * Elle valait `null` quand la colonne était vide, et les deux écrans qui
   * l'affichaient la dénormalisaient aussitôt en `?? ""` - c'est-à-dire en un
   * montant SANS SYMBOLE. Le repli est désormais posé ici, une fois, sur la
   * devise principale de l'établissement.
   */
  devise: string;
  solde: number;
  banque: string | null;
  compteBancaire: string | null;
  actif: boolean;
}

/**
 * Fiche fournisseur, en LECTURE seule.
 *
 * Les achats (commandes, réceptions, règlements, retours) ont un backend
 * complet et aucun écran, ni web ni mobile : c'est le lot conditionnel 13. Il
 * n'y a donc rien à écrire ici, et surtout rien à inventer.
 */
export async function detailFournisseur(id: string): Promise<DetailFournisseur | null> {
  const [s] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  if (!s) return null;

  return {
    id: s.id,
    nom: s.name,
    code: s.code?.trim() || null,
    raisonSociale: s.companyName?.trim() || null,
    contact: s.contactPerson?.trim() || null,
    telephone: s.phone?.trim() || null,
    email: s.email?.trim() || null,
    siteWeb: s.website?.trim() || null,
    adresse: s.address?.trim() || null,
    numeroImpot: s.taxId?.trim() || null,
    devise: deviseOuPrincipale(s.currency),
    solde: nb(s.currentBalance),
    banque: s.bankName?.trim() || null,
    compteBancaire: s.bankAccount?.trim() || null,
    actif: Boolean(s.isActive),
  };
}

/* ------------------------------------------------------------------------ */
/* Le registre de la cagnotte                                               */
/* ------------------------------------------------------------------------ */

/**
 * Libellés des mouvements de cagnotte, repris de `LoyaltyTransaction` du
 * serveur.
 *
 * ⚠ `expire` N'A PLUS AUCUN PRODUCTEUR et il reste ici : l'expiration a été
 * retirée avec les points, mais des lignes historiques le portent, et une
 * écriture passée est une trace. La retirer ferait sortir ces lignes sans
 * libellé. Même raison pour les deux annulations.
 */
export const TYPE_CAGNOTTE: Record<string, string> = {
  earn: "Cagnotte gagnée",
  redeem: "Cagnotte utilisée",
  expire: "Cagnotte expirée",
  adjust: "Ajustement manuel",
  bonus: "Bonus",
  earn_reversal: "Annulation gain",
  redeem_reversal: "Annulation utilisation",
};

export interface MouvementCagnotte {
  id: string;
  type: string;
  typeLabel: string;
  /** Positif pour un gain, négatif pour un emploi. */
  montant: number;
  soldeApres: number;
  description: string;
  venteId: string | null;
  date: Date | null;
}

/**
 * Le registre de cagnotte d'un client, LU EN LOCAL.
 *
 * ⚠ IL SE LIT HORS LIGNE, et c'est la raison d'être de `loyalty_transactions`
 * au manifeste de tirage. La fiche d'un client ne peut pas exiger la 2G pour
 * dire ce qu'il a gagné - c'est au comptoir qu'on lui répond.
 *
 * ⚠ LA CAGNOTTE EST EN DEVISE PRINCIPALE, toujours : c'est en elle que le
 * programme la calcule et que le comptoir l'emploie. Il n'y a donc rien à
 * ventiler, et aucune devise à porter par ligne.
 */
export async function mouvementsCagnotte(
  clientId: string,
  limite = 100
): Promise<MouvementCagnotte[]> {
  // Le registre pend à la FICHE de fidélité, pas au client. Un client sans
  // fiche n'a jamais rien gagné : la liste est vide, et c'est juste.
  const [fiche] = await db
    .select({ id: customerLoyalty.id })
    .from(customerLoyalty)
    .where(eq(customerLoyalty.customerId, clientId))
    .limit(1);
  if (!fiche) return [];

  const lignes = await db
    .select()
    .from(loyaltyTransactions)
    .where(eq(loyaltyTransactions.customerLoyaltyId, fiche.id))
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(limite);

  return lignes.map((l) => ({
    id: l.id,
    type: l.transactionType,
    typeLabel: TYPE_CAGNOTTE[l.transactionType] ?? l.transactionType,
    montant: nb(l.amount),
    soldeApres: nb(l.balanceAfter),
    description: l.description ?? "",
    venteId: l.saleId ?? null,
    date: l.createdAt ?? null,
  }));
}

// ------------------------------------------------- modification d'un client

/** D'où part le formulaire de modification d'un client. */
export interface ClientAEditer {
  corps: Partial<CorpsClient>;
  creationEnFile: string | null;
  envoiModification: EtatEnvoi | undefined;
}

/**
 * Ce que le formulaire de modification doit montrer d'un client. Même règle que
 * `articleAEditer` : la dernière modification en file PRIME sur la fiche, et un
 * client encore en file se modifie à partir de son corps de création.
 */
export async function clientAEditer(id: string): Promise<ClientAEditer | null> {
  const [creations, modifications, [ligne]] = await Promise.all([
    enAttenteParType<Partial<CorpsClient> & { id: string }>("customer.create", { avecBloquees: true }),
    enAttenteParType<Partial<CorpsClient> & { id: string }>("customer.update", { avecBloquees: true }),
    db.select().from(customers).where(eq(customers.id, id)).limit(1),
  ]);
  const creation = creations.find((o) => o.payload.id === id) ?? null;
  const miennes = modifications.filter((o) => o.payload.id === id);
  const derniere = miennes[miennes.length - 1];
  const base: Partial<CorpsClient> | null = ligne
    ? corpsDepuisLigneClient(ligne)
    : creation
      ? creation.payload
      : null;
  if (!base) return null;
  return {
    corps: derniere ? { ...base, ...derniere.payload } : base,
    creationEnFile: creation?.id ?? null,
    envoiModification: miennes.length ? pireEnvoi(miennes.map((o) => o.envoi)) : undefined,
  };
}

