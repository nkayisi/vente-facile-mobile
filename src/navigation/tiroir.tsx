/**
 * Le tiroir latéral, ouvert par le hamburger de la barre du haut.
 *
 * Il enveloppe la barre d'onglets, et non l'inverse : c'est ce qui fait que le
 * voile couvre AUSSI les onglets quand le menu est ouvert, comme sur le web où
 * la barre latérale passe par-dessus toute la page.
 *
 * L'implémentation s'appuie sur `react-native-drawer-layout`, la primitive de
 * react-navigation, bâtie sur Reanimated et gesture-handler - tous deux déjà
 * dans le dev client. Le paquet arrivait jusqu'ici par la dépendance
 * transitive d'expo-router ; il est désormais DÉCLARÉ, parce qu'un
 * relèvement de version d'expo-router pourrait le retirer sans prévenir.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Drawer } from "react-native-drawer-layout";

import { useColor } from "@/ui";
import { MenuLateral } from "./menu-lateral";

interface ApiTiroir {
  ouvrir: () => void;
  fermer: () => void;
  ouvert: boolean;
}

const Contexte = createContext<ApiTiroir | null>(null);

export function TiroirProvider({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const ouvrir = useCallback(() => setOuvert(true), []);
  const fermer = useCallback(() => setOuvert(false), []);
  const api = useMemo<ApiTiroir>(() => ({ ouvrir, fermer, ouvert }), [ouvrir, fermer, ouvert]);
  const card = useColor("card");

  return (
    <Contexte.Provider value={api}>
      <Drawer
        open={ouvert}
        onOpen={ouvrir}
        onClose={fermer}
        drawerType="front"
        // 320 points : la largeur `w-64` du back-office, à quelques points près.
        drawerStyle={{ width: 320, backgroundColor: card }}
        renderDrawerContent={() => <MenuLateral onFermer={fermer} />}
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
