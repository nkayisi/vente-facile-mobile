/**
 * Le rapport financier VENTILÉ par entrepôt, caisse comprise.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES HUIT ONGLETS SE FILTRENT PAR DÉPÔT ; AUCUN N'EN REND PLUSIEURS.     │
 * │                                                                          │
 * │ Comparer deux boutiques demandait de changer le filtre, de relever les  │
 * │ chiffres à la main et de les additionner soi-même - avec le risque      │
 * │ d'additionner deux devises. C'est T6 du retour de test.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ IL EXIGE LE RÉSEAU, comme les huit onglets et pour la même raison : ses
 * agrégats viennent du serveur, dont les définitions sont subtiles (périmètre
 * par rôle, caisse DÉRIVÉE par trois chemins, conversions au taux figé). Les
 * recalculer ici donnerait deux chiffres pour le même établissement.
 *
 * ⚠ AUCUN PÉRIMÈTRE VOLONTAIRE N'EST ENVOYÉ, et son absence est le propos : la
 * rubrique REND une ligne par dépôt. Envoyer `warehouse=` reviendrait à n'en
 * regarder qu'un, c'est-à-dire ce qu'on vient de remplacer. Le périmètre du
 * RÔLE, lui, s'applique toujours - c'est le serveur qui borne.
 */
import { api } from "@/api/client";

import { deviseOuPrincipale } from "./devise-principale";
import { CHEMIN_RAPPORT_ENTREPOTS } from "./rapports";

export interface LigneEntrepot {
  id: string;
  nom: string;
  code: string;
  ventes: number;
  nbVentes: number;
  depenses: number;
  caisseEntrees: number;
  caisseSorties: number;
  caisseNette: number;
  valeurStock: number;
  resultat: number;
}

export interface RapportEntrepots {
  devise: string;
  debut: string;
  fin: string;
  lignes: LigneEntrepot[];
  total: Omit<LigneEntrepot, "id" | "nom" | "code">;
  /**
   * Ce que le total porte et qu'aucune ligne ne porte.
   *
   * ⚠ IL SE DIT, jamais ne se tait : une vente sans entrepôt, une charge
   * d'établissement, un apport sans tiroir n'entrent dans aucune ligne. Sans
   * cette valeur, le lecteur refait l'addition et conclut à une erreur.
   */
  horsEntrepot: number;
}

const nb = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function ligne(r: Record<string, unknown>): LigneEntrepot {
  return {
    id: String(r.warehouse_id ?? ""),
    nom: String(r.warehouse_name ?? ""),
    code: String(r.warehouse_code ?? ""),
    ventes: nb(r.sales_total),
    nbVentes: nb(r.sales_count),
    depenses: nb(r.expenses_total),
    caisseEntrees: nb(r.cash_in),
    caisseSorties: nb(r.cash_out),
    caisseNette: nb(r.cash_net),
    valeurStock: nb(r.stock_value),
    resultat: nb(r.result),
  };
}

export async function chargerRapportEntrepots(ctx: {
  organisation: string;
  debut: string;
  fin: string;
}): Promise<RapportEntrepots> {
  const q = new URLSearchParams({ date_from: ctx.debut, date_to: ctx.fin });
  const d = await api.get<Record<string, unknown>>(
    `/reports/statistics/${CHEMIN_RAPPORT_ENTREPOTS}/?${q.toString()}`,
    { headers: { "X-Organization-ID": ctx.organisation } }
  );

  const brutes = Array.isArray(d.warehouses) ? (d.warehouses as Record<string, unknown>[]) : [];
  const lignes = brutes.map(ligne);
  const t = (d.total ?? {}) as Record<string, unknown>;
  const periode = (d.period ?? {}) as Record<string, unknown>;

  const totalVentes = nb(t.sales_total);
  const sommeLignes = lignes.reduce((s, l) => s + l.ventes, 0);

  return {
    // ⚠ JAMAIS `String(x ?? "")` : une devise vide rend un montant SANS
    // symbole, en silence, dans une application où le même chiffre vaut soit
    // trois dollars soit trois francs. Le serveur nomme toujours sa devise ;
    // le repli est la principale de l'établissement, jamais le vide.
    devise: deviseOuPrincipale(
      typeof d.currency === "string" ? d.currency : null
    ),
    debut: String(periode.start ?? ctx.debut),
    fin: String(periode.end ?? ctx.fin),
    lignes,
    total: {
      ventes: totalVentes,
      nbVentes: nb(t.sales_count),
      depenses: nb(t.expenses_total),
      caisseEntrees: nb(t.cash_in),
      caisseSorties: nb(t.cash_out),
      caisseNette: nb(t.cash_net),
      valeurStock: nb(t.stock_value),
      resultat: nb(t.result),
    },
    horsEntrepot: totalVentes - sommeLignes,
  };
}
