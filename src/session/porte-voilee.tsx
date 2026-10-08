/**
 * Une porte qui VOILE, par opposition à `gate.tsx`, qui ROUTE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN VOILE, ET SURTOUT PAS UN ÉTAT DE SESSION.                            │
 * │                                                                          │
 * │ Ajouter une valeur à `SessionStatus` ferait sortir `ROUTE_FOR` (voisin,   │
 * │ dans `gate.tsx`) du groupe `(app)`, donc démonterait                     │
 * │ `SynchronisationProvider` - qui sort déjà tôt sur                        │
 * │ `statusRef.current !== "ready"`. Un terminal bloqué ne pourrait alors NI  │
 * │ tirer le verdict frais, NI pousser ses ventes : le marchand paie son      │
 * │ abonnement, ou installe sa mise à jour, et reste enfermé.                 │
 * │                                                                          │
 * │ C'est l'exact contraire de `base_etrangere`, où l'état EST le verrou      │
 * │ précisément parce qu'on veut empêcher toute synchronisation.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ **`children` RESTE MONTÉ sous le voile.** Ne pas le rendre supprimerait le
 * `<Stack>` du layout de `(app)`, donc expo-router n'aurait plus de navigateur
 * pour ce groupe : lever le voile ne ramènerait le marchand nulle part. Cet
 * invariant vivait en DEUX copies, une par porte ; il vit ici, et une troisième
 * porte ne peut plus le rater.
 *
 * ⚠ **Le voile n'est PAS positionné ici.** Chaque voile garde son
 * `absolute inset-0 z-50` et ses propres marges système : la zone sûre a un seul
 * propriétaire par bord, et un garde-fou compte les voiles sur ces classes.
 * Les remonter ici les ferait disparaître du balayage.
 */
import { View } from "react-native";

export function PorteVoilee({
  ouverte,
  voile,
  children,
}: {
  ouverte: boolean;
  /**
   * ⚠ Rendu SEULEMENT quand la porte est fermée, donc ses hooks - dont la lecture
   * de ce qui n'est pas parti - ne tournent pas sur un terminal qui vend. Les
   * appelants le passent d'ailleurs à `null` quand la porte est ouverte : ainsi
   * l'élément n'est pas même fabriqué, et le verdict s'y lit déjà NARROWÉ.
   */
  voile: React.ReactNode;
  children: React.ReactNode;
}) {
  if (ouverte) return <>{children}</>;

  return (
    <View className="flex-1">
      {children}
      {voile}
    </View>
  );
}
