/**
 * Sur quelle session de caisse un vendeur a le droit d'encaisser.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON NE VEND QUE DANS SA PROPRE SESSION, QUEL QUE SOIT SON RÔLE.          │
 * │                                                                          │
 * │ La règle suivait le rôle (`is_manager_or_above`) : le propriétaire et le │
 * │ gérant encaissaient sur la session de n'importe qui. Leurs ventes        │
 * │ entraient alors dans un tiroir qu'ils ne comptaient pas, et le Z du      │
 * │ caissier annonçait un excédent qu'il n'avait pas encaissé. Le serveur    │
 * │ refuse désormais à TOUS une vente dans la session d'un autre             │
 * │ (`session_d_un_autre`), et le refus est DÉTERMINISTE : le comptoir doit  │
 * │ le savoir avant le ticket, pas après.                                    │
 * │                                                                          │
 * │ Relevé sur l'émulateur le 2026-11-14 pour le caissier, et c'est la même  │
 * │ classe de défaut : un refus après impression, client parti.              │
 * └──────────────────────────────────────────────────────────────────────────┘
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
  return ouvertePar === vendeur.id;
}

/** La session que le vendeur tient déjà, telle que l'écran d'ouverture la connaît. */
export interface SessionDuVendeur {
  registerId: string;
  registerName: string;
  /** Ouverte quand. `null` : date inconnue, on ne l'invente pas. */
  openedAt: Date | null;
}

/**
 * Pourquoi ce vendeur ne peut PAS ouvrir une session sur `caisseVisee`, ou
 * `null` s'il le peut.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE PERSONNE, UN TIROIR À LA FOIS.                                      │
 * │                                                                          │
 * │ Le serveur refuse une seconde session à qui en tient déjà une, sur       │
 * │ n'importe quelle caisse (`session_personnelle_ouverte`) : chacune        │
 * │ compterait une partie de sa journée, et aucun des deux Z ne              │
 * │ correspondrait à ce qu'il a encaissé. L'ouverture hors ligne partait     │
 * │ au journal et revenait en quarantaine, avec toutes les ventes qui s'y    │
 * │ rattachaient. L'écran d'ouverture la refuse donc AVANT, en nommant la    │
 * │ caisse à clôturer d'abord - la phrase du serveur, au mot près.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * @param sienne La session que `sessionOuverte()` rend : la SIENNE seulement,
 *               puisqu'on ne vend que dans sa propre session.
 */
export function refusDOuverture(
  sienne: SessionDuVendeur | null,
  caisseVisee: string,
  formaterDate: (d: Date) => string
): string | null {
  if (!sienne || sienne.registerId === caisseVisee) return null;
  const depuis = sienne.openedAt ? `, depuis le ${formaterDate(sienne.openedAt)}` : "";
  return (
    `Vous avez déjà une session ouverte sur ${sienne.registerName}${depuis}. ` +
    "Clôturez-la avant d'en ouvrir une autre."
  );
}
