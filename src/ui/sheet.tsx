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
import { useEffect, useState } from "react";
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


import { Icon } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";
import { useMargesSysteme } from "./zone-sure";

export function Sheet({
  ouvert,
  onFermer,
  titre,
  retour,
  pied,
  children,
}: {
  ouvert: boolean;
  onFermer: () => void;
  titre?: string;
  /**
   * Revenir d'un PANNEAU vers le précédent, sans fermer la feuille.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UNE FEUILLE DANS UNE FEUILLE N'EST PAS UNE OPTION.                     │
   * │                                                                        │
   * │ `Sheet` est un `Modal` de React Native ; en empiler un second par      │
   * │ dessus donne un voile sur un voile, deux `onRequestClose` qui se       │
   * │ disputent le bouton retour d'Android, et sur certaines versions rien   │
   * │ qui monte du tout. Un formulaire qui a besoin de choisir un client     │
   * │ puis un article échange donc le CONTENU de sa feuille, et cette flèche │
   * │ est ce qui rend le chemin réversible.                                  │
   * │                                                                        │
   * │ Quand elle est là, le voile et le bouton retour reculent d'un panneau  │
   * │ au lieu de tout fermer : c'est à l'appelant de câbler `onFermer` en    │
   * │ conséquence, et c'est ce qui évite de perdre une saisie d'un geste     │
   * │ destiné à revenir en arrière.                                          │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  retour?: () => void;
  /**
   * Barre d'actions FIXE, posee sous le contenu.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UN BOUTON QUI VALIDE NE DOIT PAS SORTIR DE L'ECRAN.                    │
   * │                                                                        │
   * │ Tout le contenu d'une feuille vit dans UN defilement : sur un           │
   * │ formulaire long, le bouton de validation part hors de vue au moment     │
   * │ precis ou l'on descend LIRE ce qu'on valide. C'est le defaut que        │
   * │ `Screen pied` a deja ferme, et cette prop en est le miroir exact.       │
   * │                                                                        │
   * │ Elle est un FRERE du defilement et non une surcouche : le contenu se    │
   * │ reduit d'autant, donc rien ne passe dessous et aucun appelant n'a a     │
   * │ reserver sa hauteur en bas de liste. Elle est aussi DANS l'evitement    │
   * │ du clavier - une barre d'action qui reste sous un clavier ouvert n'est  │
   * │ pas une barre d'action.                                                │
   * │                                                                        │
   * │ ⚠ LA ZONE SURE A UN SEUL PROPRIETAIRE PAR BORD. Quand un pied est la,   │
   * │ c'est LUI qui porte `insets.bottom`, et le defilement redescend a un    │
   * │ rembourrage simple : les cumuler laisserait une bande vide au-dessus    │
   * │ de la barre.                                                           │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  pied?: React.ReactNode;
  children: React.ReactNode;
}) {
  const marges = useMargesSysteme();
  const { height } = useWindowDimensions();
  // `useState` d'initialisation paresseuse plutôt qu'un `useRef` : la valeur
  // animée est LUE au rendu (elle part dans le style), et un ref lu au rendu
  // est ce que `react-hooks/refs` interdit. L'identité ne change jamais, comme
  // celle d'un ref. Quatre erreurs de lint de moins, aucun comportement changé.
  const [glissement] = useState(() => new Animated.Value(0));

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
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ LES DEUX PROPS SONT INERTES AUJOURD'HUI, ET ON LES ÉCRIT QUAND   │
      // │ MÊME.                                                            │
      // │                                                                  │
      // │ `ReactModalHostView.kt` force leurs deux getters à `true` dès que │
      // │ le bord-à-bord est actif, et il l'est : `edgeToEdgeEnabled=true`  │
      // │ dans `gradle.properties`, que le prebuild pose. Mais ce fichier   │
      // │ est GITIGNORÉ - le dépôt ne le contrôle pas et ne peut pas le     │
      // │ garder. Le jour où une version d'Expo le repasserait à `false`,   │
      // │ la fenêtre de dialogue serait insérée par le système et la marge  │
      // │ qu'on pose ici deviendrait une DOUBLE marge. Écrites, elles       │
      // │ rendent la géométrie indépendante de ce drapeau.                  │
      // │                                                                  │
      // │ ⚠ `Modal.js` impose de poser les deux ensemble ou aucune :        │
      // │ `navigationBarTranslucent` seul est refusé en développement.      │
      // └──────────────────────────────────────────────────────────────────┘
      statusBarTranslucent
      navigationBarTranslucent
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
              // Voir l'encadre ci-dessous.
              flexShrink: 1,
              transform: [
                {
                  translateY: glissement.interpolate({
                    inputRange: [0, 1],
                    outputRange: [height * 0.5, 0],
                  }),
                },
              ],
            }}
            // ┌──────────────────────────────────────────────────────────┐
            // │ `flexShrink: 1`, ET CE N'EST PAS UNE PRECAUTION.         │
            // │                                                          │
            // │ EN REACT NATIVE, `flexShrink` VAUT ZERO PAR DEFAUT - le  │
            // │ contraire du CSS du navigateur. Sans lui, une carte plus │
            // │ haute que les 90 % autorises ne se comprime pas : elle   │
            // │ deborde, et tout ce qui suit le defilement - donc le     │
            // │ `pied` - est pose SOUS le bord de l'ecran. Le bouton qui │
            // │ valide disparait alors exactement quand le contenu       │
            // │ grandit, c'est-a-dire quand on en a le plus besoin.      │
            // └──────────────────────────────────────────────────────────┘
            className="rounded-t-2xl border-t border-border bg-card"
          >
            {/* La poignée ne se glisse pas, mais elle DIT que c'est une feuille
                et non un écran : sans elle, on cherche un bouton de retour. */}
            <View className="items-center py-2">
              <View className="h-1 w-10 rounded-full bg-muted-foreground/40" />
            </View>
            <ScrollView
              // C'est le DEFILEMENT qui cede la place au pied, jamais le pied
              // qui cede la sienne : lui garde son `flexShrink` a zero, sinon
              // la barre d'actions se tasserait sur un contenu tres long.
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 4,
                // Voir `pied` : quand il est la, c'est lui qui porte la
                // zone sure, et les cumuler laisserait une bande vide.
                paddingBottom: pied ? 16 : Math.max(marges.bas, 16) + 16,
                gap: 16,
              }}
            >
              {titre || retour ? (
                <View className="flex-row items-center gap-2">
                  {retour ? (
                    <Pressable
                      onPress={retour}
                      accessibilityRole="button"
                      accessibilityLabel="Revenir au panneau précédent"
                      className="-ml-2 h-11 w-11 items-center justify-center rounded-lg"
                      pressedClassName="active:opacity-60"
                    >
                      <Icon name="ArrowLeft" size={20} color="foreground" />
                    </Pressable>
                  ) : null}
                  {titre ? (
                    <Text
                      variant="h4"
                      numberOfLines={1}
                      className="min-w-0 flex-1"
                    >
                      {titre}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {children}
            </ScrollView>
            {pied ? (
              // Le filet DETACHE la barre du contenu qui defile dessous, comme
              // le `DialogFooter` du back-office.
              <View
                className="border-t border-border px-4 pt-3"
                style={{ paddingBottom: Math.max(marges.bas, 16) }}
              >
                {pied}
              </View>
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
