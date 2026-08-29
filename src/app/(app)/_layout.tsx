import { Stack } from "expo-router";

import { useDeviseParDefaut } from "@/data/devises";
import { PanierProvider } from "@/features/pos/panier";
import { ToastProvider } from "@/ui";

/**
 * Topologie de l'application connectée. Ce fichier décide de tout le reste.
 *
 * `PanierProvider` est HISSÉ ICI, au-dessus du groupe d'onglets ET des écrans
 * du comptoir. Il vivait dans `pos/_layout.tsx`, ce qui ne suffit plus : la
 * grille d'articles devient l'onglet « Vendre », donc elle entre dans les
 * onglets, tandis que l'encaissement et le scanner restent plein écran,
 * au-dessus de la barre. Un provider posé sur `pos/` ne couvrirait plus la
 * grille, et le panier se viderait entre l'onglet et l'écran de paiement.
 *
 * Le hisser est sans risque : le provider ne fait aucun travail au montage
 * (`useReducer` plus trois `useMemo` de calcul pur), et le panier EST un état
 * d'application, pas d'écran - la pastille des paniers en attente s'affiche
 * dans « Plus », et un caissier interrompu par un appel doit retrouver son
 * panier en revenant.
 *
 * Les écrans du comptoir autres que la grille restent hors des onglets : une
 * barre d'onglets sous un scanner de code-barres invite à sortir au pire
 * moment. Comme il n'y a qu'un seul `Tabs` dans tout l'arbre, ils sont poussés
 * par CETTE pile, donc au-dessus de la barre, sans aucun bricolage.
 *
 * Ce qu'il ne faut PAS faire, et qui est la tentation naturelle : mettre `pos/`
 * dans les onglets et masquer la barre par `setOptions({ tabBarStyle: { display:
 * "none" } })` selon le segment courant. C'est fragile - la barre reste masquée
 * si on revient par le geste système - et cela s'écrit dans un `useEffect` que
 * personne ne relit.
 */
export default function AppLayout() {
  // Avant tout écran : sans cela, `formatPrice` écrit en francs congolais
  // quelle que soit la devise de l'établissement.
  useDeviseParDefaut();

  return (
    <ToastProvider>
      <PanierProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="pos" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="appareil" options={{ animation: "slide_from_right" }} />
        </Stack>
      </PanierProvider>
    </ToastProvider>
  );
}
