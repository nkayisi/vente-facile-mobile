/**
 * Ce que l'encaissement doit lire, hors catalogue.
 *
 * Moyens de paiement, clients, solde de fidélité. Tout vient de la base locale,
 * y compris les soldes : un client à qui l'on refuse le crédit parce que le
 * réseau est absent est un client perdu, alors que le serveur revérifiera de
 * toute façon à la poussée.
 */
import { and, asc, eq, isNull, like, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { customerLoyalty, customers, paymentMethods } from "@/db/schema";
import { sansAccent } from "./catalogue";
import type { ClientPos } from "./panier";

export interface MoyenPaiement {
  id: string;
  name: string;
  code: string;
  methodType: string;
  isDefault: boolean;
  requiresReference: boolean;
}

/**
 * Moyens de paiement actifs, l'usuel en tête.
 *
 * `loyalty` et `advance` sont ÉCARTÉS : ce ne sont pas des façons de remettre
 * de l'argent au comptoir mais des mécanismes que le serveur applique lui-même
 * (les points via `points_used`, l'avance en la consommant à l'émission). Les
 * proposer au caissier ferait entrer au tiroir un argent qui n'y arrive pas.
 */
export async function moyensDePaiement(): Promise<MoyenPaiement[]> {
  const lignes = await db
    .select({
      id: paymentMethods.id,
      name: paymentMethods.name,
      code: paymentMethods.code,
      methodType: paymentMethods.methodType,
      isDefault: paymentMethods.isDefault,
      requiresReference: paymentMethods.requiresReference,
    })
    .from(paymentMethods)
    .where(eq(paymentMethods.isActive, true))
    .orderBy(asc(paymentMethods.name));

  return lignes
    .filter((m) => m.methodType !== "loyalty" && m.methodType !== "advance")
    .sort((a, b) => {
      // L'espèces d'abord : c'est l'écrasante majorité des ventes au comptoir.
      const rang = (m: typeof a) => (m.methodType === "cash" ? 0 : m.isDefault ? 1 : 2);
      return rang(a) - rang(b);
    });
}

export async function chercherClients(terme: string, limite = 25): Promise<ClientPos[]> {
  const motif = sansAccent(terme.trim());
  const conditions = [
    eq(customers.isActive, true),
    or(eq(customers.isDeleted, false), isNull(customers.isDeleted))!,
  ];
  if (motif) {
    const m = `%${motif}%`;
    conditions.push(
      or(
        like(sql`lower(${customers.name})`, m),
        like(sql`lower(coalesce(${customers.phone}, ''))`, m),
        like(sql`lower(coalesce(${customers.code}, ''))`, m)
      )!
    );
  }

  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      allow_credit: customers.allowCredit,
      credit_limit: customers.creditLimit,
      current_balance: customers.currentBalance,
    })
    .from(customers)
    .where(and(...conditions))
    .orderBy(asc(customers.name))
    .limit(limite);
}

/**
 * Un client par son identifiant, relu depuis la base locale.
 *
 * `null` quand il a disparu ou n'est plus actif. Sert la reprise d'un panier
 * mis en attente : le solde et l'autorisation de crédit ont pu changer depuis,
 * et c'est sur eux que se décide un refus de crédit.
 */
export async function clientParId(id: string): Promise<ClientPos | null> {
  const [ligne] = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      allow_credit: customers.allowCredit,
      credit_limit: customers.creditLimit,
      current_balance: customers.currentBalance,
    })
    .from(customers)
    .where(
      and(
        eq(customers.id, id),
        eq(customers.isActive, true),
        or(eq(customers.isDeleted, false), isNull(customers.isDeleted))!
      )
    )
    .limit(1);
  return ligne ?? null;
}

/**
 * Points disponibles d'un client.
 *
 * Zéro quand la ligne n'existe pas : contrairement au stock, l'absence est ici
 * une information certaine. Un client sans ligne de fidélité n'a pas de points,
 * et proposer d'en dépenser produirait un refus serveur.
 */
export async function pointsDuClient(customerId: string): Promise<number> {
  const [ligne] = await db
    .select({ points: customerLoyalty.currentPoints })
    .from(customerLoyalty)
    .where(eq(customerLoyalty.customerId, customerId))
    .limit(1);
  const n = Number(ligne?.points ?? 0);
  return Number.isFinite(n) ? n : 0;
}
