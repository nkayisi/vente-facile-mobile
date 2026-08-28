/**
 * La caisse et sa session, vues depuis le terminal.
 *
 * Une vente ne s'attache pas à un appareil mais à une SESSION de caisse : c'est
 * elle qui donne l'entrepôt d'où sort le stock et le tiroir où entre l'argent.
 * Sans elle, il n'y a pas de comptoir, et le serveur refuserait la vente.
 *
 * Tout se lit dans la base locale. Ouvrir une caisse hors ligne est un acte
 * comme un autre : il part au journal et sera rejoué par le serveur.
 */
import * as Crypto from "expo-crypto";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { registerSessions, registers, warehouses } from "@/db/schema";
import { enAttenteParType, enqueue } from "@/sync";

export interface CaissePos {
  id: string;
  name: string;
  warehouseId: string | null;
  warehouseName: string | null;
}

export interface SessionCaisse {
  id: string;
  registerId: string;
  registerName: string;
  warehouseId: string | null;
  openingBalance: string | null;
  openedAt: Date | null;
  /** Vraie tant que l'ouverture n'a pas été confirmée par le serveur. */
  enAttente: boolean;
}

export async function caissesDisponibles(): Promise<CaissePos[]> {
  const lignes = await db
    .select({
      id: registers.id,
      name: registers.name,
      warehouseId: registers.warehouseId,
      warehouseName: warehouses.name,
    })
    .from(registers)
    .leftJoin(warehouses, eq(warehouses.id, registers.warehouseId))
    .where(eq(registers.isActive, true));
  return lignes;
}

/**
 * La session ouverte sur ce terminal, s'il y en a une.
 *
 * Deux sources, dans cet ordre : la table tirée, qui fait foi, puis le journal,
 * pour une ouverture faite hors ligne que le serveur n'a pas encore vue.
 *
 * On ne filtre PAS sur l'utilisateur : une session appartient à la CAISSE, et
 * deux vendeurs qui se relaient au même comptoir travaillent sur la même. Le
 * serveur, lui, contrôle qui a le droit de la fermer.
 */
export async function sessionOuverte(): Promise<SessionCaisse | null> {
  const [ligne] = await db
    .select({
      id: registerSessions.id,
      registerId: registerSessions.registerId,
      registerName: registers.name,
      warehouseId: registers.warehouseId,
      openingBalance: registerSessions.openingBalance,
      openedAt: registerSessions.openedAt,
    })
    .from(registerSessions)
    .innerJoin(registers, eq(registers.id, registerSessions.registerId))
    .where(eq(registerSessions.status, "open"))
    .orderBy(desc(registerSessions.openedAt))
    .limit(1);

  if (ligne) return { ...ligne, enAttente: false };

  // Rien d'authentique : une ouverture peut attendre dans le journal. On ne
  // l'écrit pas dans la table tirée, sans quoi un refus du serveur laisserait
  // une session fantôme sur laquelle le terminal continuerait de vendre.
  const attentes = await enAttenteParType<{ register: string; opening_balance?: string }>(
    "register_session.open"
  );
  const derniere = attentes[attentes.length - 1];
  if (!derniere) return null;

  const [caisse] = await db
    .select({ name: registers.name, warehouseId: registers.warehouseId })
    .from(registers)
    .where(eq(registers.id, derniere.payload.register))
    .limit(1);

  return {
    id: derniere.id,
    registerId: derniere.payload.register,
    registerName: caisse?.name ?? "Caisse",
    warehouseId: caisse?.warehouseId ?? null,
    openingBalance: derniere.payload.opening_balance ?? "0",
    openedAt: derniere.occurredAt,
    enAttente: true,
  };
}

/**
 * Ouvre une session de caisse.
 *
 * L'identifiant est tiré ICI et porte l'idempotence : si l'envoi se coupe après
 * que le serveur a enregistré, le renvoi retombe sur la même session au lieu
 * d'en créer une seconde. C'est aussi ce qui permet aux ventes de la journée de
 * référencer une session que le serveur n'a pas encore vue.
 *
 * Rien n'est écrit dans `register_sessions` : le journal suffit à faire exister
 * la session pour le comptoir, et il sait l'oublier si le serveur refuse. Le
 * refus le plus probable est qu'une autre session soit déjà ouverte sur cette
 * caisse ; le serveur le dit en nommant qui l'a ouverte et quand.
 */
export async function ouvrirSession(
  registerId: string,
  fondDeCaisse: string
): Promise<SessionCaisse> {
  const id = Crypto.randomUUID();

  await enqueue(id, "register_session.open", {
    id,
    register: registerId,
    opening_balance: fondDeCaisse || "0",
  });

  const [caisse] = await db
    .select({ name: registers.name, warehouseId: registers.warehouseId })
    .from(registers)
    .where(eq(registers.id, registerId))
    .limit(1);

  return {
    id,
    registerId,
    registerName: caisse?.name ?? "Caisse",
    warehouseId: caisse?.warehouseId ?? null,
    openingBalance: fondDeCaisse || "0",
    openedAt: new Date(),
    enAttente: true,
  };
}
