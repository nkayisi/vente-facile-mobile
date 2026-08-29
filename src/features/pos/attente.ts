/**
 * Les paniers mis en attente, côté base locale.
 *
 * Un client s'aperçoit qu'il a oublié le sucre et repart dans les rayons : la
 * file derrière lui n'a pas à attendre. On range son panier, on sert les
 * suivants, on le reprend à son retour.
 *
 * Table PUREMENT LOCALE : un panier en attente ne va nulle part, il ne concerne
 * que ce terminal et cette session de caisse. Les règles de ce qu'il emporte et
 * de ce qu'il retrouve vivent dans `attente-contenu.ts`, sans base ni appareil.
 */
import * as Crypto from "expo-crypto";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { parkedCarts } from "@/db/schema";

import { articlesParIds } from "./catalogue";
import { clientParId } from "./donnees";
import { PANIER_VIDE, type EtatPanier } from "./etat-panier";
import {
  analyser,
  remiseReportable,
  restaurerLignes,
  serialiser,
  type Reprise,
} from "./attente-contenu";

export {
  analyser,
  etiquetteParDefaut,
  restaurerLignes,
  serialiser,
  type ContenuEnAttente,
  type LigneEnAttente,
  type Reprise,
} from "./attente-contenu";

/** Une ligne de la liste : ce que la table porte, sans son contenu. */
export interface PanierEnAttente {
  id: string;
  label: string;
  lineCount: number;
  totalAmount: string;
  totalCurrency: string;
  createdAt: Date;
}

export async function mettreEnAttente(options: {
  etat: EtatPanier;
  label: string;
  registerSessionId: string | null;
  totalAmount: string;
  totalCurrency: string;
}): Promise<string> {
  const id = Crypto.randomUUID();
  await db.insert(parkedCarts).values({
    id,
    label: options.label.trim() || "Panier",
    registerSessionId: options.registerSessionId,
    content: JSON.stringify(serialiser(options.etat)),
    lineCount: options.etat.lignes.length,
    totalAmount: options.totalAmount,
    totalCurrency: options.totalCurrency,
    createdAt: new Date(),
  });
  return id;
}

/** Le plus récent d'abord : c'est presque toujours celui qu'on vient de ranger. */
export async function listerEnAttente(): Promise<PanierEnAttente[]> {
  return db
    .select({
      id: parkedCarts.id,
      label: parkedCarts.label,
      lineCount: parkedCarts.lineCount,
      totalAmount: parkedCarts.totalAmount,
      totalCurrency: parkedCarts.totalCurrency,
      createdAt: parkedCarts.createdAt,
    })
    .from(parkedCarts)
    .orderBy(desc(parkedCarts.createdAt));
}

export async function compterEnAttente(): Promise<number> {
  const lignes = await db.select({ id: parkedCarts.id }).from(parkedCarts);
  return lignes.length;
}

export async function supprimerEnAttente(id: string): Promise<void> {
  await db.delete(parkedCarts).where(eq(parkedCarts.id, id));
}

/**
 * Reprend un panier rangé, et le SUPPRIME de la liste.
 *
 * La suppression est immédiate parce qu'un panier repris qui resterait affiché
 * se ferait reprendre une seconde fois sur un autre terminal ou un autre
 * client, et vendrait deux fois le même stock.
 */
export async function reprendre(
  id: string,
  warehouseId: string | null
): Promise<Reprise | null> {
  const [ligne] = await db.select().from(parkedCarts).where(eq(parkedCarts.id, id)).limit(1);
  if (!ligne) return null;

  const contenu = analyser(ligne.content);
  if (!contenu) {
    await supprimerEnAttente(id);
    return {
      etat: PANIER_VIDE,
      ecartees: ["Ce panier est illisible et a été retiré de la liste."],
      prixChanges: [],
      clientPerdu: false,
    };
  }

  const articles = await articlesParIds(
    contenu.lignes.map((l) => l.productId),
    warehouseId
  );
  const { lignes, ecartees, prixChanges } = restaurerLignes(contenu, articles);

  const client = contenu.clientId ? await clientParId(contenu.clientId) : null;
  const clientPerdu = contenu.clientId !== null && client === null;

  await supprimerEnAttente(id);

  return {
    etat: {
      ...PANIER_VIDE,
      lignes,
      remiseGlobale: remiseReportable(contenu, ecartees.length),
      client,
      deviseFacture: contenu.deviseFacture,
      deviseMonnaie: contenu.deviseMonnaie,
    },
    ecartees,
    prixChanges,
    clientPerdu,
  };
}
