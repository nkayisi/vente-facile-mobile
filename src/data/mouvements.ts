/**
 * Journal des mouvements de stock.
 * Miroir de `app/dashboard/stock/movements/page.tsx`.
 *
 * **La quantité est rendue dans les termes de la SAISIE D'ORIGINE**
 * (`input_package_quantity`, `input_loose_quantity`, `packaging_factor` figé
 * sur la ligne), jamais redécoupée au conditionnement d'aujourd'hui. Un produit
 * repassé de 24 à 12 unités par casier ferait sinon diverger l'historique à
 * chaque changement de facteur : c'est le défaut que le back-office a corrigé
 * dans ses exports.
 */
import { desc, eq } from "drizzle-orm";
import { formatPackagedSplit, getPackaging, pluralizeUnit } from "@vente-facile/core";

import { db } from "@/db/client";
import { products, stockMovements, units, warehouses } from "@/db/schema";

/** Entrées et sorties, avec le libellé du back-office. */
export const TYPE_MOUVEMENT_STOCK: Record<string, { label: string; entree: boolean }> = {
  purchase: { label: "Achat", entree: true },
  sale: { label: "Vente", entree: false },
  return_in: { label: "Retour client", entree: true },
  return_out: { label: "Retour fournisseur", entree: false },
  transfer_in: { label: "Transfert entrant", entree: true },
  transfer_out: { label: "Transfert sortant", entree: false },
  adjustment_in: { label: "Ajustement positif", entree: true },
  adjustment_out: { label: "Ajustement négatif", entree: false },
  damage: { label: "Dommage/Perte", entree: false },
  expired: { label: "Périmé", entree: false },
  initial: { label: "Stock initial", entree: true },
  unpacking: { label: "Déconditionnement", entree: true },
};

export interface MouvementStock {
  id: string;
  produit: string;
  sku: string | null;
  entrepot: string | null;
  type: string;
  typeLabel: string;
  entree: boolean;
  /** « 10 cartons + 5 bouteilles », dans les termes de la saisie. */
  quantiteAffichee: string;
  date: Date | null;
}

export async function listeMouvements(limite = 100): Promise<MouvementStock[]> {
  const lignes = await db
    .select({
      id: stockMovements.id,
      movementType: stockMovements.movementType,
      quantity: stockMovements.quantity,
      inputPackageQuantity: stockMovements.inputPackageQuantity,
      inputLooseQuantity: stockMovements.inputLooseQuantity,
      packagingFactor: stockMovements.packagingFactor,
      createdAt: stockMovements.createdAt,
      produit: products.name,
      sku: products.sku,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      packagingUnitId: products.packagingUnitId,
      unite: units.name,
      entrepot: warehouses.name,
    })
    .from(stockMovements)
    .leftJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(units, eq(units.id, products.unitId))
    .leftJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limite);

  return lignes.map((m) => {
    const t = TYPE_MOUVEMENT_STOCK[m.movementType] ?? {
      label: m.movementType,
      entree: true,
    };
    const total = Math.abs(Number(m.quantity ?? 0));
    const paquets = Number(m.inputPackageQuantity ?? 0);
    const vrac = Number(m.inputLooseQuantity ?? 0);

    // Le facteur FIGÉ sur la ligne, jamais celui du produit aujourd'hui.
    const facteur = m.packagingFactor != null ? Number(m.packagingFactor) : null;
    const conditionnement =
      facteur && facteur >= 2
        ? getPackaging({
            selling_mode: m.sellingMode,
            units_per_package: facteur,
            unit_name: m.unite,
          })
        : null;

    const quantiteAffichee =
      conditionnement && (paquets > 0 || vrac > 0)
        ? formatPackagedSplit(conditionnement, paquets, vrac)
        : `${total} ${pluralizeUnit(m.unite ?? "unité", total)}`;

    return {
      id: m.id,
      produit: m.produit ?? "Produit supprimé",
      sku: m.sku ?? null,
      entrepot: m.entrepot ?? null,
      type: m.movementType,
      typeLabel: t.label,
      entree: t.entree,
      quantiteAffichee,
      date: m.createdAt ?? null,
    };
  });
}
