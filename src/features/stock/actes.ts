/**
 * Les actes d'écriture sur le stock : déconditionner, transférer, ajuster.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE TRANSITION REFUSÉE NE SE RÉESSAIE JAMAIS.                           │
 * │                                                                          │
 * │ Expédier un transfert déjà expédié le réexpédierait, et le stock         │
 * │ sortirait deux fois. Le serveur rend donc un verdict `rejected` sur ces  │
 * │ refus, pas `retry` : l'opération part en quarantaine, dans « Opérations  │
 * │ à corriger », et le magasinier voit pourquoi.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Comme partout : **on n'écrit RIEN dans les tables tirées.** Ni le nouveau
 * statut du transfert, ni la quantité en rayon. Une expédition écrite
 * localement puis refusée laisserait un stock amputé que rien ne rétablirait.
 */
import * as Crypto from "expo-crypto";

import { enAttenteParType, enqueue } from "@/sync";

/** Une ligne de transfert, telle que le magasinier la saisit. */
export interface LigneSaisie {
  produit: string;
  /** Total en unité de détail. C'est ce que le serializer attend. */
  quantite: number;
  /** Contenants scellés, quand la saisie s'est faite en gros. */
  contenants?: number;
  /** Unités isolées. */
  vrac?: number;
}

function corpsLigne(l: LigneSaisie) {
  return {
    product: l.produit,
    quantity_requested: String(l.quantite),
    ...(l.contenants != null ? { package_quantity: String(l.contenants) } : {}),
    ...(l.vrac != null ? { loose_quantity: String(l.vrac) } : {}),
  };
}

export async function creerTransfert(saisie: {
  source: string;
  destination: string;
  lignes: LigneSaisie[];
  notes?: string;
}): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "stock_transfer.create", {
    id,
    source_warehouse: saisie.source,
    destination_warehouse: saisie.destination,
    notes: saisie.notes ?? "",
    items: saisie.lignes.map(corpsLigne),
  });
  return id;
}

export type TransitionTransfert = "approve" | "ship" | "receive" | "cancel";

/**
 * Fait avancer un transfert d'un cran.
 *
 * `lignesRecues` ne sert qu'à la réception, et porte ce que le magasinier a
 * RÉELLEMENT compté : une réception partielle est le cas courant, et retenir
 * la quantité expédiée ferait entrer en stock des articles restés sur le quai.
 */
export async function transitionTransfert(
  transfertId: string,
  transition: TransitionTransfert,
  lignesRecues?: { ligne: string; contenants?: number; vrac?: number; total?: number }[]
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, `stock_transfer.${transition}` as never, {
    id,
    transfer: transfertId,
    ...(transition === "receive" && lignesRecues
      ? {
          items: lignesRecues.map((l) => ({
            id: l.ligne,
            ...(l.contenants != null ? { package_quantity: String(l.contenants) } : {}),
            ...(l.vrac != null ? { loose_quantity: String(l.vrac) } : {}),
            ...(l.total != null ? { quantity_received: String(l.total) } : {}),
          })),
        }
      : {}),
  });
  return id;
}

export async function creerAjustement(saisie: {
  entrepot: string;
  type: string;
  motif: string;
  lignes: {
    produit: string;
    attendu: number;
    compte: number;
    contenantsComptes?: number;
    vracCompte?: number;
  }[];
}): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "stock_adjustment.create", {
    id,
    warehouse: saisie.entrepot,
    adjustment_type: saisie.type,
    reason: saisie.motif,
    items: saisie.lignes.map((l) => ({
      product: l.produit,
      quantity_expected: String(l.attendu),
      quantity_counted: String(l.compte),
      ...(l.contenantsComptes != null
        ? { counted_package_quantity: String(l.contenantsComptes) }
        : {}),
      ...(l.vracCompte != null
        ? { counted_loose_quantity: String(l.vracCompte) }
        : {}),
    })),
  });
  return id;
}

export async function transitionAjustement(
  ajustementId: string,
  transition: "approve" | "reject"
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, `stock_adjustment.${transition}` as never, {
    id,
    adjustment: ajustementId,
  });
  return id;
}

/**
 * Ouvre des conditionnements scellés.
 *
 * Geste de comptoir : le vendeur qui anticipe, ou le produit dont le
 * déconditionnement automatique est désactivé. Il doit marcher hors ligne.
 */
export async function deconditionner(
  stockId: string,
  contenants: number
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "stock.unpack", { id, stock: stockId, packages: contenants });
  return id;
}

/** Ce que le journal retient pour ces objets, tant que le serveur n'a pas parlé. */
export async function enAttenteSurStock(): Promise<{
  transferts: Set<string>;
  ajustements: Set<string>;
  deconditionnements: Set<string>;
}> {
  const [creations, transitions, ajCreations, ajTransitions, unpacks] =
    await Promise.all([
      enAttenteParType<{ id: string }>("stock_transfer.create"),
      Promise.all(
        (["approve", "ship", "receive", "cancel"] as const).map((t) =>
          enAttenteParType<{ transfer: string }>(`stock_transfer.${t}`)
        )
      ),
      enAttenteParType<{ id: string }>("stock_adjustment.create"),
      Promise.all(
        (["approve", "reject"] as const).map((t) =>
          enAttenteParType<{ adjustment: string }>(`stock_adjustment.${t}`)
        )
      ),
      enAttenteParType<{ stock: string }>("stock.unpack"),
    ]);

  return {
    transferts: new Set([
      ...creations.map((o) => o.payload.id),
      ...transitions.flat().map((o) => o.payload.transfer),
    ]),
    ajustements: new Set([
      ...ajCreations.map((o) => o.payload.id),
      ...ajTransitions.flat().map((o) => o.payload.adjustment),
    ]),
    deconditionnements: new Set(unpacks.map((o) => o.payload.stock)),
  };
}

/**
 * Entrée ou sortie de stock saisie à la main.
 *
 * **La saisie peut être en CONTENANTS, en unités, ou les deux à la fois**, et
 * la conversion est faite par le serializer du serveur, pas ici. Un
 * `quantity = paquets * facteur + vrac` calculé côté terminal serait une
 * seconde arithmétique du conditionnement, à tenir en phase avec celle du
 * serveur - exactement ce que `@vente-facile/core` existe pour éviter.
 */
export interface SaisieMouvement {
  produit: string;
  entrepot: string;
  type: string;
  /** Total en unité de détail. Facultatif dès qu'un contenant est saisi. */
  quantite?: number;
  contenants?: number;
  vrac?: number;
  coutUnitaire?: number;
  coutContenant?: number;
  notes?: string;
}

export async function creerMouvement(saisie: SaisieMouvement): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "stock_movement.create", {
    id,
    product: saisie.produit,
    warehouse: saisie.entrepot,
    movement_type: saisie.type,
    ...(saisie.quantite != null ? { quantity: String(saisie.quantite) } : {}),
    ...(saisie.contenants != null ? { package_quantity: String(saisie.contenants) } : {}),
    ...(saisie.vrac != null ? { loose_quantity: String(saisie.vrac) } : {}),
    ...(saisie.coutUnitaire != null ? { unit_cost: String(saisie.coutUnitaire) } : {}),
    ...(saisie.coutContenant != null
      ? { package_unit_cost: String(saisie.coutContenant) }
      : {}),
    notes: saisie.notes ?? "",
  });
  return id;
}
