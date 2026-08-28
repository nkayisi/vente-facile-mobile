import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { DatabaseProvider } from "@/db/provider";
import { SessionGate } from "@/session/gate";
import { SessionProvider } from "@/session/provider";
import { ThemeProvider } from "@/ui/theme";

import "../global.css";

/**
 * Racine de l'application.
 *
 * L'ordre compte.
 *
 * `GestureHandlerRootView` enveloppe tout ce qui touche aux gestes (feuilles
 * basses, glissement pour supprimer) et exige un `flex: 1` explicite, sinon
 * l'arbre se réduit à zéro pixel de haut.
 *
 * Le thème vient avant la base, pour que l'écran d'erreur de migration soit lui
 * aussi habillé. La base vient avant la session : celle-ci lira bientôt des
 * réglages qui y sont rangés.
 *
 * Aucun de ces fournisseurs ne touche au réseau au montage. C'est la condition
 * pour qu'un démarrage à froid sans connexion aboutisse.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="auto" />
          <DatabaseProvider>
            <SessionProvider>
              <SessionGate />
              <Stack screenOptions={{ headerShown: false }} />
            </SessionProvider>
          </DatabaseProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
