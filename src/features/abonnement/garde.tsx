/**
 * La porte d'abonnement, montée au-dessus du comptoir.
 *
 * ⚠ **Elle ne propose aucune destination, et n'en a plus besoin.** Le paiement
 * est une FEUILLE que le voile porte lui-même : un `Modal` de React Native
 * s'affiche au-dessus de tout, voile compris. C'est ce qui permet à un marchand
 * enfermé de payer sans qu'on ouvre une brèche dans la porte - une route
 * autorisée aurait été une exception à tenir à jour, et donc à oublier.
 *
 * ⚠ **AUCUNE LECTURE DE BASE ICI**, pour la raison écrite dans
 * `features/mise-a-jour/garde.tsx` : elle tournait sur chaque terminal, y compris
 * ceux dont la porte est ouverte, c'est-à-dire presque tous.
 *
 * Le pourquoi d'un voile plutôt que d'un état de session est écrit dans
 * `session/porte-voilee.tsx`, à un seul endroit.
 */
import { PorteVoilee } from "@/session/porte-voilee";
import { useSession } from "@/session/provider";

import { jugerAcces } from "./porte";
import { VoileAbonnement } from "./voile";

export function GardeAbonnement({ children }: { children: React.ReactNode }) {
  const { snapshot } = useSession();

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ ⚠ PAS DE `useMemo` ICI, ET C'EST DÉLIBÉRÉ.                            │
  // │                                                                        │
  // │ Mémoïser sur l'instantané fige l'instant : le verdict ne serait        │
  // │ recalculé que lorsque le serveur répond. Un terminal laissé ouvert au  │
  // │ comptoir - le cas ORDINAIRE, une caisse ne se ferme pas de la journée  │
  // │ - resterait donc ouvert après son échéance, jusqu'au prochain          │
  // │ redémarrage. La mémoïsation aurait rendu la porte inopérante sur la    │
  // │ seule machine qu'elle doit fermer.                                     │
  // │                                                                        │
  // │ `jugerAcces` est une comparaison de deux dates : la recalculer à       │
  // │ chaque rendu ne coûte rien, et tout rendu (synchronisation,            │
  // │ navigation, minuteur) devient une occasion de fermer.                  │
  // └────────────────────────────────────────────────────────────────────────┘
  const verdict = jugerAcces(
    snapshot?.subscription,
    snapshot?.fetched_at,
    new Date()
  );

  return (
    <PorteVoilee
      ouverte={verdict.ouvert}
      // ⚠ Le voile n'est même pas FABRIQUÉ quand la porte est ouverte : c'est
      // aussi ce qui permet à TypeScript de lire `verdict.motif`, qui n'existe
      // que sur la branche fermée.
      voile={verdict.ouvert ? null : <VoileAbonnement motif={verdict.motif} />}
    >
      {children}
    </PorteVoilee>
  );
}
