/**
 * Réimprimer le ticket d'une vente, y compris une vente que ce terminal n'a
 * pas encaissée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE NUMÉRO NE CHANGE JAMAIS. Un duplicata porte le numéro de l'original,  │
 * │ et se distingue par sa PASTILLE, pas par un second numéro.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Deux chemins, et le second est ce que ce lot ajoute :
 *
 * 1. La vente a été encaissée ICI : son document est déjà rangé dans
 *    `print_jobs` avec les données du comptoir. On le rejoue tel quel, et le
 *    compteur de duplicata fait son travail.
 *
 * 2. La vente vient d'AILLEURS - un autre terminal, le back-office - et est
 *    descendue par le tirage. Rien n'est rangé localement, mais tout est en
 *    base : on décrit le document depuis la vente tirée. Il sort marqué
 *    DUPLICATA dès la première fois si le serveur dit que le ticket est déjà
 *    sorti, faute de quoi deux papiers indiscernables circuleraient pour une
 *    seule vente.
 *
 * Rien n'est recalculé : chaque montant est celui que la facture porte.
 */
import { formatDateTimeFr } from "@vente-facile/core";
import type { SaleReceiptData } from "@vente-facile/core/receipt";

import type { DetailVente } from "@/data/vente-detail";
import { chromeDeLaSession } from "@/features/pos/ticket";
import {
  documentParNumero,
  enregistrerEtImprimer,
  imprimerDocument,
} from "@/printing/jobs";
import type { SessionSnapshot } from "@/session/types";

/** Décrit le ticket d'une vente tirée, dans le vocabulaire des documents. */
export function ticketDepuisVente(
  vente: DetailVente,
  snapshot: SessionSnapshot | null
): SaleReceiptData {
  return {
    // Une facture qui reste due est une VENTE À CRÉDIT, et son bandeau le dit.
    // Le web avait mis longtemps à le distinguer : rien ne séparait les deux
    // dans une liasse.
    kind: vente.resteAPayer > 0 ? "credit_sale" : "sale",
    number: vente.reference,
    date: formatDateTimeFr(vente.date ?? new Date()),
    chrome: chromeDeLaSession(snapshot),
    registerName: vente.caisse ?? undefined,
    warehouseName: vente.entrepot ?? undefined,
    customerName: vente.client?.nom,
    customerPhone: vente.client?.telephone ?? undefined,
    items: vente.lignes.map((l) => ({
      name: l.produit,
      quantity: l.quantiteTotale,
      // Le partage LU sur la ligne, jamais redécoupé au facteur d'aujourd'hui.
      // Même condition que l'écran : sans contenant facturé, « 3 PIECES » ne
      // dit rien de plus que la quantité, et le ticket la porte déjà.
      quantityLabel: l.contenants > 0 ? l.quantiteAffichee : undefined,
      unitPrice: l.prixUnitaire,
      discountPercentage: l.remisePourcent || undefined,
      total: l.total,
    })),
    subtotal: vente.sousTotal,
    taxAmount: vente.taxes,
    // `discountAmount` du document englobe la part fidélité, comme le champ du
    // serveur : c'est `buildSaleReceipt` qui les sépare à l'affichage.
    discountAmount: vente.remiseCommerciale + vente.remiseFidelite,
    loyaltyRedemptionAmount: vente.remiseFidelite || undefined,
    total: vente.total,
    currency: vente.devise,
    payments: vente.reglements.map((p) => ({
      method: p.methode,
      amount: p.montant,
      currency: vente.devise,
    })),
    changeAmount: vente.monnaieRendue || undefined,
    amountDue: vente.resteAPayer || undefined,
    dueDate: vente.echeance ? formatDateTimeFr(vente.echeance) : undefined,
  };
}

/** Imprime, ou réimprime, le ticket de cette vente. Rend le transport utilisé. */
export async function imprimerTicketVente(
  vente: DetailVente,
  snapshot: SessionSnapshot | null
): Promise<string> {
  const range = await documentParNumero(vente.reference);
  if (range) return imprimerDocument(range.id);

  const { transport } = await enregistrerEtImprimer({
    kind: "sale",
    documentNumber: vente.reference,
    label: vente.client?.nom ?? `Vente ${vente.reference}`,
    donnees: ticketDepuisVente(vente, snapshot),
    dejaImprime: vente.ticketImprime,
  });
  return transport;
}
