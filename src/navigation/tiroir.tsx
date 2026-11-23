/**
 * Le tiroir latéral : le hamburger de la barre du haut sur un téléphone, le
 * bouton « Déplier » du rail sur une tablette et au comptoir.
 *
 * Il enveloppe TOUTE l'application connectée (pile, onglets, rail), et non la
 * seule barre d'onglets : c'est ce qui fait que le voile couvre aussi les
 * onglets et le rail quand le menu est ouvert, comme sur le web où la barre
 * latérale passe par-dessus toute la page. Il vivait dans `(tabs)/_layout.tsx` ;
 * le rail d'une tablette reste à l'écran sur les fiches de pile, qui sont hors
 * des onglets, et il doit pouvoir l'ouvrir de là.
 *
 * ⚠ LE GESTE DE BALAYAGE N'OUVRE LE MENU QUE SUR UN ONGLET D'UN TÉLÉPHONE.
 * C'était le cas quand le tiroir vivait sous les onglets, et on ne l'étend pas :
 * sur une fiche poussée, le bord gauche est au retour du système, et sur une
 * tablette le rail est là. Quand la barre latérale est fixe, le tiroir n'a plus
 * rien à montrer : il ne s'ouvre pas, et son contenu n'est pas monté (deux menus
 * montés, ce sont deux abonnements à la base pour un seul affichage).
 *
 * L'implémentation s'appuie sur `react-native-drawer-layout`, la primitive de
 * react-navigation, bâtie sur Reanimated et gesture-handler - tous deux déjà
 * dans le dev client. Le paquet arrivait jusqu'ici par la dépendance
 * transitive d'expo-router ; il est désormais DÉCLARÉ, parce qu'un
 * relèvement de version d'expo-router pourrait le retirer sans prévenir.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BackHandler, Pressable } from "react-native";
import { usePathname } from "expo-router";
import { Drawer } from "react-native-drawer-layout";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { useColor, useDisposition } from "@/ui";
import { retourFermeLeTiroir } from "./fermeture";
import { MenuLateral } from "./menu-lateral";
import { estUneRouteDOnglet } from "./onglets";

interface ApiTiroir {
  ouvrir: () => void;
  fermer: () => void;
  ouvert: boolean;
}

const Contexte = createContext<ApiTiroir | null>(null);

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE VOILE DE LA BIBLIOTHÈQUE EST MASQUÉ, ET LE NÔTRE SUIT L'ÉTAT REACT.  │
 * │                                                                          │
 * │ Celui de `react-native-drawer-layout` anime son opacité et son          │
 * │ `pointerEvents` sur le fil d'interface, sans les inscrire dans l'arbre  │
 * │ de React (Reanimated 4 ne commite pas une propriété qui n'est pas de    │
 * │ mise en page ; la bibliothèque le dit elle-même, et ne le contourne     │
 * │ que pour le tiroir et le contenu). Le premier rendu qui suit une        │
 * │ fermeture réécrit donc les valeurs vues à l'ouverture : voile opaque,   │
 * │ et touches capturées.                                                   │
 * │                                                                          │
 * │ Reproduit sur l'émulateur : ouvrir puis fermer le menu sur une          │
 * │ tablette, puis passer en largeur de téléphone (rotation, écran          │
 * │ partagé). L'application restait grisée et ne répondait plus à rien,     │
 * │ hamburger compris. Le nôtre n'existe que si le menu est ouvert : un     │
 * │ rendu ne peut pas le faire revenir.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const VOILE_DE_LA_BIBLIOTHEQUE = { display: "none" } as const;

function VoileDuTiroir({ onFermer }: { onFermer: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      // Le jeton du voile des feuilles : `bg-black/50` resterait noir en thème
      // sombre, alors que le fond, lui, aurait changé.
      className="absolute inset-0 bg-foreground/50"
    >
      <Pressable
        onPress={onFermer}
        accessibilityRole="button"
        accessibilityLabel="Fermer le menu"
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

export function TiroirProvider({ children }: { children: ReactNode }) {
  const [demande, setOuvert] = useState(false);
  const { navigation } = useDisposition();
  const chemin = usePathname();
  // Une tablette qu'on tourne, menu ouvert, change de forme de navigation : le
  // tiroir se referme, sinon il se rouvrirait tout seul au retour dans l'autre
  // sens. Mis à jour pendant le rendu, et non dans un effet : React rejoue le
  // rendu avant de l'afficher, sans image intermédiaire où le menu serait
  // encore ouvert par-dessus la barre fixe.
  const [formePrecedente, setFormePrecedente] = useState(navigation);
  if (formePrecedente !== navigation) {
    setFormePrecedente(navigation);
    setOuvert(false);
  }
  const ouvert = demande && navigation !== "laterale";
  const ouvrir = useCallback(() => setOuvert(true), []);
  const fermer = useCallback(() => setOuvert(false), []);
  const api = useMemo<ApiTiroir>(() => ({ ouvrir, fermer, ouvert }), [ouvrir, fermer, ouvert]);
  const card = useColor("card");
  const balayage = navigation === "barre" && estUneRouteDOnglet(chemin);

  // Le bouton retour d'Android referme le tiroir au lieu de dépiler l'écran du
  // dessous. Voir `retourFermeLeTiroir` : l'abonnement vit tout le temps, la
  // décision de consommer l'événement est prise à chaque appui.
  useEffect(() => {
    const abonnement = BackHandler.addEventListener("hardwareBackPress", () =>
      retourFermeLeTiroir(ouvert, fermer)
    );
    return () => abonnement.remove();
  }, [ouvert, fermer]);

  return (
    <Contexte.Provider value={api}>
      <Drawer
        open={ouvert}
        onOpen={ouvrir}
        onClose={fermer}
        drawerType="front"
        swipeEnabled={balayage}
        // 320 points : la largeur `w-64` du back-office, à quelques points près.
        drawerStyle={{ width: 320, backgroundColor: card }}
        overlayStyle={VOILE_DE_LA_BIBLIOTHEQUE}
        renderDrawerContent={() =>
          navigation === "laterale" ? null : <MenuLateral onFermer={fermer} />
        }
      >
        {children}
        {ouvert ? <VoileDuTiroir onFermer={fermer} /> : null}
      </Drawer>
    </Contexte.Provider>
  );
}

export function useTiroir(): ApiTiroir {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error("useTiroir doit être appelé sous <TiroirProvider>.");
  return ctx;
}
