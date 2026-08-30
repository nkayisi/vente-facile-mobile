import { Stack } from "expo-router";

/**
 * Les écrans d'UNE vente, tenus plein écran, hors de la barre d'onglets.
 *
 * SINGULIER dans l'URL, et ce n'est pas une coquetterie : `(tabs)/ventes.tsx`
 * occupe déjà `/ventes`, qui est le hub de la section. Deux nœuds nommés
 * `ventes` dans la même pile - l'un dans le groupe d'onglets, l'autre en
 * dossier - se résolvent mal et l'erreur ne se voit qu'à l'exécution. Le
 * pluriel désigne la section, le singulier une pièce : `/vente/<id>` se lit
 * « cette vente ».
 *
 * Même partage que le comptoir : on ne pose pas une barre d'onglets sous un
 * écran d'où l'on encaisse.
 */
export default function VenteLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
