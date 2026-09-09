/**
 * Libellés et tons des statuts de vente. Repris du back-office mot pour mot.
 *
 * Module PUR, et c'est le motif du déplacement : ils vivaient dans
 * `data/ventes`, qui ouvre la base SQLite au chargement. Tout module qui
 * voulait seulement NOMMER un statut - le descripteur d'export, par exemple -
 * embarquait donc une base de données, et devenait intestable hors appareil.
 */
export type TonStatut = "neutral" | "warning" | "success" | "primary" | "destructive";

export const STATUT_VENTE: Record<string, { label: string; ton: TonStatut }> = {
  draft: { label: "Brouillon", ton: "neutral" },
  pending: { label: "En attente", ton: "warning" },
  completed: { label: "Terminée", ton: "success" },
  partially_paid: { label: "Partiel", ton: "primary" },
  cancelled: { label: "Annulée", ton: "destructive" },
  refunded: { label: "Remboursée", ton: "neutral" },
};
