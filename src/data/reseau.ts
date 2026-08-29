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
