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
import { enAttenteParType } from "@/sync";
import { clientPosDepuisCreation, fusionnerClients, type CreationClient } from "./clients-en-file";
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

  const [tires, enFile] = await Promise.all([
    db
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
      .limit(limite),
    clientsEnFile(),
  ]);
  // Un client créé au terminal et pas encore envoyé n'est pas dans la table :
  // sans la fusion, il était introuvable à l'encaissement. Voir `clients-en-file.ts`.
  return fusionnerClients(tires, enFile, terme, sansAccent, limite);
}

/**
 * Les clients dont la création attend encore dans le journal, bloquées
 * comprises : un blocage dure le temps qu'un droit soit accordé, et le client
 * existe déjà pour le caissier qui vient de le saisir.
 */
async function clientsEnFile(): Promise<ClientPos[]> {
  const ops = await enAttenteParType<CreationClient>("customer.create", {
    avecBloquees: true,
  });
  return ops.map((o) => clientPosDepuisCreation(o.payload));
}

/**
 * Les opérations dont une pièce faite pour ce client doit DÉPENDRE : sa
 * création, si elle attend encore dans le journal.
 *
 * ⚠ Sans cette dépendance, une vente pour un client créé hors ligne pouvait
 * partir avant lui (création temporisée) et être refusée pour un client
 * introuvable, ticket déjà sorti. Le terminal emploie le même identifiant
 * pour l'acte de création et pour le client.
 */
export async function dependancesDuClient(clientId: string | null | undefined): Promise<string[]> {
  if (!clientId) return [];
  const enFile = await clientsEnFile();
  return enFile.some((c) => c.id === clientId) ? [clientId] : [];
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
  if (ligne) return ligne;
  // Un panier rangé pour un client créé au terminal : il n'est pas encore tiré.
  return (await clientsEnFile()).find((c) => c.id === id) ?? null;
}

/**
 * Cagnotte de fidélité d'un client, en devise PRINCIPALE.
 *
 * Zéro quand la ligne n'existe pas : contrairement au stock, l'absence est ici
 * une information certaine. Un client sans ligne de fidélité n'a aucune
 * cagnotte, et proposer d'en dépenser produirait un refus serveur.
 */
export async function cagnotteDuClient(customerId: string): Promise<number> {
  const [ligne] = await db
    .select({ cagnotte: customerLoyalty.balance })
    .from(customerLoyalty)
    .where(eq(customerLoyalty.customerId, customerId))
    .limit(1);
  const n = Number(ligne?.cagnotte ?? 0);
  return Number.isFinite(n) ? n : 0;
}
