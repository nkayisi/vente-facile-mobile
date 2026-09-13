/**
 * La facture proforma, décrite depuis le panier.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE DOCUMENT N'EST PAS UN REÇU, ET IL LE DIT LUI-MÊME.                   │
 * │                                                                          │
 * │ Il sort quand le panier porte un article que le stock ne couvre pas :    │
 * │ l'encaissement est alors fermé, mais le client ne doit pas repartir les  │
 * │ mains vides. `buildSaleReceipt` connaît déjà ce genre - bandeau          │
 * │ « FACTURE PROFORMA », mention « Sans valeur comptable, non fiscale »,    │
 * │ total étiqueté « Total estimatif », blocs de règlement, de dette et de   │
 * │ fidélité supprimés, pied réduit à l'organisation.                        │
 * │                                                                          │
 * │ IL N'EST PAS RANGÉ DANS `print_jobs`. Cette table porte des documents à  │
 * │ numéro définitif et à valeur probante, dont la réimpression sort marquée │
 * │ DUPLICATA et dont `detteEnAttente` lit les montants pour reconstituer le │
 * │ crédit d'un client. Une proforma n'est rien de cela, et l'y ranger la    │
 * │ ferait entrer dans des lectures qui ne la concernent pas. Le web n'en    │
 * │ garde rien non plus. On la réimprime en la RÉGÉNÉRANT : le panier reste  │
 * │ en place après impression, précisément pour cela.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * RIEN N'EST RECALCULÉ ICI, comme dans `ticket.ts` : ce module réétiquette.
 */
import { packagingFactorOf, type SaleCurrencyTotals } from "@vente-facile/core/pos";
import { formatDateTimeFr } from "@vente-facile/core";
import type { SaleReceiptData, SaleReceiptItem } from "@vente-facile/core/receipt";

import type { SessionSnapshot } from "@/session/types";

import type { EtatPanier } from "./etat-panier";
import { chromeDeLaSession, libelleQuantite } from "./ticket";

export interface ContexteProforma {
  reference: string;
  date: Date;
  etat: EtatPanier;
  /**
   * Ventilation en devise de FACTURE, points NON déduits.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE TOTAL EST BRUT, ET C'EST UNE RÈGLE, PAS UN OUBLI.                  │
   * │                                                                        │
   * │ Une proforma ne réserve aucun point, et le document supprime son bloc  │
   * │ fidélité. Y porter le total NET annoncerait une remise que les lignes  │
   * │ ne montrent pas : un devis qui ne s'additionne pas, sous les yeux d'un │
   * │ client qui vérifie. L'appelant passe donc une ventilation calculée     │
   * │ avec `loyaltyDiscount: 0`.                                             │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  factureBrute: SaleCurrencyTotals;
  snapshot: SessionSnapshot | null;
  registerName?: string;
  warehouseName?: string;
}

export function donneesProforma(contexte: ContexteProforma): SaleReceiptData {
  const { etat, factureBrute } = contexte;

  const items: SaleReceiptItem[] = etat.lignes.map((ligne, i) => {
    const l = factureBrute.lines[i];
    return {
      name: ligne.product.name,
      quantity: ligne.quantity,
      quantityLabel: libelleQuantite(ligne),
      // Le prix lu sous le nom est celui du CONTENANT dès que la ligne en
      // porte un : c'est ce que le client demande, et le tarif de gros n'est
      // pas le prix unitaire multiplié par le contenu.
      unitPrice:
        packagingFactorOf(ligne.product) && ligne.packageQuantity > 0
          ? l.packageUnitPrice
          : l.unitPrice,
      discountPercentage: ligne.discount_percentage || undefined,
      total: l.gross,
    };
  });

  return {
    kind: "proforma",
    number: contexte.reference,
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UNE DATE LISIBLE, PAS UN HORODATAGE MACHINE.                        │
    // │                                                                      │
    // │ `toISOString()` imprimait « 2026-09-11T10:00:00.000Z » sur le papier │
    // │ du client - en UTC, donc daté de la VEILLE pour toute vente faite    │
    // │ après 23 h à Kinshasa. Et la RÉIMPRESSION du même ticket, elle,      │
    // │ passait déjà par `formatDateTimeFr` : l'original et son duplicata ne │
    // │ portaient pas la même date, pour la même vente.                      │
    // │                                                                      │
    // │ Même helper que `reimpression.ts`, et surtout pas `Intl` : Hermes    │
    // │ n'embarque pas l'ICU complète et se replie sur l'anglais SANS lever. │
    // └──────────────────────────────────────────────────────────────────────┘
    date: formatDateTimeFr(contexte.date),
    cashierName: contexte.snapshot?.user.full_name,
    registerName: contexte.registerName,
    customerName: etat.client?.name,
    chrome: chromeDeLaSession(contexte.snapshot),
    warehouseName: contexte.warehouseName,
    items,
    subtotal: factureBrute.subtotal,
    taxAmount: factureBrute.tax,
    // La fidélité n'entre pas : elle ne sera accordée qu'à l'encaissement, et
    // le document n'a pas de bloc pour l'expliquer.
    discountAmount: factureBrute.itemDiscount + factureBrute.globalDiscount,
    globalDiscountAmount: factureBrute.globalDiscount || undefined,
    total: factureBrute.total,
    currency: factureBrute.currency,
    // Aucun règlement : rien n'a été encaissé, et le document supprime de toute
    // façon son bloc de règlement.
    payments: [],
  };
}
