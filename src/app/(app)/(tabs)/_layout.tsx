/**
 * La coquille : tiroir, barre du haut, barre d'onglets.
 *
 * Disposition reprise du back-office en rendu étroit :
 *
 *   ┌─────────────────────────────────┐
 *   │ ☰                            (N)│  TopBar
 *   ├─────────────────────────────────┤
 *   │                                 │
 *   │           la page               │
 *   │                                 │
 *   ├─────────────────────────────────┤
 *   │ Accueil Caisse POS Stock Param. │  cinq onglets FIXES
 *   └─────────────────────────────────┘
 *
 * Le hamburger ouvre le tiroir, qui EST la barre latérale du web : les onze
 * sections, dans le même ordre, avec les mêmes libellés et les mêmes glyphes.
 *
 * `TiroirProvider` enveloppe `Tabs` et non l'inverse : c'est ce qui fait que le
 * voile du menu couvre AUSSI la barre d'onglets, comme sur le web où la barre
 * latérale passe par-dessus toute la page.
 *
 * `Tabs` vient d'`expo-router`, qui VENDORISE react-navigation depuis le SDK
 * 57. Ne pas installer `@react-navigation/bottom-tabs` : deux copies de
 * react-navigation donneraient un contexte de navigation vide à l'exécution.
 */
import { Tabs, router } from "expo-router";

import { MENU } from "@/navigation/menu";
import { NOMS_ONGLETS, ONGLETS } from "@/navigation/onglets";
import { TiroirProvider, useTiroir } from "@/navigation/tiroir";
import { useSession } from "@/session/provider";
import { IconBrute, TopBar, useTheme, type IconName } from "@/ui";

/**
 * Tous les écrans déclarés : les onglets d'abord (leur ordre est celui de la
 * barre), puis les sections atteintes seulement par le tiroir.
 */
const ECRANS: { nom: string; titre: string; icon: IconName }[] = [
  ...ONGLETS.map((o) => ({ nom: o.nom, titre: o.label, icon: o.icon })),
  ...MENU.filter((e) => !NOMS_ONGLETS.includes(e.cle)).map((e) => ({
    nom: e.cle,
    titre: e.label,
    icon: e.icon,
  })),
  // « Mon profil » n'est pas une entrée du menu, sur le web non plus : il vit
  // dans le menu avatar de l'en-tête, et ici dans le pied du tiroir.
  { nom: "profil", titre: "Mon profil", icon: "User" },
];

function Coquille() {
  const { colors } = useTheme();
  const { ouvrir } = useTiroir();
  const { snapshot } = useSession();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => (
          <TopBar
            nomUtilisateur={snapshot?.user.full_name}
            onMenu={ouvrir}
            onAvatar={() => router.push("/profil")}
          />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
      }}
    >
      {ECRANS.map((e) => (
        <Tabs.Screen
          key={e.nom}
          name={e.nom}
          options={{
            title: e.titre,
            // `href: null` retire le BOUTON, jamais la route : la section reste
            // atteignable depuis le tiroir, et elle y garde sa barre d'onglets.
            href: NOMS_ONGLETS.includes(e.nom) ? undefined : null,
            tabBarIcon: ({ color }) => <IconBrute name={e.icon} color={color} size={22} />,
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabsLayout() {
  return (
    <TiroirProvider>
      <Coquille />
    </TiroirProvider>
  );
}
