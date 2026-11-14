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
 *   │ Accueil Caisse POS Stock Param. │  cinq onglets, selon les droits
 *   └─────────────────────────────────┘
 *
 * Le hamburger ouvre le tiroir, qui EST la barre latérale du web : les mêmes
 * sections, dans le même ordre, avec les mêmes libellés et les mêmes glyphes,
 * et comme sur le web seulement celles que le rôle peut ouvrir.
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

import { IndicateurSync } from "@/features/sync/indicateur";
import { styleBarreOnglets } from "@/navigation/metriques";
import { ecransDeLaBarre } from "@/navigation/onglets";
import { TiroirProvider, useTiroir } from "@/navigation/tiroir";
import { useSession } from "@/session/provider";
import {
  IconBrute,
  TopBar,
  useMargesSysteme,
  useTheme,
} from "@/ui";
import { ClocheNotifications } from "@/notifications/cloche";

function Coquille() {
  const { colors } = useTheme();
  // ⚠ LA BARRE D'ONGLETS LIT L'INSET ELLE-MÊME, et c'est le seul endroit de
  // l'application où on ne peut pas l'en empêcher. Quand le système annonce
  // zéro alors qu'il dessine une barre, elle se pose DESSUS - à l'endroit le
  // plus tapé de l'application, cinq cibles permanentes. `styleBarreOnglets`
  // reprend sa formule avec la marge corrigée.
  const { bas } = useMargesSysteme();
  const { ouvrir } = useTiroir();
  const { snapshot, can } = useSession();
  // Cinq boutons, choisis selon les droits. ⚠ L'ORDRE des écrans, lui, ne
  // bouge jamais : le réordonner barre montée fait planter Fabric. Voir
  // `onglets.ts`.
  const ecrans = ecransDeLaBarre(can);

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => (
          <TopBar
            nomUtilisateur={snapshot?.user.full_name}
            // Le témoin s'abonne LUI-MÊME à l'état de synchronisation : le lire
            // ici le ferait remonter dans `Coquille`, donc re-rendre tout le
            // `Tabs` à chaque battement d'un cycle.
            //
            // ⚠ DEUX PIÈCES, UN SEUL EMPLACEMENT, et c'est voulu : `src/ui/`
            // reste PUR, donc la barre ne connaît ni les notifications ni la
            // synchronisation - elles entrent par ici. La cloche d'abord : ce
            // qui APPORTE une information passe avant ce qui en décrit l'état.
            right={
              <>
                <ClocheNotifications />
                <IndicateurSync />
              </>
            }
            onMenu={ouvrir}
            onAvatar={() => router.push("/profil")}
          />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          ...styleBarreOnglets(bas),
        },
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
      }}
    >
      {ecrans.map((e) => (
        <Tabs.Screen
          key={e.nom}
          name={e.nom}
          options={{
            title: e.titre,
            tabBarLabel: e.bouton ?? e.titre,
            // `href: null` retire le BOUTON, jamais la route : une section sans
            // bouton reste atteignable depuis le tiroir, et elle y garde sa barre
            // d'onglets.
            href: e.bouton ? undefined : null,
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
