/**
 * L'état du panier, partagé par les trois écrans du comptoir.
 *
 * Le POS web tient tout dans une seule page de 3 300 lignes ; sur un téléphone
 * il faut trois écrans (grille, panier, encaissement), et un panier qui vivrait
 * dans l'un d'eux disparaîtrait en passant au suivant. D'où ce contexte.
 *
 * Il ne calcule RIEN lui-même. Chaque montant vient de `@vente-facile/core/pos`,
 * le même code que le back-office appelle. C'est la seule garantie que les deux
 * surfaces facturent le même centime, et elle ne tient que si personne ne
 * recalcule « juste ce petit total » sur place.
 */
import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";

import {
  basketTotals,
  createCurrencyTable,
  evaluateCredit,
  loyaltyDiscount,
  maxGlobalDiscount,
  maxUsablePoints,
  minPointsToRedeem,
  tendersIn,
  totalInSaleCurrency,
  verifierAjout,
  MONEY_EPS,
  type BasketLine,
  type CreditVerdict,
  type CurrencyTable,
  type Saisie,
} from "@vente-facile/core/pos";

import { useSession } from "@/session/provider";
import {
  PANIER_VIDE,
  reducteurPanier,
  type ActionPanier,
  type ClientPos,
  type EtatPanier,
  type LignePanier,
} from "./etat-panier";

export type { ActionPanier, ClientPos, EtatPanier, LignePanier, Reglement } from "./etat-panier";
import type { ArticlePos } from "./catalogue";

export interface Totaux {
  /** En devise principale. */
  sousTotal: number;
  remiseLignes: number;
  remiseGlobale: number;
  remiseGlobaleMax: number;
  taxe: number;
  /** Total BRUT, avant points. */
  total: number;
  remiseFidelite: number;
  /** Ce que le client doit, points déduits, en devise principale. */
  net: number;

  /** En devise de facture. */
  totalFacture: number;
  payeFacture: number;
  restantFacture: number;
  monnaie: number;

  pointsMax: number;
  pointsMinimum: number;
  credit: CreditVerdict | null;
  /** Le règlement couvre-t-il la facture ? */
  solde: boolean;
}

interface ValeurPanier {
  etat: EtatPanier;
  devises: CurrencyTable;
  deviseFacture: string;
  deviseMonnaie: string;
  totaux: Totaux;
  /** Formate un montant dans une devise, décimales comprises. */
  argent: (montant: number, code?: string) => string;
  /** Refus éventuel d'un ajout, en français, sans modifier l'état. */
  verifier: (article: ArticlePos, saisie: Saisie) => string | null;
  envoyer: (action: ActionPanier) => void;
}

const Contexte = createContext<ValeurPanier | null>(null);

export function PanierProvider({ children }: { children: ReactNode }) {
  const { snapshot } = useSession();
  const [etat, envoyer] = useReducer(reducteurPanier, PANIER_VIDE);

  const devises = useMemo(
    () =>
      createCurrencyTable(snapshot?.currencies ?? [], {
        code: snapshot?.organization.currency ?? "CDF",
        decimal_places: 2,
      }),
    [snapshot]
  );

  const deviseFacture = etat.deviseFacture ?? devises.primary;
  const deviseMonnaie = etat.deviseMonnaie ?? deviseFacture;
  const programme = snapshot?.loyalty_program ?? null;

  const totaux = useMemo<Totaux>(() => {
    const brut = basketTotals({
      lines: etat.lignes,
      globalDiscountAmount: etat.remiseGlobale,
    });
    const remiseFidelite = loyaltyDiscount(brut.total, etat.points, programme);
    const totalFacture = totalInSaleCurrency({
      lines: etat.lignes,
      currencies: devises,
      invoiceCurrency: deviseFacture,
      globalDiscountAmount: etat.remiseGlobale,
      loyaltyDiscount: remiseFidelite,
    });
    const payeFacture = tendersIn(etat.reglements, devises, deviseFacture);
    const excedent = payeFacture - totalFacture;

    return {
      sousTotal: brut.subtotal,
      remiseLignes: brut.itemDiscount,
      remiseGlobale: brut.globalDiscount,
      remiseGlobaleMax: maxGlobalDiscount(etat.lignes),
      taxe: brut.tax,
      total: brut.total,
      remiseFidelite,
      net: brut.total - remiseFidelite,
      totalFacture,
      payeFacture,
      restantFacture: Math.max(0, devises.round(-excedent, deviseFacture)),
      monnaie:
        excedent > MONEY_EPS
          ? devises.convertMoney(excedent, deviseFacture, deviseMonnaie)
          : 0,
      pointsMax: maxUsablePoints(brut.total, 0, programme),
      pointsMinimum: minPointsToRedeem(programme),
      credit: evaluateCredit(
        etat.client,
        brut.total - remiseFidelite,
        tendersIn(etat.reglements, devises, devises.primary),
        (montant) => devises.money(montant, devises.primary)
      ),
      solde: excedent >= -MONEY_EPS,
    };
  }, [etat, devises, deviseFacture, deviseMonnaie, programme]);

  const valeur = useMemo<ValeurPanier>(
    () => ({
      etat,
      devises,
      deviseFacture,
      deviseMonnaie,
      totaux,
      argent: (montant, code) => devises.money(montant, code ?? deviseFacture),
      verifier: (article, saisie) => verifierAjout(article, etat.lignes, saisie).raison,
      envoyer,
    }),
    [etat, devises, deviseFacture, deviseMonnaie, totaux]
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function usePanier(): ValeurPanier {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error("usePanier hors de PanierProvider");
  return valeur;
}
