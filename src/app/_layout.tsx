import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";

import { initSentry } from "@/observabilite/sentry";
import { DatabaseProvider } from "@/db/provider";
import { DeconnexionProvider } from "@/session/deconnexion";
import { SessionGate } from "@/session/gate";
import { SessionProvider } from "@/session/provider";
import { ThemeProvider } from "@/ui/theme";

import "../global.css";

// Le splash reste affiché jusqu'à ce que les polices soient prêtes. Sans cela,
// l'application démarre en police système puis bascule sur Inter : un saut
// visible sur tout l'écran, à chaque lancement.
void SplashScreen.preventAutoHideAsync();

// AVANT tout rendu, sinon un plantage au montage - le cas le plus difficile à
// reproduire, et donc celui qu'on veut le plus - ne serait pas rapporté.
// Sans DSN configuré, cet appel ne fait rien : voir `observabilite/sentry.ts`.
initSentry();

/**
 * Racine de l'application.
 *
 * L'ordre compte.
 *
 * `GestureHandlerRootView` enveloppe tout ce qui touche aux gestes (feuilles
 * basses, glissement pour supprimer) et exige un `flex: 1` explicite, sinon
 * l'arbre se réduit à zéro pixel de haut.
 *
 * `BottomSheetModalProvider` A ÉTÉ RETIRÉ au lot 6 : `Sheet` ne repose plus
 * sur `@gorhom/bottom-sheet`, qui ne s'ouvrait pas au démarrage à froid. Le
 * motif complet, et la mesure qui l'établit, sont en tête de
 * `src/ui/sheet.tsx`.
 *
 * Le thème vient avant la base, pour que l'écran d'erreur de migration soit lui
 * aussi habillé. La base vient avant la session : celle-ci lira bientôt des
 * réglages qui y sont rangés.
 *
 * `DeconnexionProvider` est ICI, et non dans un écran : sa surcouche doit
 * SURVIVRE au démontage du groupe `(app)`, que la séquence de déconnexion
 * provoque elle-même en posant `anonymous`. Écrite dans « Mon profil », la
 * modale disparaîtrait à l'instant précis où l'on en a le plus besoin - pendant
 * le nettoyage de la base. Et ses trois appelants vivent dans DEUX groupes.
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
      {/* ┌──────────────────────────────────────────────────────────────┐
          │ LES MÉTRIQUES INITIALES, ET NON UN FOURNISSEUR NU.           │
          │                                                              │
          │ Sans elles, les marges système valent ZÉRO au tout premier   │
          │ rendu, puis se corrigent une image plus tard. Sur un         │
          │ terminal lent, c'est une image où la barre d'onglets et le   │
          │ pied de page sont posés au mauvais endroit - et c'est la     │
          │ classe de défaut qu'un marchand rapporte sans pouvoir la     │
          │ reproduire, parce qu'elle ne dure qu'un battement.           │
          │                                                              │
          │ Elles viennent du natif au démarrage, donc elles ne coûtent  │
          │ aucun aller-retour.                                          │
          └──────────────────────────────────────────────────────────────┘ */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider>
          <StatusBar style="auto" />
          <DatabaseProvider>
            <SessionProvider>
              <SessionGate />
              <DeconnexionProvider>
                <Stack screenOptions={{ headerShown: false }} />
              </DeconnexionProvider>
            </SessionProvider>
          </DatabaseProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
