/**
 * La coquille : barre du haut, barre d'onglets.
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
 * Le tiroir (`TiroirProvider`) vit un cran plus haut, dans `(app)/_layout.tsx` :
 * il couvre la barre d'onglets ET le rail d'une tablette, qui reste à l'écran
 * sur les fiches de pile.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SUR UNE TABLETTE, LA BARRE D'ONGLETS N'EST PAS RENDUE.                  │
 * │                                                                          │
 * │ La barre latérale ou le rail portent la navigation (`barre-laterale.tsx`)│
 * │ et une seconde navigation en bas de l'écran ne ferait que répéter la     │
 * │ première. La scène prend alors la marge du bas elle-même : c'était la    │
 * │ barre d'onglets qui la portait, et les écrans d'onglet passent           │
 * │ `edges={[]}`. Le bord garde un seul propriétaire, quelle que soit la     │
 * │ forme. Les `Tabs.Screen` restent tous déclarés, dans le même ordre :     │
 * │ seul l'affichage de la barre change, jamais la liste des écrans (la      │
 * │ réordonner barre montée fait planter Fabric, voir `onglets.ts`).         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `Tabs` vient d'`expo-router`, qui VENDORISE react-navigation depuis le SDK
 * 57. Ne pas installer `@react-navigation/bottom-tabs` : deux copies de
 * react-navigation donneraient un contexte de navigation vide à l'exécution.
 */
import { Tabs, router } from "expo-router";

import { IndicateurSync } from "@/features/sync/indicateur";
import { styleBarreOnglets } from "@/navigation/metriques";
import { ecransDeLaBarre } from "@/navigation/onglets";
import { useTiroir } from "@/navigation/tiroir";
import { useSession } from "@/session/provider";
import {
  IconBrute,
  TopBar,
  useDisposition,
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
  const { navigation } = useDisposition();
  const avecBarre = navigation === "barre";
  const { snapshot, can } = useSession();
  // Cinq boutons, choisis selon les droits. ⚠ L'ORDRE des écrans, lui, ne
  // bouge jamais : le réordonner barre montée fait planter Fabric. Voir
  // `onglets.ts`.
  const ecrans = ecransDeLaBarre(can);

  return (
    <Tabs
      tabBar={avecBarre ? undefined : () => null}
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
            onMenu={avecBarre ? ouvrir : undefined}
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
        sceneStyle: avecBarre
          ? undefined
          : { paddingBottom: bas, backgroundColor: colors.background },
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
  return <Coquille />;
}
