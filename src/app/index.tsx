/**
 * Écran de démarrage.
 *
 * Il n'aiguille plus : c'est `SessionGate` qui décide, depuis la racine de
 * l'arbre, et qui continue de décider quand l'état change plus tard. Cet écran
 * ne fait qu'occuper la place le temps que le trousseau réponde, ce qui prend
 * quelques millisecondes et aucun appel réseau.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL PROLONGE LE SPLASH, IL NE LUI SUCCÈDE PAS.                           │
 * │                                                                          │
 * │ C'était une roue seule sur le fond du thème : au moment où le splash se  │
 * │ levait, la marque disparaissait d'un coup pour laisser un écran nu, puis │
 * │ réapparaissait à la connexion. Deux ruptures là où il n'en faut aucune.  │
 * │                                                                          │
 * │ Le logo est donc rendu ICI à la MÊME largeur et sur le MÊME fond que le  │
 * │ splash natif : celui-ci se lève sur une image identique, et le raccord   │
 * │ ne se voit pas. Le nombre est recopié de l'`imageWidth` déclaré dans     │
 * │ `app.config.ts`, et un garde-fou refuse qu'ils divergent.                │
 * │                                                                          │
 * │ ⚠ AUCUN DÉLAI ARTIFICIEL. La doctrine est écrite dans `app.config.ts` :  │
 * │ « une mise à jour ne doit jamais retarder l'ouverture du comptoir ». Le  │
 * │ raccord se paie en mise en page, pas en millisecondes, et                │
 * │ `SplashScreen.hideAsync()` reste appelé dès que les polices répondent.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ `bg-splash` et non `bg-background` : le fond du splash est CLAIR dans les
 * deux thèmes, parce que le logo porte du bleu sombre qui disparaît sur fond
 * noir. Suivre le thème ici rendrait un logo amputé en soirée, et ferait deux
 * ruptures au lieu d'une. Le motif complet est dans `ui/tokens.ts`.
 *
 * ⚠ AUCUNE ROUE, et c'est voulu : le splash natif n'en a pas non plus. Une roue
 * qui apparaît à l'instant où le splash se lève annonce une attente là où il
 * n'y en a pas, et trahit le raccord qu'on vient de construire.
 */
import { View } from "react-native";

import { Logo } from "@/ui";

/** Recopie de `imageWidth` du greffon `expo-splash-screen`. */
const LARGEUR_DU_SPLASH = 180;

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-splash">
      {/* ⚠ SANS PLAQUE, et c'est le seul appelant dans ce cas : le fond EST
          déjà `bg-splash`, et le rembourrage d'une plaque rapetisserait le
          logo, donc casserait le raccord avec le splash natif. */}
      <Logo largeur={LARGEUR_DU_SPLASH} fondClair />
    </View>
  );
}
