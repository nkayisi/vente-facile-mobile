/**
 * Feuille basse.
 *
 * Les `Dialog sm:max-w-md` du back-office deviennent ici des feuilles : c'est
 * la doctrine du plan, « feuilles basses plutôt que modales centrées ».
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI PLUS `@gorhom/bottom-sheet`, ET COMMENT ON L'A SU               │
 * │                                                                          │
 * │ Il ne s'ouvrait PAS au démarrage à froid. Aucune erreur, aucun           │
 * │ avertissement : `present()` partait, et rien ne montait. Le défaut ne se  │
 * │ voyait qu'à froid, parce qu'un simple Fast Refresh le faisait ensuite     │
 * │ fonctionner - de quoi le déclarer bon pendant tout un développement et le │
 * │ découvrir sur le terminal d'un marchand, à l'écran d'encaissement.       │
 * │                                                                          │
 * │ Mesuré sur l'émulateur : application relancée, écran de vente ET écran de │
 * │ client, feuille réduite à un seul `Text` pour écarter tout problème de    │
 * │ contenu, état forcé à `true` dès le montage. Rien ne sort. La même feuille│
 * │ s'ouvre après un rechargement à chaud.                                   │
 * │                                                                          │
 * │ La cause probable est le couple avec `react-native-reanimated` 4 : gorhom │
 * │ v5 vise Reanimated 3, dont la 4 est une réécriture. C'est exactement le   │
 * │ critère de fraîcheur qui a écarté WatermelonDB au lot 0.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'API PUBLIQUE N'A PAS BOUGÉ. C'est tout l'intérêt d'avoir mis le paquet
 * derrière notre propre composant : les appelants ignorent le changement.
 *
 * Ce qu'on perd, et qui est assumé : le glisser-pour-fermer et l'inertie du
 * doigt. On garde ce qui compte au comptoir : la feuille monte du bas, occupe
 * la place qu'il lui faut sans dépasser 90 % de la hauteur, se ferme au voile
 * et au bouton retour d'Android, et laisse le clavier la pousser.
 */
import { useEffect, useRef } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable as PressableNatif,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "./text";

export function Sheet({
  ouvert,
  onFermer,
  titre,
  children,
}: {
  ouvert: boolean;
  onFermer: () => void;
  titre?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const glissement = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // `useNativeDriver` sur une translation : l'animation tourne sur le fil UI
    // et ne saute pas quand le fil JS travaille - or il travaille toujours à
    // l'ouverture d'une feuille, qui charge ses moyens de paiement.
    Animated.timing(glissement, {
      toValue: ouvert ? 1 : 0,
      duration: ouvert ? 220 : 160,
      useNativeDriver: true,
    }).start();
  }, [ouvert, glissement]);

  return (
    <Modal
      visible={ouvert}
      transparent
      // Le glissement est animé à la main : `animationType` doublerait le
      // mouvement et le rendrait mou.
      animationType="none"
      onRequestClose={onFermer}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end">
        {/* Le voile lit un JETON. `bg-black/50` resterait noir en thème sombre
            alors que le fond, lui, a changé : le contraste s'inverserait. */}
        <PressableNatif
          className="absolute inset-0 bg-foreground/50"
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          onPress={onFermer}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          // La feuille ne monte jamais au-delà de 90 % : au-dessus, elle se lit
          // comme un écran plein et le retour en arrière devient ambigu.
          style={{ maxHeight: height * 0.9 }}
        >
          <Animated.View
            style={{
              transform: [
                {
                  translateY: glissement.interpolate({
                    inputRange: [0, 1],
                    outputRange: [height * 0.5, 0],
                  }),
                },
              ],
            }}
            className="rounded-t-2xl border-t border-border bg-card"
          >
            {/* La poignée ne se glisse pas, mais elle DIT que c'est une feuille
                et non un écran : sans elle, on cherche un bouton de retour. */}
            <View className="items-center py-2">
              <View className="h-1 w-10 rounded-full bg-muted-foreground/40" />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 4,
                paddingBottom: Math.max(insets.bottom, 16) + 16,
                gap: 16,
              }}
            >
              {titre ? <Text variant="h4">{titre}</Text> : null}
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
