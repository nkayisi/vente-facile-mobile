import { Stack } from "expo-router";

/**
 * Fiche client, création, encaissement.
 *
 * SINGULIER, pour la même raison que `vente/` : `(tabs)/contacts.tsx` porte la
 * liste, et deux nœuds de même nom dans une pile se résolvent mal. Le pluriel
 * désigne la section, le singulier une pièce.
 */
export default function ClientLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
