import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { DatabaseProvider } from "@/db/provider";
import { ThemeProvider } from "@/ui/theme";

import "../global.css";

/**
 * Racine de l'application.
 *
 * L'ordre compte : `GestureHandlerRootView` enveloppe tout ce qui touche aux
 * gestes (feuilles basses, glissement pour supprimer) et exige un `flex: 1`
 * explicite, sinon l'arbre se réduit à zéro pixel de haut. Le thème vient avant
 * la base pour que l'écran d'erreur de migration soit lui aussi habillé.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="auto" />
          <DatabaseProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </DatabaseProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
