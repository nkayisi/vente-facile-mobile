/**
 * Retours et devis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NI L'UN NI L'AUTRE N'AVAIT D'ÉCRAN, NULLE PART.                         │
 * │                                                                          │
 * │ Le backend est complet depuis longtemps ; ni le web ni le mobile ne les  │
 * │ affichaient. Le terminal crée donc la référence, et ces écrans sont les  │
 * │ premiers de tout le produit à les rendre.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/db/client";
import { deviseOuPrincipale } from "./devise-principale";
import {
  customers,
  products,
  quotationItems,
  quotations,
  saleItems,
  saleReturnItems,
  saleReturns,
  sales,
  users,
} from "@/db/schema";

/** « Nelson Kayisi », ou `null` quand l'utilisateur n'est pas descendu. */
const nomComplet = (
  prenom: string | null | undefined,
  nom: string | null | undefined
): string | null => `${prenom ?? ""} ${nom ?? ""}`.trim() || null;

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

type Ton = "neutral" | "warning" | "primary" | "success" | "destructive";

/** Statuts d'un retour, repris du modèle serveur. */
export const STATUT_RETOUR: Record<string, { label: string; ton: Ton }> = {
  draft: { label: "Brouillon", ton: "neutral" },
  pending: { label: "En attente", ton: "warning" },
  completed: { label: "Approuvé", ton: "success" },
  rejected: { label: "Rejeté", ton: "destructive" },
};

export const STATUT_DEVIS: Record<string, { label: string; ton: Ton }> = {
  draft: { label: "Brouillon", ton: "neutral" },
  sent: { label: "Envoyé", ton: "primary" },
  accepted: { label: "Accepté", ton: "success" },
  rejected: { label: "Refusé", ton: "destructive" },
  expired: { label: "Expiré", ton: "warning" },
  converted: { label: "Converti", ton: "success" },
};

// -------------------------------------------------------------------- retours

export interface RetourResume {
  id: string;
  reference: string;
  venteReference: string | null;
  statut: string;
  montant: number;
  rembourse: number;
  /**
   * La devise de la VENTE d'origine.
   *
   * `SaleReturn` n'en porte pas : le montant rendu est nécessairement dans la
   * devise de la facture. Le déduire ici évite d'écrire un montant sans
   * symbole - « 190 240,5 » au lieu de « 190 240,5 $ » - qui ne dit pas dans
   * quoi le client est remboursé.
   */
  devise: string;
  motif: string;
  date: Date | null;
}

export async function listeRetours(
  f: { recherche?: string; statut?: string | null; limite?: number } = {}
): Promise<RetourResume[]> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;

  const conditions = [
    f.statut ? eq(saleReturns.status, f.statut) : undefined,
    terme
      ? or(
          like(sql`lower(${saleReturns.reference})`, motif),
          like(sql`lower(coalesce(${sales.reference}, ''))`, motif)
        )
      : undefined,
  ].filter(Boolean);

  const lignes = await db
    .select({
      id: saleReturns.id,
      reference: saleReturns.reference,
      statut: saleReturns.status,
      montant: saleReturns.totalAmount,
      rembourse: saleReturns.refundAmount,
      motif: saleReturns.reason,
      date: saleReturns.returnDate,
      venteReference: sales.reference,
      devise: sales.currency,
    })
    .from(saleReturns)
    .leftJoin(sales, eq(sales.id, saleReturns.originalSaleId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(saleReturns.returnDate))
    .limit(f.limite ?? 100);

  return lignes.map((r) => ({
    id: r.id,
    reference: r.reference,
    venteReference: r.venteReference ?? null,
    statut: r.statut,
    montant: nb(r.montant),
    rembourse: nb(r.rembourse),
    devise: deviseOuPrincipale(r.devise),
    motif: r.motif ?? "",
    date: r.date ?? null,
  }));
}

export interface LigneRetour {
  id: string;
  produit: string;
  quantite: number;
  prixUnitaire: number;
  total: number;
  /** Faux : l'article rendu ne retourne PAS en rayon (cassé, périmé). */
  remisEnStock: boolean;
}

export interface DetailRetour extends RetourResume {
  venteId: string | null;
  /** Le client de la facture d'origine : c'est LUI qu'on rembourse. */
  client: string | null;
  clientId: string | null;
  creePar: string | null;
  approuvePar: string | null;
  approuveLe: Date | null;
  lignes: LigneRetour[];
}

export async function detailRetour(id: string): Promise<DetailRetour | null> {
  const auteur = alias(users, "auteur_retour");
  const decideur = alias(users, "decideur_retour");

  const [r] = await db
    .select({
      retour: saleReturns,
      venteReference: sales.reference,
      devise: sales.currency,
      clientId: sales.customerId,
      client: customers.name,
      creeParPrenom: auteur.firstName,
      creeParNom: auteur.lastName,
      decideParPrenom: decideur.firstName,
      decideParNom: decideur.lastName,
    })
    .from(saleReturns)
    .leftJoin(sales, eq(sales.id, saleReturns.originalSaleId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(auteur, eq(auteur.id, saleReturns.createdById))
    .leftJoin(decideur, eq(decideur.id, saleReturns.approvedById))
    .where(eq(saleReturns.id, id))
    .limit(1);
  if (!r) return null;

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ CHAQUE LIGNE S'APPELAIT « ARTICLE DE LA VENTE ».                     │
  // │                                                                      │
  // │ La jointure allait de `original_item_id` vers `products.id`. Or ce   │
  // │ champ désigne une LIGNE DE FACTURE (`SaleItem`), pas un produit :    │
  // │ elle ne trouvait donc jamais rien, et le repli tenait lieu de nom    │
  // │ sur toutes les lignes de tous les retours. Un écran qui doit dire ce │
  // │ qui est rendu ne disait rien du tout, et c'est précisément le        │
  // │ premier renseignement qu'on vient y chercher avant d'approuver.      │
  // │                                                                      │
  // │ Le chemin est en deux sauts : `sale_return_items` → `sale_items` →   │
  // │ `products`. `description` de la ligne de facture sert de repli, car  │
  // │ c'est ce que le ticket a imprimé le jour de la vente.                │
  // └──────────────────────────────────────────────────────────────────────┘
  const lignes = await db
    .select({
      id: saleReturnItems.id,
      quantity: saleReturnItems.quantity,
      unitPrice: saleReturnItems.unitPrice,
      total: saleReturnItems.total,
      restock: saleReturnItems.restock,
      produit: products.name,
      description: saleItems.description,
    })
    .from(saleReturnItems)
    .leftJoin(saleItems, eq(saleItems.id, saleReturnItems.originalItemId))
    .leftJoin(products, eq(products.id, saleItems.productId))
    .where(eq(saleReturnItems.saleReturnId, id))
    .orderBy(asc(saleReturnItems.createdAt));

  const s = r.retour;
  return {
    id: s.id,
    reference: s.reference,
    venteId: s.originalSaleId ?? null,
    venteReference: r.venteReference ?? null,
    statut: s.status,
    montant: nb(s.totalAmount),
    rembourse: nb(s.refundAmount),
    devise: deviseOuPrincipale(r.devise),
    motif: s.reason ?? "",
    date: s.returnDate ?? null,
    client: r.client ?? null,
    clientId: r.clientId ?? null,
    creePar: nomComplet(r.creeParPrenom, r.creeParNom),
    approuvePar: nomComplet(r.decideParPrenom, r.decideParNom),
    approuveLe: s.approvedAt ?? null,
    lignes: lignes.map((l) => ({
      id: l.id,
      // Le nom du produit, sinon ce que le TICKET a imprimé le jour de la
      // vente, sinon un repli honnête : jamais un identifiant.
      produit: l.produit ?? (l.description || "Article de la vente"),
      quantite: nb(l.quantity),
      prixUnitaire: nb(l.unitPrice),
      total: nb(l.total),
      remisEnStock: Boolean(l.restock),
    })),
  };
}

// ---------------------------------------------------------------------- devis

export interface DevisResume {
  id: string;
  reference: string;
  client: string | null;
  statut: string;
  total: number;
  valideJusquau: Date | null;
  /** Vrai quand la date de validité est passée et le devis pas encore converti. */
  perime: boolean;
  date: Date | null;
}

export async function listeDevis(
  f: { recherche?: string; statut?: string | null; limite?: number } = {}
): Promise<DevisResume[]> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;
  const maintenant = Date.now();

  const conditions = [
    f.statut ? eq(quotations.status, f.statut) : undefined,
    terme
      ? or(
          like(sql`lower(${quotations.reference})`, motif),
          like(sql`lower(coalesce(${customers.name}, ''))`, motif)
        )
      : undefined,
  ].filter(Boolean);

  const lignes = await db
    .select({
      id: quotations.id,
      reference: quotations.reference,
      statut: quotations.status,
      total: quotations.total,
      validUntil: quotations.validUntil,
      date: quotations.createdAt,
      client: customers.name,
    })
    .from(quotations)
    .leftJoin(customers, eq(customers.id, quotations.customerId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(quotations.createdAt))
    .limit(f.limite ?? 100);

  return lignes.map((q) => ({
    id: q.id,
    reference: q.reference,
    client: q.client ?? null,
    statut: q.statut,
    total: nb(q.total),
    valideJusquau: q.validUntil ?? null,
    // Le serveur passe un devis en `expired` par tâche ; entre-temps, la date
    // fait foi. L'afficher « valide » alors qu'il est refusé à la conversion
    // ferait perdre du temps au comptoir.
    perime:
      q.statut !== "converted" &&
      q.validUntil != null &&
      q.validUntil.getTime() < maintenant,
    date: q.date ?? null,
  }));
}

export interface LigneDevis {
  id: string;
  produit: string;
  description: string;
  quantite: number;
  prixUnitaire: number;
  total: number;
}

export interface DetailDevis extends DevisResume {
  clientId: string | null;
  sousTotal: number;
  taxes: number;
  remise: number;
  notes: string;
  conditions: string;
  venteConvertie: string | null;
  lignes: LigneDevis[];
}

export async function detailDevis(id: string): Promise<DetailDevis | null> {
  const [q] = await db
    .select({
      devis: quotations,
      client: customers.name,
      venteConvertie: sales.reference,
    })
    .from(quotations)
    .leftJoin(customers, eq(customers.id, quotations.customerId))
    .leftJoin(sales, eq(sales.id, quotations.convertedSaleId))
    .where(eq(quotations.id, id))
    .limit(1);
  if (!q) return null;

  const lignes = await db
    .select({
      id: quotationItems.id,
      description: quotationItems.description,
      quantity: quotationItems.quantity,
      unitPrice: quotationItems.unitPrice,
      total: quotationItems.total,
      produit: products.name,
    })
    .from(quotationItems)
    .leftJoin(products, eq(products.id, quotationItems.productId))
    .where(eq(quotationItems.quotationId, id))
    .orderBy(asc(quotationItems.createdAt));

  const d = q.devis;
  const maintenant = Date.now();
  return {
    id: d.id,
    reference: d.reference,
    clientId: d.customerId ?? null,
    client: q.client ?? null,
    statut: d.status,
    sousTotal: nb(d.subtotal),
    taxes: nb(d.taxAmount),
    remise: nb(d.discountAmount),
    total: nb(d.total),
    valideJusquau: d.validUntil ?? null,
    perime:
      d.status !== "converted" &&
      d.validUntil != null &&
      d.validUntil.getTime() < maintenant,
    notes: d.notes ?? "",
    conditions: d.terms ?? "",
    venteConvertie: q.venteConvertie ?? null,
    date: d.createdAt ?? null,
    lignes: lignes.map((l) => ({
      id: l.id,
      produit: l.produit ?? "Produit supprimé",
      description: l.description ?? "",
      quantite: nb(l.quantity),
      prixUnitaire: nb(l.unitPrice),
      total: nb(l.total),
    })),
  };
}
