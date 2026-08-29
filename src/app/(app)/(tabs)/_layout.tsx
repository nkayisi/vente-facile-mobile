/**
 * La barre d'onglets.
 *
 * Cinq emplacements, le dernier toujours « Plus ». Les quatre premiers
 * dépendent du rôle : c'est l'ergonomie du pouce, propre au mobile. « Plus »,
 * lui, est la barre latérale du back-office à l'identique.
 *
 * `Tabs` vient d'`expo-router`, qui VENDORISE react-navigation depuis le SDK
 * 57. **Ne pas installer `@react-navigation/bottom-tabs`** : le paquet du
 * registre n'est pas résoluble ici, et deux copies de react-navigation
 * donneraient un contexte de navigation vide à l'exécution.
 */
import { Tabs } from "expo-router";

import { MENU } from "@/navigation/menu";
import { ONGLET_PLUS, ONGLET_VENDRE, ongletsPourRole } from "@/navigation/onglets";
import { useSession } from "@/session/provider";
import { IconBrute, useTheme, type IconName } from "@/ui";

/**
 * Titre COURT de la barre, quand le libellé du menu ne tient pas.
 *
 * Un bouton d'onglet dispose d'un cinquième de la largeur, soit une centaine de
 * points : « Tableau de bord » y sort en « Tableau de b… », et une étiquette
 * tronquée ne se lit pas. Le libellé EXACT du back-office reste porté par
 * l'écran « Plus », qui est le miroir de la barre latérale ; la barre
 * d'onglets, elle, est l'ajout mobile et peut abréger.
 *
 * Écart volontaire, à lister dans la check-list de parité.
 */
const TITRE_COURT: Record<string, string> = {
  index: "Accueil",
  articles: "Produits",
  caisse: "Caisse",
  rapports: "Rapports",
  contacts: "Clients",
  utilisateurs: "Utilisateurs",
  parametres: "Réglages",
};

/** Titre et glyphe de chaque onglet déclaré, sections du menu comprises. */
const ECRANS: { nom: string; titre: string; icon: IconName }[] = [
  ...MENU.map((e) => ({ nom: e.cle, titre: TITRE_COURT[e.cle] ?? e.label, icon: e.icon })),
  // Propres au mobile : le comptoir et le tiroir « Plus » n'ont pas de miroir
  // dans la barre latérale du web.
  { nom: ONGLET_VENDRE, titre: "Vendre", icon: "ShoppingCart" },
  { nom: "mouvements", titre: "Mouvements", icon: "ClipboardList" },
  // « Mon profil » n'est pas une entrée du menu, sur le web non plus : il vit
  // dans le menu avatar de l'en-tête, et ici dans le pied de « Plus ».
  { nom: "profil", titre: "Mon profil", icon: "User" },
  { nom: ONGLET_PLUS, titre: "Plus", icon: "Menu" },
];

/**
 * Range les ecrans pour que la BARRE suive l'ordre du role.
 *
 * `Tabs` place les boutons dans l'ordre de DECLARATION des `Tabs.Screen`, pas
 * dans celui de `TAB_SETS`. Sans ce tri, un proprietaire voyait « Tableau de
 * bord, Ventes, Stock, Vendre » alors que le plan pose « Tableau de bord,
 * Vendre, Ventes, Stock » : « Vendre » doit etre en deuxieme position, la ou le
 * pouce l'atteint, et non renvoye en quatrieme parce qu'il est declare apres
 * les entrees du menu.
 *
 * Les ecrans hors du jeu du role suivent, dans leur ordre d'origine : ils n'ont
 * pas de bouton, leur rang ne se voit pas.
 */
function ordonner<T extends { nom: string }>(ecrans: T[], visibles: readonly string[]): T[] {
  const rang = (e: T) => {
    const i = visibles.indexOf(e.nom);
    return i === -1 ? visibles.length + ecrans.indexOf(e) : i;
  };
  return [...ecrans].sort((a, b) => rang(a) - rang(b));
}

export default function TabsLayout() {
  const { snapshot } = useSession();
  const role = snapshot?.membership?.role ?? null;
  const visibles = ongletsPourRole(role);
  const { colors } = useTheme();

  return (
    <Tabs
      // Sans cette clé, changer d'organisation - donc de rôle - laisse la barre
      // sur l'ancien jeu jusqu'au redémarrage de l'application.
      key={role ?? "sans-role"}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
      }}
    >
      {ordonner(ECRANS, visibles).map((e) => (
        <Tabs.Screen
          key={e.nom}
          name={e.nom}
          options={{
            title: e.titre,
            // `href: null` retire le BOUTON, pas la route : la section reste
            // atteignable depuis « Plus », et elle y garde sa barre d'onglets.
            // `Tabs.Protected` ferait le contraire - il rend la route
            // inatteignable - et casserait donc l'accès depuis « Plus ».
            href: visibles.includes(e.nom) ? undefined : null,
            tabBarIcon: ({ color }) => <IconBrute name={e.icon} color={color} size={22} />,
          }}
        />
      ))}
    </Tabs>
  );
}
