/**
 * État du réseau.
 *
 * Sert les écrans dont l'ÉCRITURE est en ligne seulement : paramètres, devises,
 * fidélité, inscription. La lecture, elle, ne demande jamais le réseau - c'est
 * tout l'objet des tables tirées.
 *
 * `isConnected === false` est le seul cas qui bloque. `isInternetReachable`
 * reste `null` tant que la sonde n'a pas conclu, et s'en servir ferait clignoter
 * un bandeau « hors ligne » à chaque démarrage, y compris connecté.
 */
import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(true);
  useEffect(() => {
    const abo = NetInfo.addEventListener((e) => setEnLigne(e.isConnected !== false));
    return () => abo();
  }, []);
  return enLigne;
}

/**
 * S'abonne au RETOUR du réseau. Rend la fonction de désabonnement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEULE LA TRANSITION COMPTE, PAS L'ÉTAT.                                 │
 * │                                                                          │
 * │ `useEnLigne` dit où l'on en est ; on a besoin ici du MOMENT où le réseau │
 * │ revient, pour que les ventes encaissées en zone morte partent sans que   │
 * │ le marchand ait à y penser.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Un abonnement impératif, PAS un hook.** Le consommateur est
 * `features/sync/provider.tsx`, qui l'appelle dans un effet à dépendances
 * stables (montage seul). Un hook à rappel capturerait une closure périmée à
 * chaque rendu, ou forcerait un effet qui se réabonne sans cesse.
 *
 * **Un abonnement NetInfo par appelant**, sans registre partagé : il n'y a
 * qu'un appelant, et un état de module mutable serait une seconde source de
 * vérité à remettre à zéro - entre deux tests comme entre deux sessions.
 */
export function surRetourReseau(quand: () => void): () => void {
  // L'état de départ est optimiste, comme celui de `useEnLigne`. En partant de
  // `false`, le tout premier événement « connecté » se lirait comme un retour :
  // NetInfo émet l'état courant dès l'abonnement, et le cycle de montage a son
  // propre mécanisme, avec son propre délai. Les deux partiraient en double.
  let enLigne = true;

  const abo = NetInfo.addEventListener((e) => {
    const maintenant = e.isConnected !== false;
    // Un `true → true` ne déclenche rien. NetInfo émet à chaque changement de
    // type de liaison - Wi-Fi vers cellulaire - en restant connecté : sans
    // cette garde, un marchand qui marche dans la rue lancerait une rafale de
    // synchronisations.
    const revenu = maintenant && !enLigne;
    enLigne = maintenant;
    if (revenu) quand();
  });

  // Le désabonnement est idempotent : on ne maîtrise pas l'implémentation de
  // NetInfo, et rien ne garantit qu'un second retrait du même écouteur y soit
  // sans effet. L'appelant, lui, a le droit de nettoyer deux fois.
  let coupe = false;
  return () => {
    if (coupe) return;
    coupe = true;
    abo();
  };
}
