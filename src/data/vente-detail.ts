/**
 * Lecture d'UNE vente : son détail, ses lignes, ses règlements.
 * Miroir de `app/dashboard/sales/[id]/page.tsx`.
 *
 * Deux règles de ce dépôt s'appliquent ici mot pour mot.
 *
 * **Le partage gros/détail est LU, jamais recalculé.** Une ligne de vente porte
 * `package_quantity` (les contenants réellement facturés) et `packaging_factor`
 * (le facteur figé au moment de la vente). Le vrac est la différence. Redécouper
 * le total au facteur d'aujourd'hui écrirait « 4 casiers + 3 bouteilles » là où
 * le client a acheté « 3 casiers + 27 bouteilles », et l'historique se
 * réécrirait à chaque changement de conditionnement.
 *
 * **Rien n'est recalculé de ce que le serveur a arrêté.** Les totaux, la remise,
 * la part fidélité et le reste dû sont ceux de la facture. Le seul découpage
 * fait ici est celui de `discount_amount` en remise commerciale et remise
 * fidélité, parce que le champ les englobe : les afficher l'une sous l'autre
 * sans retrancher montrerait deux fois la même somme. C'est exactement
 * `splitDiscount` du reçu.
 */
import { asc, eq } from "drizzle-orm";
import { formatPackagedSplit, getPackaging, pluralizeUnit } from "@vente-facile/core";

import { db } from "@/db/client";
import {
  customers,
  paymentMethods,
  payments,
  products,
  registers,
  sales,
  saleItems,
  units,
  warehouses,
} from "@/db/schema";

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface LigneVente {
  id: string;
  produit: string;
  sku: string | null;
  /** « 2 casiers + 3 bouteilles », dans les termes de la FACTURATION. */
  quantiteAffichee: string;
  /** Total en unités de détail, pour le rapprochement de stock. */
  quantiteTotale: number;
  /** Contenants scellés réellement facturés. Zéro : la ligne est en vrac pur. */
  contenants: number;
  /** Null quand le produit se vend à l'unité seule : rien à ventiler. */
  facteur: number | null;
  prixUnitaire: number;
  /** Prix du contenant, quand la ligne en porte. */
  prixContenant: number | null;
  remisePourcent: number;
  total: number;
}

export interface ReglementVente {
  id: string;
  methode: string;
  montant: number;
  devise: string;
  /** Montant réellement remis, quand il est dans une autre devise. */
  remis: number | null;
  deviseRemise: string | null;
  reference: string | null;
  numeroRecu: string | null;
  date: Date | null;
}

export interface DetailVente {
  id: string;
  reference: string;
  statut: string;
  devise: string;
  date: Date | null;
  echeance: Date | null;
  client: { id: string; nom: string; telephone: string | null } | null;
  caisse: string | null;
  entrepot: string | null;
  notes: string;
  ticketImprime: boolean;

  sousTotal: number;
  taxes: number;
  /** `discount_amount` moins la part fidélité : la remise commerciale seule. */
  remiseCommerciale: number;
  remisePourcent: number;
  remiseFidelite: number;
  pointsUtilises: number;
  total: number;
  paye: number;
  resteAPayer: number;
  monnaieRendue: number;

  lignes: LigneVente[];
  reglements: ReglementVente[];
}

export async function detailVente(id: string): Promise<DetailVente | null> {
  const [v] = await db
    .select({
      vente: sales,
      clientNom: customers.name,
      clientTel: customers.phone,
      caisse: registers.name,
      entrepot: warehouses.name,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(registers, eq(registers.id, sales.registerId))
    .leftJoin(warehouses, eq(warehouses.id, sales.warehouseId))
    .where(eq(sales.id, id))
    .limit(1);
  if (!v) return null;

  const uniteContenant = units;
  const lignes = await db
    .select({
      id: saleItems.id,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      packageQuantity: saleItems.packageQuantity,
      packageUnitPrice: saleItems.packageUnitPrice,
      packagingFactor: saleItems.packagingFactor,
      discountPercentage: saleItems.discountPercentage,
      total: saleItems.total,
      description: saleItems.description,
      produit: products.name,
      sku: products.sku,
      sellingMode: products.sellingMode,
      unite: uniteContenant.name,
    })
    .from(saleItems)
    .leftJoin(products, eq(products.id, saleItems.productId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.unitId))
    .where(eq(saleItems.saleId, id))
    .orderBy(asc(saleItems.createdAt));

  const reglements = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      tendered: payments.tenderedAmount,
      currency: payments.currency,
      reference: payments.reference,
      receiptNumber: payments.receiptNumber,
      paidAt: payments.paidAt,
      methode: paymentMethods.name,
    })
    .from(payments)
    .leftJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
    .where(eq(payments.saleId, id))
    .orderBy(asc(payments.paidAt));

  const s = v.vente;
  const remiseFidelite = Math.max(0, nb(s.loyaltyRedemptionAmount));

  return {
    id: s.id,
    reference: s.reference,
    statut: s.status,
    devise: s.currency,
    date: s.saleDate ?? null,
    echeance: s.dueDate ?? null,
    client: s.customerId
      ? {
          id: s.customerId,
          nom: v.clientNom ?? "Client",
          telephone: v.clientTel?.trim() || null,
        }
      : null,
    caisse: v.caisse ?? null,
    entrepot: v.entrepot ?? null,
    notes: s.notes ?? "",
    ticketImprime: Boolean(s.receiptPrinted),

    sousTotal: nb(s.subtotal),
    taxes: nb(s.taxAmount),
    remiseCommerciale: Math.max(0, nb(s.discountAmount) - remiseFidelite),
    remisePourcent: nb(s.discountPercentage),
    remiseFidelite,
    // Les points consommés ne sont pas sur `Sale` : ils vivent au registre de
    // fidélité, qui n'est pas tiré ligne à ligne. Le montant, lui, suffit à
    // dire ce que le client a économisé, et c'est lui qui figure sur le ticket.
    pointsUtilises: 0,
    total: nb(s.total),
    paye: nb(s.amountPaid),
    resteAPayer: nb(s.amountDue),
    monnaieRendue: nb(s.changeAmount),

    lignes: lignes.map((l) => {
      const totalUnites = nb(l.quantity);
      const paquets = nb(l.packageQuantity);
      // Le facteur FIGÉ sur la ligne, jamais celui du produit aujourd'hui.
      const facteur = l.packagingFactor != null ? Number(l.packagingFactor) : null;
      const conditionnement =
        facteur && facteur >= 2
          ? getPackaging({
              selling_mode: l.sellingMode,
              units_per_package: facteur,
              unit_name: l.unite,
            })
          : null;
      const vrac = facteur ? totalUnites - paquets * facteur : totalUnites;

      return {
        id: l.id,
        produit: l.produit ?? l.description ?? "Produit supprimé",
        sku: l.sku ?? null,
        quantiteAffichee:
          conditionnement && (paquets > 0 || vrac > 0)
            ? formatPackagedSplit(conditionnement, paquets, Math.max(0, vrac))
            : `${totalUnites} ${pluralizeUnit(l.unite ?? "unité", totalUnites)}`,
        quantiteTotale: totalUnites,
        contenants: paquets,
        facteur: conditionnement ? facteur : null,
        prixUnitaire: nb(l.unitPrice),
        prixContenant: l.packageUnitPrice != null ? nb(l.packageUnitPrice) : null,
        remisePourcent: nb(l.discountPercentage),
        total: nb(l.total),
      };
    }),

    reglements: reglements.map((p) => ({
      id: p.id,
      methode: p.methode ?? "Règlement",
      montant: nb(p.amount),
      devise: p.currency,
      // Le montant remis n'est intéressant QUE s'il diffère de l'imputation :
      // afficher « 28 000 CDF remis » sous « 28 000 CDF » est du bruit.
      remis:
        p.tendered != null && p.currency !== v.vente.currency ? nb(p.tendered) : null,
      deviseRemise: p.currency !== v.vente.currency ? p.currency : null,
      reference: p.reference?.trim() || null,
      numeroRecu: p.receiptNumber?.trim() || null,
      date: p.paidAt ?? null,
    })),
  };
}
