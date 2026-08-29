/**
 * Le reçu d'une vente, décrit depuis ce que le comptoir a sous la main.
 *
 * RIEN N'EST RECALCULÉ ICI. Les montants viennent des totaux du panier, donc de
 * `@vente-facile/core/pos`, donc du même code que le back-office. Ce fichier ne
 * fait que RÉÉTIQUETER : il traduit l'état du panier dans le vocabulaire des
 * documents. Un `quantity * unit_price` écrit ici serait une troisième
 * arithmétique, celle qui finit par imprimer un chiffre que ni l'écran ni le
 * serveur ne reconnaissent.
 *
 * L'identité imprimée vient de la session, pas d'un appel : le ticket doit
 * sortir hors ligne, coordonnées et mentions légales comprises. C'est ce qui
 * manquait aux tickets web, émis sans adresse ni téléphone parce que la liste
 * des organisations ne les portait pas.
 */
import {
  looseQuantityOf,
  lineGross,
  packagingFactorOf,
} from "@vente-facile/core/pos";
import { getPackaging, pluralizeUnit } from "@vente-facile/core";
import type {
  ReceiptChrome,
  SaleReceiptData,
  SaleReceiptItem,
} from "@vente-facile/core/receipt";

import type { SessionSnapshot } from "@/session/types";

import type { EtatPanier, LignePanier } from "./etat-panier";

/**
 * « 2 casiers + 3 bouteilles », ce que le client emporte réellement.
 *
 * Les deux compteurs sont LUS, jamais redécoupés : la ligne les porte déjà.
 * Redécouper le total au facteur du jour donnerait « 4 casiers + 3 bouteilles »
 * pour une ligne qui en porte 2 et 27, une contrevérité d'autant plus trompeuse
 * qu'elle a l'air exacte.
 */
export function libelleQuantite(ligne: LignePanier): string | undefined {
  const conditionnement = getPackaging(ligne.product);
  if (!conditionnement || !packagingFactorOf(ligne.product)) return undefined;

  const detail = looseQuantityOf(ligne);
  const parts: string[] = [];
  if (ligne.packageQuantity > 0) {
    parts.push(
      `${ligne.packageQuantity} ${pluralizeUnit(conditionnement.packageWord, ligne.packageQuantity)}`
    );
  }
  if (detail > 0) {
    parts.push(`${detail} ${pluralizeUnit(conditionnement.retailWord, detail)}`);
  }
  return parts.length > 0 ? parts.join(" + ") : undefined;
}

/** L'en-tête et le pied, tels que le marchand les a réglés. */
export function chromeDeLaSession(snapshot: SessionSnapshot | null): ReceiptChrome {
  const org = snapshot?.organization;
  return {
    org: {
      name: org?.name ?? "Vente Facile",
      address: org?.address,
      city: org?.city,
      country: org?.country,
      phone: org?.phone,
      email: org?.email,
      rccm: org?.rccm,
      idNat: org?.id_nat,
      taxId: org?.tax_id,
    },
    // L'en-tête libre COMPLÈTE l'identité, il ne la remplace pas : un marchand
    // qui ajoute un slogan ne doit pas y perdre son adresse.
    header: snapshot?.settings?.receipt_header,
    footer: snapshot?.settings?.receipt_footer,
  };
}

export interface ContexteTicket {
  reference: string;
  date: Date;
  etat: EtatPanier;
  /** Totaux du panier, calculés par le paquet partagé. */
  totaux: {
    sousTotal: number;
    taxe: number;
    remiseLignes: number;
    remiseGlobale: number;
    remiseFidelite: number;
    total: number;
    totalFacture: number;
    monnaie: number;
  };
  deviseFacture: string;
  snapshot: SessionSnapshot | null;
  registerName?: string;
  warehouseName?: string;
  /** Points gagnés sur cette vente, tels que le serveur les accordera. */
  pointsGagnes?: number;
  pointsRestants?: number;
  aCredit: boolean;
  /** Restant dû, en devise de facture. Zéro pour une vente réglée. */
  restantDu: number;
}

/**
 * Traduit l'état du comptoir en données de document.
 *
 * Le genre suit la nature de la vente et non un réglage : une vente qui laisse
 * un solde sort en « VENTE À CRÉDIT », avec son pied propre, et le client voit
 * du premier coup d'œil qu'il doit encore quelque chose.
 */
export function donneesTicketVente(contexte: ContexteTicket): SaleReceiptData {
  const { etat, totaux } = contexte;

  const items: SaleReceiptItem[] = etat.lignes.map((ligne) => ({
    name: ligne.product.name,
    quantity: ligne.quantity,
    quantityLabel: libelleQuantite(ligne),
    unitPrice: ligne.unit_price,
    discountPercentage: ligne.discount_percentage || undefined,
    total: lineGross(ligne),
  }));

  return {
    kind: contexte.aCredit ? "credit_sale" : "sale",
    number: contexte.reference,
    date: contexte.date.toISOString(),
    cashierName: contexte.snapshot?.user.full_name,
    registerName: contexte.registerName,
    customerName: etat.client?.name,
    chrome: chromeDeLaSession(contexte.snapshot),
    warehouseName: contexte.warehouseName,
    items,
    subtotal: totaux.sousTotal,
    taxAmount: totaux.taxe,
    // La remise affichée réunit les remises de ligne, la remise globale et la
    // part payée en points ; `loyaltyRedemptionAmount` en isole la fidélité
    // pour que le client voie que ses points ont payé, au lieu de lire une
    // remise anonyme.
    discountAmount: totaux.remiseLignes + totaux.remiseGlobale + totaux.remiseFidelite,
    globalDiscountAmount: totaux.remiseGlobale || undefined,
    loyaltyRedemptionAmount: totaux.remiseFidelite || undefined,
    total: totaux.total - totaux.remiseFidelite,
    currency: contexte.deviseFacture,
    payments: etat.reglements.map((r) => ({
      method: r.method,
      amount: Number(r.amount) || 0,
      currency: r.currency,
    })),
    changeAmount: totaux.monnaie || undefined,
    amountDue: contexte.restantDu || undefined,
    dueDate: etat.echeance ?? undefined,
    // `show` est piloté par le réglage du marchand : certains ne veulent pas
    // du bloc fidélité sur le papier. Le bloc s'imprime dès qu'un client est
    // rattaché, même sans gain : c'est justement le cumul qu'il vient lire.
    loyalty: etat.client
      ? {
          show: contexte.snapshot?.settings?.show_loyalty_points_on_receipt ?? true,
          earned: contexte.pointsGagnes ?? 0,
          used: etat.points || undefined,
          balance: contexte.pointsRestants,
        }
      : undefined,
  };
}
