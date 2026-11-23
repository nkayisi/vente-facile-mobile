/**
 * La coquille d'un grand écran : la barre latérale fixe, ou son rail.
 *
 *   téléphone          tablette étroite           grand écran
 *   ┌──────────┐      ┌───┬──────────────┐       ┌────────┬──────────────┐
 *   │ ☰  page  │      │ ▷ │              │       │ Vente  │              │
 *   │          │      │ ▣ │     page     │       │ Facile │     page     │
 *   │          │      │ ◎ │              │       │ sections│             │
 *   ├──────────┤      │ ◎ │              │       │        │              │
 *   │ onglets  │      └───┴──────────────┘       └────────┴──────────────┘
 *   └──────────┘        rail, 80 points          barre fixe, 256 à 320
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA MÊME NAVIGATION, RÉARRANGÉE.                                         │
 * │                                                                          │
 * │ La barre fixe EST le tiroir du téléphone (`MenuLateral`), avec les       │
 * │ mêmes sections, dans le même ordre que le back-office. Le rail en garde  │
 * │ les glyphes et les étiquettes courtes, TOUTES les entrées comprises.     │
 * │ Un marchand qui tourne sa tablette ou passe de son ordinateur à son      │
 * │ terminal ne réapprend rien, et rien ne se cache derrière un bouton.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ L'ARBRE NE CHANGE PAS DE FORME QUAND LA NAVIGATION CHANGE. La page vit
 * toujours au même rang de la même rangée, et la colonne de navigation est un
 * frère qui paraît ou disparaît. Rendre la page seule sur un téléphone et dans
 * une rangée sur une tablette REMONTERAIT toute la pile au moment où une
 * tablette en écran partagé passe sous 600 points : l'historique de navigation
 * repartirait de zéro sous les doigts du marchand.
 *
 * ⚠ LA LARGEUR DE LA PAGE EST CALCULÉE, JAMAIS MESURÉE : fenêtre moins
 * navigation moins marges du système. Un `onLayout` ferait dessiner chaque
 * écran une première fois à la largeur de la fenêtre, puis sauter.
 */
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { usePathname } from "expo-router";

import { useLecture } from "@/data/live";
import { pastilleOperations } from "@/features/sync/journal-lisible";
import { useDeconnexion } from "@/session/deconnexion";
import { useSession } from "@/session/provider";
import { countByState } from "@/sync";
import {
  Divider,
  Icon,
  Pressable,
  Text,
  Volet,
  useDisposition,
  useMargesSysteme,
  useRepliNavigation,
  type IconName,
} from "@/ui";
import { depliageDuRail, largeurDeNavigation } from "@/ui/disposition-regles";
import { HIT } from "@/ui/tokens";
import { allerA, allerALaSection } from "./aller";
import { MenuLateral } from "./menu-lateral";
import {
  CLE_OPERATIONS,
  ENTREES_APPAREIL,
  ENTREE_MA_JOURNEE,
  SECTION_COMPTOIR,
  entreesDuMenu,
  sectionDeLaRoute,
} from "./menu";
import { PERMISSION_DU_COMPTOIR, ongletDeLaSection } from "./onglets";
import { useTiroir } from "./tiroir";

/** La barre fixe ne se ferme pas : son « fermer » ne fait rien. */
const RIEN = () => {};

export function CoquilleAdaptative({ children }: { children: ReactNode }) {
  const { navigation, fenetre } = useDisposition();
  const marges = useMargesSysteme();
  const avecColonne = navigation !== "barre";
  const largeurColonne = avecColonne ? largeurDeNavigation(navigation, fenetre.largeur) + marges.gauche : 0;
  // La marge DROITE revient à la page : en paysage, une encoche ou une barre
  // du système peut s'y trouver, et la barre latérale ne prend que la gauche.
  const droite = avecColonne ? marges.droite : 0;
  const largeurPage = Math.max(0, fenetre.largeur - largeurColonne - droite);

  return (
    <View className="flex-1 flex-row bg-background">
      {avecColonne ? (
        <View
          className="border-r border-border bg-card"
          style={{ width: largeurColonne, paddingLeft: marges.gauche }}
        >
          {navigation === "laterale" ? <MenuLateral permanent onFermer={RIEN} /> : <Rail />}
        </View>
      ) : null}
      <View className="min-w-0 flex-1" style={droite > 0 ? { paddingRight: droite } : undefined}>
        <Volet largeur={largeurPage}>{children}</Volet>
      </View>
    </View>
  );
}

function ElementDuRail({
  label,
  description,
  icon,
  actif,
  accent = false,
  pastille,
  onPress,
}: {
  label: string;
  /** Ce que le lecteur d'écran annonce : le libellé complet du menu. */
  description: string;
  icon: IconName;
  actif: boolean;
  /**
   * Le comptoir : un CONTOUR orange, comme « Vendre » dans la barre dépliée. Il
   * le distingue des sections sans se lire comme l'entrée active.
   */
  accent?: boolean;
  pastille?: "destructive" | "warning" | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      haptic="selection"
      accessibilityRole="link"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={description}
      className="items-center justify-center gap-0.5 py-1"
      // 52 et non 56 : le rail porte désormais TOUTES les entrées, et chaque
      // point repris ici en fait tenir davantage sans défiler. La cible reste
      // au-dessus des 44 du produit.
      style={{ minHeight: 52 }}
    >
      {/* Des coins de 8 points, pas une pilule : le rayon de la barre dépliée
          et du bouton « Déplier ». Une pilule pleine se lisait comme une
          puce de filtre posée dans un menu. */}
      <View
        className={`h-8 w-14 items-center justify-center rounded-lg ${
          accent ? "border border-primary " : ""
        }${actif ? "bg-primary/15" : ""}`}
      >
        <Icon name={icon} size={20} color={accent || actif ? "primary" : "mutedForeground"} />
        {pastille ? (
          <View
            className={`absolute right-2.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
              pastille === "destructive" ? "bg-destructive" : "bg-warning"
            }`}
          />
        ) : null}
      </View>
      <Text
        variant="caption"
        numberOfLines={1}
        className={actif ? "font-sans-medium text-primary" : "text-muted-foreground"}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Le rail : quatre-vingts points, un glyphe et une étiquette courte par entrée.
 *
 * Il sert la tablette étroite (une tablette portrait ne peut pas céder 256
 * points sans tomber à une largeur de téléphone), la barre fixe qu'on a
 * repliée, et le comptoir, où la grille et le panier veulent toute la place.
 *
 * ⚠ IL PORTE LES DESTINATIONS, dans l'ordre du menu complet : les sections,
 * « Ma journée », « Cet appareil » et la déconnexion (décision de l'utilisateur,
 * 2026-11-21). Le profil n'y figure pas : l'avatar de la barre du haut y mène
 * déjà, et le pied du menu déplié aussi.
 *
 * Son premier bouton DÉPLIE le menu, avec le même glyphe que celui qui le
 * replie : un hamburger annonçait un second menu, là où c'est le même.
 */
function Rail() {
  const chemin = usePathname();
  const { can } = useSession();
  const { demander } = useDeconnexion();
  const { classe } = useDisposition();
  const { basculer } = useRepliNavigation();
  const { ouvrir } = useTiroir();
  const marges = useMargesSysteme();
  // La pastille des opérations à corriger, sur SON entrée : sans elle, une
  // vente refusée resterait en quarantaine sans que rien ne le dise.
  const { donnees: journal } = useLecture(countByState, { tables: ["outbox_operations"] });
  const pastille = journal ? pastilleOperations(journal) : null;

  const active = sectionDeLaRoute(chemin);
  const entrees = entreesDuMenu(can);
  const deplier = depliageDuRail(classe, chemin) === "barre" ? basculer : ouvrir;

  return (
    <View className="flex-1" style={{ paddingTop: marges.haut, paddingBottom: marges.bas }}>
      {/* Sans marge verticale : son filet prolonge celui de la barre du haut. */}
      <View className="items-center border-b border-border">
        <Pressable
          onPress={deplier}
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel="Déplier le menu"
          className="items-center justify-center rounded-lg"
          style={{ width: HIT.min, height: HIT.min }}
        >
          <Icon name="PanelLeftOpen" size={20} color="mutedForeground" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingVertical: 6, gap: 2 }}>
        {can(PERMISSION_DU_COMPTOIR) ? (
          <ElementDuRail
            label="POS"
            description="Point de vente"
            icon="ShoppingCart"
            actif={active === SECTION_COMPTOIR}
            accent
            onPress={() => allerALaSection("/vendre", chemin)}
          />
        ) : null}
        {entrees.map((e) => {
          const onglet = ongletDeLaSection(e.cle);
          return (
            <ElementDuRail
              key={e.cle}
              label={onglet.label}
              description={e.label}
              icon={onglet.icon}
              actif={active === e.cle}
              onPress={() => allerALaSection(e.href, chemin)}
            />
          );
        })}

        <View className="my-1">
          <Divider />
        </View>
        <ElementDuRail
          label={ENTREE_MA_JOURNEE.court}
          description={ENTREE_MA_JOURNEE.label}
          icon={ENTREE_MA_JOURNEE.icon}
          actif={active === ENTREE_MA_JOURNEE.cle}
          onPress={() => allerA(ENTREE_MA_JOURNEE.href, chemin)}
        />

        <View className="my-1">
          <Divider />
        </View>
        {ENTREES_APPAREIL.map((a) => {
          const badge = a.cle === CLE_OPERATIONS ? pastille : null;
          return (
            <ElementDuRail
              key={a.cle}
              label={a.court}
              description={badge ? badge.etiquette : a.label}
              icon={a.icon}
              actif={active === a.cle}
              pastille={badge?.ton ?? null}
              onPress={() => allerA(a.href, chemin)}
            />
          );
        })}

        <View className="my-1">
          <Divider />
        </View>
        <ElementDuRail
          label="Quitter"
          description="Se déconnecter"
          icon="LogOut"
          actif={false}
          onPress={demander}
        />
      </ScrollView>
    </View>
  );
}
