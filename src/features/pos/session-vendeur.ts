/**
 * Sur quelle session de caisse un vendeur a le droit d'encaisser.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE COMPTOIR D'UN CAISSIER S'OUVRAIT SUR LA SESSION D'UN AUTRE.          │
 * │                                                                          │
 * │ `sessionOuverte` prenait la première session ouverte de la table tirée,  │
 * │ sans regarder qui l'avait ouverte. Or le serveur refuse au caissier une  │
 * │ vente sur la session d'un autre (`SaleCreateSerializer`, « Cette session │
 * │ a été ouverte par un autre utilisateur »), et le refus est DÉTERMINISTE. │
 * │                                                                          │
 * │ Relevé sur l'émulateur le 2026-11-14, pas déduit : un caissier fraîchement│
 * │ enrôlé arrive au comptoir sur la session que le propriétaire avait       │
 * │ ouverte, encaisse, imprime son ticket - et la vente revient `rejected`,  │
 * │ client parti. C'est très exactement la classe de défaut que ce terminal  │
 * │ existe pour fermer : un refus après impression.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Miroir de `is_manager_or_above` (`apps/core/api_permissions.py`) : la règle
 * suit le RÔLE, pas une permission. Le propriétaire et le gérant encaissent sur
 * n'importe quelle session ; le caissier et le magasinier sur la leur seulement.
 *
 * ⚠ La CLÔTURE ne suit pas cette règle : tout membre qui a accès à l'entrepôt de
 * la caisse peut fermer une session, y compris celle d'un autre (un caissier
 * parti sans tirer son Z ne doit pas bloquer la fermeture du magasin). Ce module
 * ne parle que de VENDRE.
 *
 * Module PUR : `caisse.ts` ouvre la base au chargement, et une règle écrite
 * là-bas ne serait pas éprouvable sans appareil.
 */

export type RoleVendeur = "owner" | "manager" | "stock_keeper" | "cashier" | null;

export interface Vendeur {
  id: string;
  role: RoleVendeur;
}

/** Rôles qui encaissent sur la session d'un autre. Miroir de `is_manager_or_above`. */
const SUR_TOUTE_SESSION: ReadonlySet<RoleVendeur> = new Set(["owner", "manager"]);

/**
 * Ce vendeur peut-il encaisser sur une session ouverte par `ouvertePar` ?
 *
 * `vendeur` inconnu (aucun instantané de session) : on ne filtre pas. Le groupe
 * `(app)` n'est monté qu'avec une session prête, donc ce cas ne se présente pas
 * au comptoir ; le traiter comme un refus fermerait la caisse d'un terminal dont
 * l'instantané serait momentanément illisible, pour une règle que le serveur
 * tient de toute façon.
 */
export function peutVendreSur(ouvertePar: string, vendeur: Vendeur | null): boolean {
  if (!vendeur) return true;
  return SUR_TOUTE_SESSION.has(vendeur.role) || ouvertePar === vendeur.id;
}
