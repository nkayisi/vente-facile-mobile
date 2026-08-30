import { Stack } from "expo-router";

/**
 * La feuille de comptage d'une session d'inventaire.
 *
 * Le dossier s'appelle `comptage` et non `inventaire` : `(tabs)/inventaire.tsx`
 * occupe déjà `/inventaire`, et deux nœuds de même nom dans une pile se
 * résolvent mal. « Comptage » nomme d'ailleurs mieux ce qu'on y fait.
 */
export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
