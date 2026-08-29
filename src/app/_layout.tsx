import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";

import { DatabaseProvider } from "@/db/provider";
import { SessionGate } from "@/session/gate";
import { SessionProvider } from "@/session/provider";
import { ThemeProvider } from "@/ui/theme";

import "../global.css";

// Le splash reste affiché jusqu'à ce que les polices soient prêtes. Sans cela,
// l'application démarre en police système puis bascule sur Inter : un saut
// visible sur tout l'écran, à chaque lancement.
void SplashScreen.preventAutoHideAsync();

/**
 * Racine de l'application.
 *
 * L'ordre compte.
 *
 * `GestureHandlerRootView` enveloppe tout ce qui touche aux gestes (feuilles
 * basses, glissement pour supprimer) et exige un `flex: 1` explicite, sinon
 * l'arbre se réduit à zéro pixel de haut.
 *
 * `BottomSheetModalProvider` est monté ICI, une seule fois, sous
 * `GestureHandlerRootView` et AU-DESSUS de la pile. Monté par écran, deux
 * feuilles ouvertes en même temps s'empilent mal ; monté sous la pile, la
 * feuille se rend derrière l'écran.
 *
 * Le thème vient avant la base, pour que l'écran d'erreur de migration soit lui
 * aussi habillé. La base vient avant la session : celle-ci lira bientôt des
 * réglages qui y sont rangés.
 *
 * Aucun de ces fournisseurs ne touche au réseau au montage. C'est la condition
 * pour qu'un démarrage à froid sans connexion aboutisse.
 */
export default function RootLayout() {
  // Les QUATRE graisses, pas une seule : Android ne synthétise pas les graisses
  // d'une famille custom. Voir `tailwind.config.js`.
  const [policesPretes, erreurPolices] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    // On lève le splash même si les polices ont échoué : une police manquante
    // dégrade la typographie, elle ne doit pas empêcher de vendre.
    if (policesPretes || erreurPolices) void SplashScreen.hideAsync();
  }, [policesPretes, erreurPolices]);

  // L'ARBRE EST MONTÉ DÈS LE PREMIER RENDU, polices prêtes ou non.
  //
  // La tentation est de rendre `null` en attendant. Il ne faut pas : la garde
  // de session navigue dès qu'elle connaît l'état du trousseau, et démonter la
  // pile sous elle expose à naviguer sur un navigateur absent. Et cela ne cache
  // rien de toute façon : c'est le splash, resté affiché par-dessus, qui couvre
  // le rendu en police système le temps du chargement.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="auto" />
          <BottomSheetModalProvider>
            <DatabaseProvider>
              <SessionProvider>
                <SessionGate />
                <Stack screenOptions={{ headerShown: false }} />
              </SessionProvider>
            </DatabaseProvider>
          </BottomSheetModalProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
