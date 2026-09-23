/**
 * La porte d'abonnement, montée au-dessus du comptoir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN VOILE, ET SURTOUT PAS UN ÉTAT DE SESSION.                            │
 * │                                                                          │
 * │ Ajouter une valeur à `SessionStatus` ferait sortir `ROUTE_FOR` du groupe │
 * │ `(app)`, donc démonterait `SynchronisationProvider` - qui, lui, sort     │
 * │ déjà tôt sur `statusRef.current !== "ready"`. Un terminal bloqué ne      │
 * │ pourrait alors NI tirer le verdict frais, NI pousser après avoir payé :  │
 * │ le marchand règle son abonnement et reste enfermé, définitivement.       │
 * │                                                                          │
 * │ C'est l'exact contraire de `base_etrangere`, où l'état EST le verrou     │
 * │ précisément parce qu'on veut empêcher toute synchronisation.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le voile est donc un FRÈRE de la pile, posé par-dessus en absolu : la
 * navigation n'est pas touchée, aucune route ne disparaît, et lever le voile
 * remet le marchand là où il était. Il couvre la barre d'onglets, comme le
 * `fixed inset-0` du back-office.
 *
 * ⚠ **Il ne propose aucune destination, et n'en a plus besoin.** Le paiement
 * est une FEUILLE que le voile porte lui-même : un `Modal` de React Native
 * s'affiche au-dessus de tout, voile compris. C'est ce qui permet à un marchand
 * enfermé de payer sans qu'on ouvre une brèche dans la porte - une route
 * autorisée aurait été une exception à tenir à jour, et donc à oublier.
 */
import { useCallback } from "react";
import { View } from "react-native";

import { useLecture } from "@/data/live";
import { useSynchronisation } from "@/features/sync/provider";
import { useSession } from "@/session/provider";
import { countByState } from "@/sync";

import { jugerAcces } from "./porte";
import { VoileAbonnement } from "./voile";

export function GardeAbonnement({ children }: { children: React.ReactNode }) {
  const { snapshot, refresh } = useSession();
  const { lancer } = useSynchronisation();

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

  const file = useLecture(countByState, {
    tables: ["outbox_operations"],
  });

  const actualiser = useCallback(async () => {
    // On rafraîchit l'instantané ET on lance un cycle : le premier ramène le
    // verdict, le second pousse ce qui attendait si la porte s'ouvre.
    await refresh();
    void lancer("bandeau");
  }, [refresh, lancer]);

  if (verdict.ouvert) return <>{children}</>;

  const compteurs = file.donnees;
  const enAttente = compteurs
    ? compteurs.pending + compteurs.inflight + compteurs.blocked
    : 0;

  return (
    <View className="flex-1">
      {children}
      <VoileAbonnement
        motif={verdict.motif}
        enAttente={enAttente}
        onActualiser={actualiser}
      />
    </View>
  );
}
