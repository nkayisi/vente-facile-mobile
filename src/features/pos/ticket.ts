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
  packagingFactorOf,
  type SaleCurrencyTotals,
} from "@vente-facile/core/pos";
import { formatDateTimeFr, getPackaging, pluralizeUnit } from "@vente-facile/core";
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
  /**
   * Totaux du panier, calculés par le paquet partagé.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ SEULE `facture` S'IMPRIME. Les champs en devise PRINCIPALE ne sont là  │
   * │ que pour la monnaie rendue et la fidélité, qui se tiennent dans cette  │
   * │ devise-là.                                                             │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  totaux: {
    /** Ventilation dans la devise de FACTURE : c'est ce que le client lit. */
    facture: SaleCurrencyTotals;
    /** Remise fidélité, en devise PRINCIPALE (`point_value` y est libellé). */
    remiseFidelite: number;
    /** Monnaie rendue, dans la devise choisie pour la rendre. */
    monnaie: number;
  };
  deviseFacture: string;
  snapshot: SessionSnapshot | null;
  registerName?: string;
  warehouseName?: string;
  /**
   * Les moyens de paiement, pour NOMMER les règlements.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ `Reglement.method` EST UN IDENTIFIANT, ET IL S'IMPRIMAIT TEL QUEL.    │
   * │                                                                        │
   * │ `buildSaleReceipt` emploie `payments[].method` comme LIBELLÉ de la     │
   * │ ligne de règlement. Le client lisait donc                              │
   * │ « 3f2a9c1e-8b44-…  50,00 $ » là où il devait lire « Espèces », sur    │
   * │ tout ticket encaissé au comptoir et par les trois transports.          │
   * │                                                                        │
   * │ Le pire n'est pas l'identifiant, c'est l'ASYMÉTRIE : la réimpression   │
   * │ reconstruit le document depuis la base locale, où elle joint           │
   * │ `paymentMethods.name`. L'original portait donc un UUID et son propre   │
   * │ duplicata portait « Espèces », pour la même vente.                     │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  moyens?: { id: string; name: string }[];
  /** Points gagnés sur cette vente, tels que le serveur les accordera. */
  pointsGagnes?: number;
  pointsRestants?: number;
  aCredit: boolean;
  /** Restant dû, en devise de facture. Zéro pour une vente réglée. */
  restantDu: number;
}

/**
 * Le NOM d'un moyen de paiement, jamais son identifiant.
 *
 * Le repli reprend celui du POS web (`getMethodById(...)?.name || "Règlement"`), et
 * il n'est pas décoratif : un moyen désactivé entre la vente et la réimpression
 * laisserait sinon un libellé VIDE en face d'un montant, sur le papier du client.
 */
function nomDuMoyen(
  moyens: { id: string; name: string }[] | undefined,
  id: string
): string {
  return moyens?.find((m) => m.id === id)?.name?.trim() || "Règlement";
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
  const { facture } = totaux;

  // ┌──────────────────────────────────────────────────────────────────────────┐
  // │ CHAQUE LIGNE VIENT DE LA VENTILATION, DANS L'ORDRE.                     │
  // │                                                                          │
  // │ `lineGross(ligne)` et `ligne.unit_price` sont en devise PRINCIPALE : les │
  // │ imprimer sous l'étiquette de la facture donnait des lignes qui ne        │
  // │ sommaient pas leur propre total. `facture.lines` porte les deux valeurs  │
  // │ déjà converties ET arrondies ligne à ligne, dans l'ordre exact du        │
  // │ panier, comme le serveur les recalculera.                                │
  // └──────────────────────────────────────────────────────────────────────────┘
  const items: SaleReceiptItem[] = etat.lignes.map((ligne, i) => {
    const l = facture.lines[i];
    return {
      name: ligne.product.name,
      quantity: ligne.quantity,
      quantityLabel: libelleQuantite(ligne),
      // Le prix qui se lit sous le nom est celui du CONTENANT dès que la ligne
      // en porte un : c'est ce que le client a acheté, et le tarif de gros
      // n'est pas le prix unitaire multiplié par le contenu.
      unitPrice:
        packagingFactorOf(ligne.product) && ligne.packageQuantity > 0
          ? l.packageUnitPrice
          : l.unitPrice,
      discountPercentage: ligne.discount_percentage || undefined,
      total: l.gross,
    };
  });

  return {
    kind: contexte.aCredit ? "credit_sale" : "sale",
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
    customerPhone: etat.client?.phone ?? undefined,
    chrome: chromeDeLaSession(contexte.snapshot),
    warehouseName: contexte.warehouseName,
    items,
    subtotal: facture.subtotal,
    taxAmount: facture.tax,
    // La remise affichée réunit les remises de ligne, la remise globale et la
    // part payée en points ; `loyaltyRedemptionAmount` en isole la fidélité
    // pour que le client voie que ses points ont payé, au lieu de lire une
    // remise anonyme. Les trois sont pris dans la devise de FACTURE : la
    // ventilation y a déjà converti la remise fidélité, qui se saisit en
    // principale.
    discountAmount:
      facture.itemDiscount + facture.globalDiscount + facture.loyaltyDiscount,
    globalDiscountAmount: facture.globalDiscount || undefined,
    loyaltyRedemptionAmount: facture.loyaltyDiscount || undefined,
    total: facture.total,
    currency: facture.currency,
    payments: etat.reglements.map((r) => ({
      method: nomDuMoyen(contexte.moyens, r.method),
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
