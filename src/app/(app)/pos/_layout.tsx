import { Stack } from "expo-router";

import { PanierProvider } from "@/features/pos/panier";

/**
 * Le panier vit au-dessus des écrans du comptoir.
 *
 * Le POS web tient dans une seule page ; sur un téléphone il en faut trois, et
 * un panier logé dans l'un d'eux se viderait en passant au suivant.
 */
export default function PosLayout() {
  return (
    <PanierProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </PanierProvider>
  );
}
