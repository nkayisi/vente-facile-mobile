/**
 * Faut-il pousser le journal depuis l'arrière-plan ? (lot L14) PUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'APPLICATION FERMÉE N'ENVOYAIT RIEN.                                   │
 * │                                                                          │
 * │ Une vente encaissée à 18 h, réseau revenu à 19 h, terminal rangé dans un │
 * │ tiroir : le journal attendait le lendemain matin, et le back-office du   │
 * │ propriétaire affichait une journée incomplète toute la soirée. Le        │
 * │ système réveille désormais l'application (au mieux toutes les quinze     │
 * │ minutes) pour une POUSSÉE SEULE - aucun tirage, aucune écriture de       │
 * │ table, rien qu'un écran pourrait voir à moitié fait.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ CHAQUE NON EST UN SILENCE RÉSEAU. Cette tâche tourne sans personne devant
 *   l'écran : dans le doute, elle ne fait RIEN, et le premier plan rattrape.
 *   Les cinq refus, chacun pour une raison qui coûterait cher autrement :
 *
 *   1. SCHÉMA EN RETARD - l'application mise à jour mais jamais rouverte :
 *      les migrations ne tournent qu'au montage de l'interface, et écrire le
 *      journal sur un schéma ancien lèverait au milieu d'un envoi.
 *   2. JETONS ILLISIBLES - le trousseau peut être fermé appareil verrouillé.
 *      Sans jetons, le client HTTP tenterait le jeton d'appareil, et un refus
 *      EFFACERAIT la session, sans personne pour le voir.
 *   3. AUCUN INSTANTANÉ - personne n'est connecté : rien ne dit pour quelle
 *      organisation envoyer.
 *   4. ESTAMPILLE DISCORDANTE - la base appartient à un autre compte (voir
 *      `session/proprietaire.ts`). Pousser le journal de X sous le jeton de Y
 *      est précisément la fusion que l'écran de reprise existe pour empêcher.
 *   5. RIEN À ENVOYER - aucun appel réseau pour rien, sur une batterie qui
 *      sert aussi à encaisser demain.
 */

export interface EtatPourPoussee {
  schemaAJour: boolean;
  jetonsLisibles: boolean;
  /** L'instantané de session : qui est connecté, pour quel établissement. */
  session: { userId: string; organizationId: string; deviceId: string | null } | null;
  /** À qui appartient la base locale. */
  estampille: { userId: string; organizationId: string } | null;
  /** Opérations prêtes à partir MAINTENANT (temporisation échue). */
  pretes: number;
}

export type MotifAbstention = "schema" | "jetons" | "session" | "estampille" | "rien";

export type DecisionPoussee =
  | { pousser: true; organizationId: string; deviceId: string | null }
  | { pousser: false; motif: MotifAbstention };

export function doitPousser(e: EtatPourPoussee): DecisionPoussee {
  if (!e.schemaAJour) return { pousser: false, motif: "schema" };
  if (!e.jetonsLisibles) return { pousser: false, motif: "jetons" };
  if (!e.session) return { pousser: false, motif: "session" };
  // ⚠ Une estampille ABSENTE n'autorise rien non plus : c'est le cas d'une
  //   base dont personne ne peut dire à qui elle appartient.
  if (
    !e.estampille ||
    e.estampille.userId !== e.session.userId ||
    e.estampille.organizationId !== e.session.organizationId
  ) {
    return { pousser: false, motif: "estampille" };
  }
  if (e.pretes <= 0) return { pousser: false, motif: "rien" };
  return {
    pousser: true,
    organizationId: e.session.organizationId,
    deviceId: e.session.deviceId,
  };
}
