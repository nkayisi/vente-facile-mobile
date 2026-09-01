/**
 * Lectures des ventes. Miroir de `frontend/actions/sales.actions.ts`.
 *
 * **Les totaux ne se somment JAMAIS entre devises** : chaque vente porte la
 * sienne, et le hub les rend par devise. C'est la règle que le back-office a dû
 * apprendre à ses dépens (`MultiCurrencyTotal`), et elle vaut ici mot pour mot.
 */
import { and, desc, eq, gte, inArray, like, lt, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { ventesEnAttente } from "@/features/ventes/attente";
import type { EtatEnvoi } from "@/sync";

import { depuisQuand, type Periode } from "./periodes";

export type { Periode };
import { customers, registerSessions, registers, saleItems, sales } from "@/db/schema";

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
  /**
   * Nombre de LIGNES de la vente, comme `items_count` du back-office.
   *
   * Absent quand la lecture ne le compte pas : seul le hub l'affiche, et le
   * joindre partout ferait payer une agrégation à des écrans qui n'en font
   * rien. `undefined` se lit « pas compté », jamais « zéro article ».
   */
  nbArticles?: number;
  /**
   * Où en est l'envoi de cette vente, quand elle vit encore dans le JOURNAL.
   *
   * Absent pour une vente tirée : elle est arrêtée, il n'y a rien à dire. Son
   * numéro est définitif et ses montants sont ceux du papier dans les deux cas,
   * mais « attend son envoi » et « attend un droit » n'appellent pas le même
   * geste : le premier passera seul, le second demande de régler l'abonnement.
   */
  envoi?: EtatEnvoi;
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

  // Le nombre de lignes par vente, en UNE requête groupée. Le relire vente par
  // vente ferait une lecture par ligne de la liste, sur le premier écran que
  // le caissier ouvre le matin.
  const compte = new Map<string, number>();
  if (lignes.length > 0) {
    const parVente = await db
      .select({ saleId: saleItems.saleId, n: sql<number>`count(*)` })
      .from(saleItems)
      .where(inArray(saleItems.saleId, lignes.map((l) => l.id)))
      .groupBy(saleItems.saleId);
    for (const c of parVente) compte.set(c.saleId, Number(c.n) || 0);
  }

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LES VENTES DU JOURNAL COMPTENT AUTANT QUE CELLES DE LA TABLE.          │
  // │                                                                        │
  // │ Sans elles, un caissier qui vend hors ligne - le mode pour lequel ce   │
  // │ terminal existe - encaisse, imprime, revient ici et lit « Ventes du    │
  // │ jour (0) ». Voir `features/ventes/attente.ts` : elles sont FUSIONNÉES  │
  // │ à la lecture, jamais écrites dans `sales`, qui n'appartient qu'au      │
  // │ tirage.                                                                │
  // └────────────────────────────────────────────────────────────────────────┘
  const attente = await ventesEnAttente();
  const dejaTirees = new Set(lignes.map((l) => l.reference));
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LES MÊMES BORNES DE JOUR DES DEUX CÔTÉS.                               │
  // │                                                                        │
  // │ Les ventes tirées sont bornées à la journée ; celles du journal        │
  // │ arrivaient entières. Après trois jours hors ligne - le mode pour       │
  // │ lequel ce terminal existe - « Ventes du jour » annonçait trois jours   │
  // │ de recette, sur les quatre relevés à la fois. Le caissier compare ce   │
  // │ chiffre à son tiroir, et il ne peut pas tomber juste.                  │
  // │                                                                        │
  // │ Le filtre porte sur `occurredAt`, l'heure où le caissier a pris        │
  // │ l'argent : c'est ce que « ventes du jour » veut dire, et c'est ce que  │
  // │ le tiroir contient.                                                    │
  // │                                                                        │
  // │ Le serveur inscrit LA MÊME HEURE dans `sale_date` depuis l'horloge de  │
  // │ l'acte (`apps.core.clock`) : une vente ne change donc pas de jour en   │
  // │ se synchronisant, et la borne d'ici est celle de la table. Avant cela, │
  // │ `sale_date` était un `auto_now_add` posé à la poussée, et la vente     │
  // │ sautait au jour du retour du réseau.                                   │
  // └────────────────────────────────────────────────────────────────────────┘
  // Une vente poussée puis retirée est dans les DEUX : la table fait foi, sinon
  // elle se compterait deux fois le temps que le journal se vide.
  const restantes = attente.filter(
    (v) =>
      !dejaTirees.has(v.reference) &&
      v.date >= debut &&
      v.date < fin
  );
  // Les ventes dont le ticket est introuvable : leur montant est INCONNU.
  const sansMontant = new Set(
    restantes.filter((v) => v.total === null).map((v) => v.id)
  );

  const ventesDuJour: VenteResume[] = [
    ...restantes.map((v) => ({
      id: v.id,
      reference: v.reference,
      client: v.client,
      // Le statut se déduit du restant dû, comme le serveur le posera.
      statut: v.resteAPayer > 0 ? "partially_paid" : "completed",
      total: v.total ?? 0,
      resteAPayer: v.resteAPayer,
      devise: v.devise ?? "",
      date: v.date,
      nbArticles: v.nbArticles ?? undefined,
      envoi: v.envoi,
    })),
    ...lignes.map((l) => ({
      id: l.id,
      reference: l.reference,
      client: l.client ?? null,
      statut: l.statut,
      total: nb(l.total),
      resteAPayer: nb(l.amountDue),
      devise: l.currency ?? "",
      date: l.saleDate ?? null,
      nbArticles: compte.get(l.id) ?? 0,
    })),
  ].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  // Les agrégats se refont sur la liste FUSIONNÉE. Une vente dont le ticket
  // n'a pas été retrouvé porte un montant INCONNU : elle compte comme
  // transaction, jamais dans une somme d'argent - un zéro inventé fausserait
  // la journée sans rien signaler.
  const chiffrees = ventesDuJour.filter(
    (v) => v.devise !== "" && !sansMontant.has(v.id)
  );
  const somme = (choisir: (v: VenteResume) => number) => {
    const m = new Map<string, number>();
    for (const v of chiffrees) {
      const montant = choisir(v);
      if (montant === 0) continue;
      m.set(v.devise, (m.get(v.devise) ?? 0) + montant);
    }
    return [...m.entries()]
      .map(([devise, montant]) => ({ devise, montant }))
      .sort((a, b) => a.devise.localeCompare(b.devise));
  };

  const n = ventesDuJour.length;
  const dues = ventesDuJour.filter((v) => v.resteAPayer > 0);

  return {
    totalParDevise: somme((v) => v.total),
    transactions: n,
    panierMoyenParDevise: n === 0 ? [] : somme((v) => v.total / n),
    aEncaisserParDevise: somme((v) => v.resteAPayer),
    nbAEncaisser: dues.length,
    ventesDuJour,
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

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ L'HISTORIQUE FUSIONNE LE JOURNAL, LUI AUSSI.                           │
  // │                                                                        │
  // │ Le hub ne rend que la JOURNÉE ; sans cette fusion, une vente encaissée │
  // │ avant-hier et pas encore poussée - trois jours sans réseau, le mode    │
  // │ pour lequel ce terminal existe - n'apparaîtrait plus nulle part. Le    │
  // │ caissier tient son ticket, cherche sa vente, et l'application lui      │
  // │ répond qu'elle n'existe pas. C'est la règle déjà posée sur les retours │
  // │ et les devis (`creationsEnAttente`) : on fusionne dans les LISTES      │
  // │ comme dans les fiches.                                                 │
  // └────────────────────────────────────────────────────────────────────────┘
  const attente = await ventesEnAttente();

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

  // Les mêmes filtres que le SQL, appliqués aux ventes du journal. Elles sont
  // peu nombreuses par construction - ce qui n'a pas encore été poussé - et
  // les filtrer en mémoire ne tronque rien, contrairement à un filtrage
  // appliqué après une page déjà limitée.
  const dejaTirees = new Set(lignes.map((l) => l.reference));
  const enAttente = attente
    .filter((v) => !dejaTirees.has(v.reference))
    .map((v) => ({
      id: v.id,
      reference: v.reference,
      client: v.client,
      // Le statut se déduit du restant dû, comme le serveur le posera.
      statut: v.resteAPayer > 0 ? "partially_paid" : "completed",
      total: v.total ?? 0,
      resteAPayer: v.resteAPayer,
      devise: v.devise ?? "",
      date: v.date,
      nbArticles: v.nbArticles ?? undefined,
      envoi: v.envoi,
    }))
    .filter((v) => {
      if (borne && v.date < borne) return false;
      if (f.statut && v.statut !== f.statut) return false;
      if (!terme) return true;
      return (
        v.reference.toLowerCase().includes(terme) ||
        (v.client ?? "").toLowerCase().includes(terme)
      );
    });

  return {
    // Le compteur porte la liste RÉELLE : l'annoncer sans les ventes en file
    // ferait dire « 3 ventes » au-dessus de quatre lignes.
    total: total + enAttente.length,
    elements: [
      ...enAttente,
      ...lignes.map((l) => ({
        id: l.id,
        reference: l.reference,
        client: l.client ?? null,
        statut: l.statut,
        total: nb(l.total),
        resteAPayer: nb(l.amountDue),
        devise: l.currency ?? "",
        date: l.saleDate ?? null,
      })),
    ].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)),
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
