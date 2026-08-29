/**
 * Devises : la devise d'affichage par défaut, et les aides de conversion.
 *
 * **`formatPrice` de `@vente-facile/core` écrit dans une devise par défaut, qui
 * doit être posée au démarrage.** Sans cet appel, tout montant sort en francs
 * congolais quelle que soit la devise de l'établissement : le tableau de bord
 * d'une boutique qui compte en dollars affichait « 2 300 832,86 FC » là où le
 * back-office écrit « 2 300 832,86 $ ». Défaut relevé en comparant l'écran à
 * son miroir web, invisible autrement.
 */
import { useEffect } from "react";
import {
  createMoneyHelpers,
  setDefaultCurrency,
  type MoneyHelpers,
  type OrganizationCurrency,
} from "@vente-facile/core";
import { useMemo } from "react";

import { useSession } from "@/session/provider";

/** Devise principale de l'établissement, ou un repli honnête. */
function principale(devises: OrganizationCurrency[]): OrganizationCurrency | null {
  return devises.find((d) => d.is_primary) ?? devises[0] ?? null;
}

/**
 * Pose la devise d'affichage. À monter UNE FOIS, au-dessus des écrans.
 *
 * Le repli est le franc congolais : c'est la devise par défaut du produit, et
 * un repli muet vaut mieux qu'un montant sans symbole.
 */
export function useDeviseParDefaut(): void {
  const { snapshot } = useSession();
  const p = principale(snapshot?.currencies ?? []);

  useEffect(() => {
    if (!p) return;
    setDefaultCurrency(p.currency_symbol, p.currency_decimal_places, p.currency_code);
  }, [p?.currency_symbol, p?.currency_decimal_places, p?.currency_code]);
}

/**
 * Aides monétaires multi-devises.
 *
 * Le même appel que `PanierProvider` fait pour le comptoir : à exposer une fois
 * plutôt qu'à refaire par écran.
 */
export function useMonnaie(): MoneyHelpers {
  const { snapshot } = useSession();
  const devises = snapshot?.currencies ?? [];
  return useMemo(() => {
    const p = principale(devises);
    // Le repli sert les montants dont la devise est inconnue (données
    // historiques). Il prend la devise principale de l'établissement, et non
    // une valeur figée : `decimal_places: 2` en dur ferait sortir « 12 500,00 »
    // pour un franc congolais, qui n'a pas de décimales.
    return createMoneyHelpers(devises, {
      code: p?.currency_code ?? "CDF",
      name: p?.currency_name ?? "Franc congolais",
      symbol: p?.currency_symbol ?? "FC",
      decimal_places: p?.currency_decimal_places ?? 0,
    });
  }, [devises]);
}
