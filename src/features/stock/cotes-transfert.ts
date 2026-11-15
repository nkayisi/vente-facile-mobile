/**
 * Qui peut faire quoi sur un transfert : chaque transition a son CÔTÉ.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN TRANSFERT SE LIT DES DEUX CÔTÉS, IL NE S'AGIT QUE D'UN SEUL.         │
 * │                                                                          │
 * │ Approuver, expédier et annuler engagent l'entrepôt SOURCE : c'est son    │
 * │ stock qui part, ou qui revient. Réceptionner engage la DESTINATION :     │
 * │ c'est elle qui compte ce qui arrive. Le serveur le tranche ainsi         │
 * │ (`exiger_cote_du_transfert`), dans la vue comme dans le journal.         │
 * │                                                                          │
 * │ Le terminal proposait les quatre boutons à quiconque lisait le           │
 * │ transfert : le magasinier de destination pouvait « Expédier » un envoi   │
 * │ qu'il attendait, l'acte partait au journal et revenait refusé, en        │
 * │ quarantaine, loin du quai où il l'avait décidé.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il décide d'un bouton, il s'éprouve sans appareil.
 */

export type TransitionDuTransfert = "approve" | "ship" | "receive" | "cancel";
export type CoteDuTransfert = "source" | "destination";

export const COTE_DE_LA_TRANSITION: Record<TransitionDuTransfert, CoteDuTransfert> = {
  approve: "source",
  ship: "source",
  cancel: "source",
  receive: "destination",
};

/**
 * Le membre peut-il faire CETTE transition sur CE transfert ?
 *
 * @param actionnables Les entrepôts où il agit (`useEntrepotsDuMembre`) : ses
 *                     affectés actifs, ou tous les actifs pour le propriétaire.
 *                     Un dépôt désactivé n'y est pas, et c'est voulu : le
 *                     serveur le ferme à toute opération (`entrepot_inactif`).
 */
export function transitionDuBonCote(
  transition: TransitionDuTransfert,
  transfert: { sourceId: string; destinationId: string },
  actionnables: ReadonlySet<string>
): boolean {
  const cote = COTE_DE_LA_TRANSITION[transition];
  return actionnables.has(cote === "source" ? transfert.sourceId : transfert.destinationId);
}
