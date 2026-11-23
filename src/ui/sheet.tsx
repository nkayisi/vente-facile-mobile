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
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable as PressableNatif,
  ScrollView,
  View,
} from "react-native";


import { Icon } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";
import { useDisposition } from "./disposition";
import { formeDeModale } from "./disposition-regles";
import { useInscrireModale } from "./modales-ouvertes";
import { useMargesSysteme } from "./zone-sure";

/**
 * La largeur d'une feuille posée au CENTRE, hors téléphone.
 *
 * `standard` : la largeur d'un formulaire, comme `max-w-lg` des dialogues du
 * back-office. `large` : les feuilles qui portent une liste à côté de leurs
 * champs (encaissement, approvisionnement de masse, devis, mouvement), où 560
 * points feraient replier chaque ligne.
 */
const LARGEUR_DIALOGUE = { standard: 560, large: 760 } as const;

/**
 * La place que le clavier retire à l'écran, pour une feuille posée au centre.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ UNE CARTE CENTRÉE NE SE LAISSE PAS POUSSER PAR `KeyboardAvoidingView`. │
 * │                                                                        │
 * │ Il calcule son rembourrage depuis le bas de SA vue. Centrée, elle      │
 * │ remonte de la moitié de ce qu'on lui ajoute, et son bas restait sous   │
 * │ le clavier : relevé sur le rk3568 (clavier de 422 points sur 1 080),   │
 * │ « Enregistrer » y disparaissait. La hauteur se borne donc ici, et le   │
 * │ défilement cède la place : le pied reste au-dessus du clavier.         │
 * └────────────────────────────────────────────────────────────────────────┘
 */
function useClavierAuCentre(actif: boolean, hauteurFenetre: number): number {
  const [clavier, setClavier] = useState(0);
  useEffect(() => {
    if (!actif) return;
    const montre = Keyboard.addListener("keyboardDidShow", (e) => {
      setClavier(Math.max(0, hauteurFenetre - e.endCoordinates.screenY));
    });
    const cache = Keyboard.addListener("keyboardDidHide", () => setClavier(0));
    return () => {
      montre.remove();
      cache.remove();
      setClavier(0);
    };
  }, [actif, hauteurFenetre]);
  return clavier;
}

export function Sheet({
  ouvert,
  onFermer,
  titre,
  retour,
  pied,
  taille = "standard",
  children,
}: {
  ouvert: boolean;
  onFermer: () => void;
  titre?: string;
  /**
   * La largeur de la feuille quand elle est posée au centre (tablette). Sans
   * effet sur un téléphone, où elle monte du bas sur toute la largeur.
   */
  taille?: keyof typeof LARGEUR_DIALOGUE;
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
  // Le lecteur de codes du comptoir s'arrête tant qu'elle est ouverte.
  useInscrireModale(ouvert);
  const marges = useMargesSysteme();
  const { fenetre, classe } = useDisposition();
  const height = fenetre.hauteur;
  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ SUR UNE TABLETTE, LA FEUILLE SE POSE AU CENTRE.                      │
  // │                                                                      │
  // │ Montée du bas sur 1 920 points, elle se lisait comme un bandeau, et  │
  // │ son bouton de validation partait à l'autre bout de l'écran. Au       │
  // │ centre, elle garde la largeur d'un formulaire. MÊME API : les        │
  // │ cinquante-cinq appelants (feuilles, `ChampSelect`, thème) suivent    │
  // │ sans une ligne changée, `retour`, `pied` et clavier compris.         │
  // └──────────────────────────────────────────────────────────────────────┘
  const dialogue = formeDeModale(classe) === "dialogue";
  const clavier = useClavierAuCentre(dialogue && ouvert, height);
  const margeHaute = marges.haut + 16;
  const margeBasse = clavier > 0 ? clavier + 8 : marges.bas + 16;
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
      <View
        className={dialogue ? "flex-1 items-center justify-center px-6" : "flex-1 justify-end"}
        // Au centre, la carte touche les deux bords quand elle est haute : la
        // zone sûre se prend donc en haut ET en bas (voir `dialog.tsx`).
        style={
          dialogue
            ? { paddingTop: margeHaute, paddingBottom: margeBasse }
            : undefined
        }
      >
        {/* Le voile lit un JETON. `bg-black/50` resterait noir en thème sombre
            alors que le fond, lui, a changé : le contraste s'inverserait. */}
        <PressableNatif
          className="absolute inset-0 bg-foreground/50"
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          onPress={onFermer}
        />
        {/*
          ┌──────────────────────────────────────────────────────────────────┐
          │ `padding` SUR LES DEUX PLATEFORMES, ET SURTOUT PAS `undefined`. │
          │                                                                  │
          │ Sur Android, `undefined` s'en remettait au REDIMENSIONNEMENT de  │
          │ la fenêtre - que le bord-à-bord n'assure plus : la feuille       │
          │ restait sous le clavier, et le champ qu'on tapait avec elle. Le  │
          │ rembourrage, lui, se calcule depuis la position du clavier par   │
          │ rapport à la vue : si la fenêtre se redimensionne malgré tout,   │
          │ la vue est déjà au-dessus du clavier, l'écart vaut zéro, et rien │
          │ ne se compte deux fois.                                          │
          │                                                                  │
          │ ⚠ PAS `height` non plus : sa hauteur de départ est relevée au    │
          │ premier rendu, et une feuille dont le panneau change (`retour`)  │
          │ la rendrait fausse au premier échange.                           │
          └──────────────────────────────────────────────────────────────────┘
        */}
        <KeyboardAvoidingView
          behavior="padding"
          // Au centre, c'est `useClavierAuCentre` qui borne la carte.
          enabled={!dialogue}
          // La feuille ne monte jamais au-delà de 90 % : au-dessus, elle se lit
          // comme un écran plein et le retour en arrière devient ambigu. Au
          // centre, elle prend la largeur d'un formulaire et pas davantage.
          style={
            dialogue
              ? {
                  width: "100%",
                  maxWidth: LARGEUR_DIALOGUE[taille],
                  maxHeight: Math.min(height * 0.9, height - margeHaute - margeBasse),
                }
              : { maxHeight: height * 0.9 }
          }
        >
          <Animated.View
            style={
              dialogue
                ? {
                    flexShrink: 1,
                    // Au centre, un glissement depuis le bas traverserait la
                    // moitié de l'écran : la carte apparaît sur place, en
                    // fondu, à peine grandie - le mouvement d'un dialogue.
                    opacity: glissement,
                    transform: [
                      {
                        scale: glissement.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.96, 1],
                        }),
                      },
                    ],
                  }
                : {
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
                  }
            }
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
            className={
              dialogue
                ? "rounded-2xl border border-border bg-card"
                : "rounded-t-2xl border-t border-border bg-card"
            }
          >
            {/* La poignée ne se glisse pas, mais elle DIT que c'est une feuille
                et non un écran : sans elle, on cherche un bouton de retour. Au
                centre, il n'y a rien à tirer vers le bas : pas de poignée. */}
            {dialogue ? (
              <View className="h-3" />
            ) : (
              <View className="items-center py-2">
                <View className="h-1 w-10 rounded-full bg-muted-foreground/40" />
              </View>
            )}
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
                // Au centre, la carte ne touche pas le bas de l'écran : la
                // marge système est déjà prise par le voile.
                paddingBottom: pied || dialogue ? 16 : Math.max(marges.bas, 16) + 16,
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
                style={{ paddingBottom: dialogue ? 16 : Math.max(marges.bas, 16) }}
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
