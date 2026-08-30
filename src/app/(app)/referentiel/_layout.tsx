import { Stack } from "expo-router";

/**
 * SINGULIER : `(tabs)/articles.tsx` occupe déjà `/articles`, et deux nœuds de
 * même nom dans une pile se résolvent mal.
 */
export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
