import { Stack } from "expo-router";

/**
 * Écrans de détail, hors de la barre d'onglets.
 *
 * SINGULIER : `(tabs)/stock.tsx` occupe déjà `/stock`, et deux nœuds de même
 * nom dans une pile se résolvent mal. « Rayon » est le mot que ce dépôt emploie
 * déjà pour une ligne de stock (« un rayon qui porte 3 casiers »).
 */
export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
