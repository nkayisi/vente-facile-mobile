/**
 * Le contenu du tiroir : la barre latérale du back-office, à l'identique.
 *
 * Quatre blocs, dans l'ordre exact du web : l'en-tête de marque (logo,
 * « Vente » puis « Facile » en orange, et la croix de fermeture),
 * l'établissement, les sections, et l'avatar du compte en pied.
 *
 * **L'entrée active est en plein orange avec un chevron**, comme sur le web.
 * Elle se lit par `sectionDeLaRoute` (`menu.ts`), qui range aussi les fiches :
 * sur une tablette la barre reste à l'écran pendant qu'on lit une vente, et
 * « Ventes » doit rester allumé sous `/vente/…`.
 *
 * **Deux formes, un seul contenu.** Sur un téléphone, ce menu est le tiroir
 * du hamburger. Sur un grand écran, il est la barre latérale FIXE
 * (`permanent`) : la croix devient le bouton qui la replie en rail, et le
 * comptoir y paraît en tête, puisque la barre d'onglets - où il vit sur un
 * téléphone - n'est plus rendue.
 *
 * **Seules les sections que le rôle peut ouvrir sont listées**, comme sur le
 * web. Elles étaient grisées, avec une pastille « Réservé au gérant » : un
 * caissier lisait six entrées sur onze qu'il ne pouvait pas ouvrir. Voir
 * `entreesDuMenu`.
 */
import { ScrollView, View } from "react-native";
import { usePathname } from "expo-router";
import { ROLE_LABELS } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { etablissement } from "@/data/organisation";
import { useDeconnexion } from "@/session/deconnexion";
import { pastilleOperations } from "@/features/sync/journal-lisible";
import { useSession } from "@/session/provider";
import { countByState } from "@/sync";
import {
  Avatar,
  Badge,
  Divider,
  Icon,
  Logo,
  Pressable,
  Text,
  useMargesSysteme,
  useRepliNavigation,
} from "@/ui";
import { HIT } from "@/ui/tokens";
import { allerA } from "./aller";
import { fermerPuis } from "./fermeture";
import { SECTION_COMPTOIR, entreesDuMenu, sectionDeLaRoute } from "./menu";
import { PERMISSION_DU_COMPTOIR } from "./onglets";

export function MenuLateral({
  onFermer,
  permanent = false,
}: {
  onFermer: () => void;
  /** La barre latérale fixe d'un grand écran, et non le tiroir. */
  permanent?: boolean;
}) {
  const marges = useMargesSysteme();
  const chemin = usePathname();
  const { snapshot, can } = useSession();
  const { demander } = useDeconnexion();
  const { basculer } = useRepliNavigation();
  const { donnees: etab } = useLecture(etablissement, { tables: ["organizations"] });
  // Le journal se relit dès qu'il change : une opération refusée pendant que le
  // tiroir est ouvert fait paraître sa pastille sans rouvrir le menu.
  const { donnees: journal } = useLecture(countByState, { tables: ["outbox_operations"] });
  const pastille = journal ? pastilleOperations(journal) : null;

  const entrees = entreesDuMenu(can);
  const active = sectionDeLaRoute(chemin);
  const role = snapshot?.membership?.role ?? null;

  /**
   * Ferme le tiroir, puis va quelque part : une section se REJOINT, une
   * destination de pile se pousse. Voir `fermeture.ts` et `aller.ts`.
   */
  const aller = (href: string) => fermerPuis(onFermer, () => allerA(href, chemin));

  return (
    <View className="flex-1 bg-card" style={{ paddingTop: marges.haut }}>
      {/* 1. Marque, exactement comme le web : « Vente » puis « Facile » orange. */}
      <View className="flex-row items-center justify-between border-b border-border pr-2">
        <View className="flex-row items-center">
          {/* ⚠ L'encre GRANDIT à hauteur de rangée égale, et c'est le
              correctif : `logo.png` est un carré dont plus de la moitié est
              du vide transparent, si bien qu'une boîte de 68 points n'en
              rendait que 51. `Logo` lit l'encre seule. */}
          <Logo hauteur={68} nomAilleurs className="mr-1" />
          <Text variant="h4">
            Vente<Text className="text-xl text-primary">Facile</Text>
          </Text>
        </View>
        {permanent ? (
          // La barre fixe ne se FERME pas, elle se replie en rail ; le choix
          // est retenu d'une session à l'autre (`navigation.repliee`).
          <Pressable
            onPress={fermerPuis(onFermer, basculer)}
            accessibilityRole="button"
            accessibilityLabel="Replier le menu"
            className="items-center justify-center rounded-lg"
            style={{ width: HIT.min, height: HIT.min }}
          >
            <Icon name="PanelLeftClose" size={20} color="mutedForeground" />
          </Pressable>
        ) : (
          <Pressable
            onPress={fermerPuis(onFermer)}
            accessibilityRole="button"
            accessibilityLabel="Fermer le menu"
            className="items-center justify-center rounded-lg"
            style={{ width: HIT.min, height: HIT.min }}
          >
            <Icon name="X" size={20} color="mutedForeground" />
          </Pressable>
        )}
      </View>

      {/* 2. Établissement. */}
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-4">
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-accent">
          <Icon name="Store" size={20} color="accentForeground" />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="label" numberOfLines={1}>
            {snapshot?.organization.name ?? "Établissement"}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {etab?.typeAffiche ?? " "}
          </Text>
        </View>
      </View>

      {/* 3. Les sections que le rôle peut ouvrir. */}
      <ScrollView className="flex-1" contentContainerStyle={{ paddingVertical: 12 }}>
        {/*
          Le comptoir, en tête de la barre FIXE seulement. Sur un téléphone il
          vit au centre de la barre d'onglets ; un grand écran ne rend pas
          cette barre, et sans cette entrée on n'atteindrait la vente qu'en
          passant par le hub Ventes. C'est un BOUTON, et non une ligne du
          menu : `MENU` est le miroir exact du back-office, et le geste le
          plus fréquent de la journée mérite d'être distingué d'une section.
        */}
        {permanent && can(PERMISSION_DU_COMPTOIR) ? (
          <View className="px-3 pb-2">
            <Pressable
              onPress={aller("/vendre")}
              haptic="selection"
              accessibilityRole="link"
              accessibilityState={{ selected: active === SECTION_COMPTOIR }}
              accessibilityLabel="Point de vente"
              className="flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4"
              style={{ minHeight: HIT.min }}
            >
              <Icon name="ShoppingCart" size={18} color="primaryForeground" />
              <Text variant="label" className="text-primary-foreground">
                Vendre
              </Text>
            </Pressable>
          </View>
        ) : null}
        {entrees.map((e) => {
          const estActive = e.cle === active;
          return (
            <View key={e.cle} className="px-3 py-0.5">
              <Pressable
                onPress={aller(e.href)}
                haptic="selection"
                accessibilityRole="link"
                accessibilityState={{ selected: estActive }}
                accessibilityLabel={e.label}
                className={`flex-row items-center gap-3 rounded-lg px-4 py-2.5${
                  estActive ? " bg-primary" : ""
                }`}
              >
                <Icon
                  name={e.icon}
                  size={18}
                  color={estActive ? "primaryForeground" : "foreground"}
                />
                <Text
                  variant="bodySmall"
                  numberOfLines={1}
                  className={
                    estActive
                      ? "flex-1 font-sans-medium text-primary-foreground"
                      : "flex-1 font-sans-medium text-foreground"
                  }
                >
                  {e.label}
                </Text>
                {estActive ? (
                  <Icon name="ChevronRight" size={16} color="primaryForeground" />
                ) : null}
              </Pressable>
            </View>
          );
        })}

        <Divider />

        {/*
          ┌──────────────────────────────────────────────────────────────────┐
          │ « MA JOURNÉE » NE PEUT PAS VIVRE DANS `MENU`.                   │
          │                                                                  │
          │ `MENU` est recopié ligne à ligne de la barre latérale du web, et  │
          │ `menu.test.ts` compare les libellés, les glyphes, les permissions │
          │ ET la longueur : y ajouter une entrée propre au mobile ferait     │
          │ échouer trois assertions, à juste titre - c'est ce test qui       │
          │ empêche les deux surfaces de dériver.                             │
          │                                                                  │
          │ Elle est donc dans son propre bloc, et le registre est différent  │
          │ de celui du menu : les entrées ci-dessus sont les SECTIONS        │
          │ de l'établissement, celle-ci est MA lecture.                      │
          │                                                                  │
          │ Elle est ouverte à tous les rôles, et c'est tout son objet : les  │
          │ huit onglets de « Rapports & statistiques » sont gardés par       │
          │ `reports.view`, accordé au seul propriétaire et au gérant. Un     │
          │ caissier n'avait donc aucune lecture de sa propre journée, ce qui  │
          │ est la contrepartie du cloisonnement.                             │
          └──────────────────────────────────────────────────────────────────┘
        */}
        <View className="px-3 pt-2">
          <Text variant="caption" className="px-4 pb-1 uppercase">
            Moi
          </Text>
          <Pressable
            onPress={aller("/(app)/ma-journee")}
            haptic="selection"
            accessibilityRole="link"
            accessibilityLabel="Ma journée : mes ventes, mes encaissements, mes dépenses"
            className="flex-row items-center gap-3 rounded-lg px-4 py-2.5"
          >
            <Icon name="CalendarCheck" size={18} color="foreground" />
            <Text variant="bodySmall" className="flex-1 font-sans-medium text-foreground">
              Ma journée
            </Text>
          </Pressable>
        </View>

        <Divider />

        {/* Bloc propre au terminal : sans miroir dans le back-office. */}
        <View className="px-3 pt-2">
          <Text variant="caption" className="px-4 pb-1 uppercase">
            Cet appareil
          </Text>
          {[
            { titre: "Synchronisation", icon: "CloudDownload" as const, href: "/(app)/appareil/synchronisation", pastille: null },
            // L'écran où un refus du serveur devient lisible et se corrige. Il
            // porte sa PASTILLE (refusées + bloquées) : sans elle, le marchand
            // n'avait aucune raison d'ouvrir cet écran, et une vente refusée
            // restait en quarantaine des jours. Voir `journal-lisible.ts`.
            { titre: "Opérations à corriger", icon: "AlertTriangle" as const, href: "/(app)/appareil/operations", pastille },
            { titre: "Imprimante", icon: "Printer" as const, href: "/(app)/appareil/imprimante", pastille: null },
            // ⚠ SANS CETTE ENTRÉE, L'ÉCRAN DE DIAGNOSTIC N'EXISTE POUR PERSONNE.
            // Il a été écrit pour qu'un marchand chez qui la barre du système
            // recouvre le bas de l'écran puisse nous envoyer un relevé - et il
            // n'était câblé nulle part. Un outil qu'on ne peut pas atteindre ne
            // sert qu'à celui qui l'a écrit.
            { titre: "Diagnostic d'affichage", icon: "Ruler" as const, href: "/(app)/appareil/affichage", pastille: null },
          ].map((a) => (
            <Pressable
              key={a.href}
              onPress={aller(a.href)}
              haptic="selection"
              accessibilityRole="link"
              accessibilityLabel={a.pastille ? a.pastille.etiquette : a.titre}
              className="flex-row items-center gap-3 rounded-lg px-4 py-2.5"
            >
              <Icon name={a.icon} size={18} color="mutedForeground" />
              <Text variant="bodySmall" className="flex-1 text-muted-foreground">
                {a.titre}
              </Text>
              {a.pastille ? <Badge tone={a.pastille.ton}>{a.pastille.texte}</Badge> : null}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* 4. Compte, en pied comme l'avatar du web. */}
      <View
        className="flex-row items-center gap-3 border-t border-border px-4 py-3"
        style={{ paddingBottom: marges.bas + 12 }}
      >
        <Pressable
          onPress={aller("/profil")}
          accessibilityRole="link"
          accessibilityLabel="Mon profil"
          className="flex-row items-center gap-3"
        >
          <Avatar nom={snapshot?.user.full_name} taille={36} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
            {snapshot?.user.full_name ?? ""}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {role ? ROLE_LABELS[role] : ""}
          </Text>
        </View>
        <Pressable
          onPress={fermerPuis(onFermer, demander)}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
          className="items-center justify-center rounded-lg"
          style={{ width: HIT.min, height: HIT.min }}
        >
          <Icon name="LogOut" size={20} color="destructive" />
        </Pressable>
      </View>
    </View>
  );
}
