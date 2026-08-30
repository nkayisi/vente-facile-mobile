import { Stack } from "expo-router";

/**
 * Le parc de caisses, plein écran.
 *
 * PLURIEL, et l'onglet `caisse` est le LIVRE de caisse : deux notions que le
 * back-office range aussi sous deux menus. `/caisses` liste les comptoirs et
 * leurs sessions ; `/caisse` suit l'argent qui entre et sort. Un écran qui les
 * confondrait ferait chercher un fonds de tiroir dans une liste de dépenses.
 */
export default function CaissesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
