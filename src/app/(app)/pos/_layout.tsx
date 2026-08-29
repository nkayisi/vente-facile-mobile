import { Stack } from "expo-router";

/**
 * Écrans du comptoir tenus PLEIN ÉCRAN, hors de la barre d'onglets.
 *
 * `PanierProvider` n'est plus ici : il a été hissé dans `(app)/_layout.tsx`,
 * parce que la grille d'articles vit désormais dans l'onglet « Vendre » et que
 * le panier doit survivre au passage de l'un à l'autre.
 */
export default function PosLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
