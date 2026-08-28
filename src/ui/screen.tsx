/**
 * Enveloppe d'écran.
 *
 * Regroupe quatre corvées que chaque écran refaisait à sa façon dans l'ancienne
 * application, avec des résultats différents d'un écran à l'autre :
 * zones sûres, évitement du clavier, tirer pour rafraîchir, et le fond du
 * thème. Un écran qui les oublie se voit tout de suite sur un terminal à barre
 * de navigation logicielle, ce que sont la plupart des POS Android.
 */
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets, type Edge } from "react-native-safe-area-context";

import { useTheme } from "./theme";

export interface ScreenProps {
  children: ReactNode;
  /** Bords où appliquer la zone sûre. Le bas est souvent porté par une barre. */
  edges?: Edge[];
  /** Enveloppe le contenu dans un défilement. */
  scroll?: boolean;
  /** Tirer pour rafraîchir : déclenche un cycle de synchronisation, pas un appel. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Retire la marge intérieure par défaut, pour un POS pleine largeur. */
  padded?: boolean;
  className?: string;
}

export function Screen({
  children,
  edges = ["top"],
  scroll = false,
  onRefresh,
  refreshing = false,
  padded = true,
  className = "",
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const pad = {
    paddingTop: edges.includes("top") ? insets.top : 0,
    paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
    paddingLeft: edges.includes("left") ? insets.left : 0,
    paddingRight: edges.includes("right") ? insets.right : 0,
  };

  const body = scroll ? (
    <ScrollView
      className={`flex-1 ${className}`}
      contentContainerStyle={padded ? { padding: 16 } : undefined}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 ${padded ? "p-4" : ""} ${className}`}>{children}</View>
  );

  return (
    <View className="flex-1 bg-background" style={pad}>
      <KeyboardAvoidingView
        className="flex-1"
        // `padding` sur iOS, `height` sur Android : le comportement natif du
        // clavier diffère, et un seul réglage laisse un champ sous le clavier
        // sur l'une des deux plateformes.
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {body}
      </KeyboardAvoidingView>
    </View>
  );
}
