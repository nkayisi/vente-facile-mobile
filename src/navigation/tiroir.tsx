/**
 * Le tiroir latéral : le hamburger de la barre du haut sur un téléphone, le
 * bouton « Menu » du rail sur une tablette.
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
import { BackHandler } from "react-native";
import { usePathname } from "expo-router";
import { Drawer } from "react-native-drawer-layout";

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
        renderDrawerContent={() =>
          navigation === "laterale" ? null : <MenuLateral onFermer={fermer} />
        }
      >
        {children}
      </Drawer>
    </Contexte.Provider>
  );
}

export function useTiroir(): ApiTiroir {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error("useTiroir doit être appelé sous <TiroirProvider>.");
  return ctx;
}
