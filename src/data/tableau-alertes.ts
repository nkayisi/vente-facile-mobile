/**
 * Alertes du tableau de bord.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUT EST CALCULÉ LOCALEMENT, sur les tables tirées : le tableau de bord  │
 * │ doit s'ouvrir hors ligne. Les définitions suivent celles du SERVEUR      │
 * │ (`notifications/tasks.py`, `organizations/views.py::dashboard`) - s'en   │
 * │ écarter ferait diverger le terminal du back-office sur le même           │
 * │ établissement, et le marchand n'aurait aucun moyen de savoir lequel a    │
 * │ raison.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { formatPackagedSplit, getPackaging, pluralizeUnit } from "@vente-facile/core";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/db/client";
import {
  customers,
  products,
  sales,
  stocks,
  units,
} from "@/db/schema";

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export type GenreAlerte = "stock_bas" | "rupture" | "facture_due" | "credit";

export interface Alerte {
  id: string;
  genre: GenreAlerte;
  titre: string;
  detail: string;
  /** Route à ouvrir. Une alerte qui ne mène nulle part ne sert à rien. */
  cible: string | null;
}

/**
 * Les alertes que le terminal sait produire seul.
 *
 * `stock_bas` reprend le critère de `check_low_stock_alerts` : quantité au
 * seuil de réassort ou en dessous. `facture_due` reprend celui de
 * `check_customer_payment_due` : échéance dépassée, facture encore due.
 */
export async function alertes(limite = 12): Promise<Alerte[]> {
  const uniteDetail = alias(units, "unite_detail");
  const uniteContenant = alias(units, "unite_contenant");

  const lignesStock = await db
    .select({
      id: stocks.id,
      quantity: stocks.quantity,
      packageQuantity: stocks.packageQuantity,
      looseQuantity: stocks.looseQuantity,
      reserved: stocks.reservedQuantity,
      produit: products.name,
      reorderPoint: products.reorderPoint,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      unite: uniteDetail.name,
      uniteContenant: uniteContenant.name,
    })
    .from(stocks)
    .innerJoin(products, eq(products.id, stocks.productId))
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .where(eq(products.trackInventory, true));

  const sorties: Alerte[] = [];

  for (const l of lignesStock) {
    const total = nb(l.quantity);
    const seuil = Number(l.reorderPoint ?? 0);
    if (total > 0 && (seuil <= 0 || total > seuil)) continue;

    const cond =
      l.unitsPerPackage && l.unitsPerPackage > 1
        ? getPackaging({
            selling_mode: l.sellingMode,
            units_per_package: l.unitsPerPackage,
            unit_name: l.unite,
            packaging_unit_name: l.uniteContenant,
          })
        : null;

    // La ventilation n'est rendue que si RIEN n'est réservé : le total qui
    // déclenche l'alerte est un disponible, mais les compteurs portent la
    // quantité brute. Les présenter ensemble laisserait croire que tous les
    // contenants sont libres. C'est la règle des alertes Celery, mot pour mot.
    const rendu =
      cond && nb(l.reserved) === 0
        ? formatPackagedSplit(cond, nb(l.packageQuantity), nb(l.looseQuantity))
        : `${total} ${pluralizeUnit(l.unite ?? "unité", total)}`;

    sorties.push({
      id: `stock-${l.id}`,
      genre: total <= 0 ? "rupture" : "stock_bas",
      titre: l.produit,
      detail:
        total <= 0
          ? "En rupture"
          : `Il reste ${rendu}, seuil à ${seuil}`,
      cible: `/rayon/${l.id}`,
    });
  }

  const maintenant = new Date();
  const facturesEnRetard = await db
    .select({
      id: sales.id,
      reference: sales.reference,
      amountDue: sales.amountDue,
      currency: sales.currency,
      dueDate: sales.dueDate,
      client: customers.name,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(
      and(
        inArray(sales.status, ["pending", "partially_paid"]),
        sql`cast(${sales.amountDue} as real) > 0`,
        lt(sales.dueDate, maintenant)
      )
    )
    .orderBy(sales.dueDate)
    .limit(limite);

  for (const f of facturesEnRetard) {
    const jours = f.dueDate
      ? Math.floor((maintenant.getTime() - f.dueDate.getTime()) / 86400000)
      : 0;
    sorties.push({
      id: `facture-${f.id}`,
      genre: "facture_due",
      titre: f.client ?? "Client anonyme",
      detail: `${f.reference} en retard de ${jours} j`,
      cible: `/vente/${f.id}`,
    });
  }

  // Les ruptures d'abord : c'est ce qui fait perdre une vente aujourd'hui.
  const ordre: Record<GenreAlerte, number> = {
    rupture: 0,
    facture_due: 1,
    stock_bas: 2,
    credit: 3,
  };
  return sorties.sort((a, b) => ordre[a.genre] - ordre[b.genre]).slice(0, limite);
}
