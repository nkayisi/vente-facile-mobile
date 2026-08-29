/**
 * Relevés du tableau de bord. Miroir de `app/dashboard/page.tsx`.
 *
 * **Chaque relevé se compare à la période PRÉCÉDENTE de même longueur**, comme
 * le back-office : « ↗ 100 % vs période précédente ». Une variation sans point
 * de comparaison ne dit rien.
 */
import { and, gte, lt } from "drizzle-orm";

import { db } from "@/db/client";
import { customers, saleItems, sales } from "@/db/schema";

const nb = (v: string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export type Periode = "day" | "week" | "month" | "year";

/** Libellés du sélecteur et de la ligne de sous-titre, repris du web. */
export const LABELS_PERIODE: Record<Periode, { bouton: string; phrase: string }> = {
  day: { bouton: "Jour", phrase: "Aujourd'hui" },
  week: { bouton: "Semaine", phrase: "Cette semaine" },
  month: { bouton: "Mois", phrase: "Ce mois" },
  year: { bouton: "Année", phrase: "Cette année" },
};

/**
 * Bornes des deux périodes, RECOPIÉES du serveur.
 *
 * `apps/organizations/views.py::dashboard` les définit ainsi, et ce n'est pas
 * ce qu'on devinerait :
 *
 *   - `week` n'est PAS la semaine calendaire mais les SEPT DERNIERS JOURS
 *     (`today - 6` à `today`), et la période précédente les sept d'avant.
 *   - `month` va du 1er du mois À AUJOURD'HUI, pas à la fin du mois.
 *   - la borne haute est TOUJOURS aujourd'hui inclus, jamais le futur.
 *
 * Les recalculer « logiquement » ferait diverger le terminal du back-office sur
 * le même établissement, ce que ce lot existe précisément pour éviter.
 */
export function bornes(p: Periode): {
  debut: Date;
  fin: Date;
  debutPrecedent: Date;
  finPrecedent: Date;
} {
  const n = new Date();
  const jour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const plus = (d: Date, j: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + j);
    return r;
  };
  const aujourdhui = jour(n);
  // Borne haute exclusive : « jusqu'à aujourd'hui inclus » vaut « avant demain ».
  const fin = plus(aujourdhui, 1);

  if (p === "day") {
    return {
      debut: aujourdhui,
      fin,
      debutPrecedent: plus(aujourdhui, -1),
      finPrecedent: aujourdhui,
    };
  }
  if (p === "week") {
    return {
      debut: plus(aujourdhui, -6),
      fin,
      debutPrecedent: plus(aujourdhui, -13),
      finPrecedent: plus(aujourdhui, -6),
    };
  }
  if (p === "year") {
    const debut = new Date(aujourdhui.getFullYear(), 0, 1);
    return {
      debut,
      fin,
      debutPrecedent: new Date(aujourdhui.getFullYear() - 1, 0, 1),
      finPrecedent: debut,
    };
  }
  const debut = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1);
  return {
    debut,
    fin,
    debutPrecedent: new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() - 1, 1),
    finPrecedent: debut,
  };
}

export interface CarteReleve {
  ventes: { devise: string; montant: number }[];
  variationVentes: number;
  clients: number;
  nouveauxClients: number;
  unitesVendues: number;
  variationUnites: number;
  benefice: { devise: string; montant: number }[];
  marge: number | null;
}

/** Recopie de `calc_variation` du serveur : sans précédent, 100 % ou 0. */
function variation(courant: number, precedent: number): number {
  if (!precedent) return courant ? 100 : 0;
  return Math.round(((courant - precedent) / precedent) * 1000) / 10;
}

export async function relevesTableauDeBord(p: Periode): Promise<CarteReleve> {
  const { debut, fin, debutPrecedent, finPrecedent } = bornes(p);

  // SEULES LES VENTES TERMINEES COMPTENT, et non supprimées. Le serveur filtre
  // `status='completed', is_deleted=False`. Compter un brouillon ou une vente
  // annulée dans le chiffre d'affaires serait une contrevérité, d'autant plus
  // trompeuse qu'elle a l'air exacte.
  const toutes = await db
    .select({
      id: sales.id,
      total: sales.total,
      currency: sales.currency,
      saleDate: sales.saleDate,
      status: sales.status,
      isDeleted: sales.isDeleted,
    })
    .from(sales);

  const retenues = toutes.filter(
    (v) => v.status === "completed" && !v.isDeleted && v.saleDate
  );
  const dansPeriode = retenues.filter((v) => v.saleDate! >= debut && v.saleDate! < fin);
  const avant = retenues.filter(
    (v) => v.saleDate! >= debutPrecedent && v.saleDate! < finPrecedent
  );

  const parDevise = new Map<string, number>();
  for (const v of dansPeriode) {
    parDevise.set(v.currency ?? "", (parDevise.get(v.currency ?? "") ?? 0) + nb(v.total));
  }

  const idsPeriode = new Set(dansPeriode.map((v) => v.id));
  const idsAvant = new Set(avant.map((v) => v.id));
  const lignes = await db
    .select({
      saleId: saleItems.saleId,
      quantity: saleItems.quantity,
      costPrice: saleItems.costPrice,
    })
    .from(saleItems);

  let unites = 0;
  let unitesAvant = 0;
  let cout = 0;
  for (const l of lignes) {
    const q = nb(l.quantity);
    if (idsPeriode.has(l.saleId)) {
      unites += q;
      // Le serveur agrège `cost_price * quantity` sur les LIGNES des ventes
      // retenues, et calcule le bénéfice comme `Sum(sale.total) - ce coût`.
      cout += nb(l.costPrice) * q;
    } else if (idsAvant.has(l.saleId)) {
      unitesAvant += q;
    }
  }

  const totalPeriode = dansPeriode.reduce((s, v) => s + nb(v.total), 0);
  const totalAvant = avant.reduce((s, v) => s + nb(v.total), 0);

  const tousClients = await db
    .select({ id: customers.id, createdAt: customers.createdAt })
    .from(customers);
  const nouveaux = tousClients.filter(
    (c) => c.createdAt && c.createdAt >= debut && c.createdAt < fin
  );

  const devisePrincipale = [...parDevise.keys()][0] ?? "";
  const benefice = totalPeriode - cout;

  return {
    ventes: [...parDevise.entries()]
      .map(([devise, montant]) => ({ devise, montant }))
      .sort((a, b) => a.devise.localeCompare(b.devise)),
    variationVentes: variation(totalPeriode, totalAvant),
    clients: tousClients.length,
    nouveauxClients: nouveaux.length,
    unitesVendues: unites,
    variationUnites: variation(unites, unitesAvant),
    benefice: benefice === 0 ? [] : [{ devise: devisePrincipale, montant: benefice }],
    marge: totalPeriode > 0 ? (benefice / totalPeriode) * 100 : null,
  };
}
