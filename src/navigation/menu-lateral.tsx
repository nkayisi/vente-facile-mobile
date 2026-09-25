/**
 * Le contenu du tiroir : la barre latérale du back-office, à l'identique.
 *
 * Quatre blocs, dans l'ordre exact du web : l'en-tête de marque (logo,
 * « Vente » puis « Facile » en orange, et la croix de fermeture),
 * l'établissement, les onze sections, et l'avatar du compte en pied.
 *
 * **L'entrée active est en plein orange avec un chevron**, comme sur le web, et
 * elle se calcule comme lui : parmi les entrées dont le chemin est un préfixe
 * du chemin courant, on retient LA PLUS LONGUE. Sans cette règle,
 * `/stock/niveaux` allumerait « Tableau de bord », dont le chemin `/` est
 * préfixe de tout.
 *
 * **Les onze entrées sont TOUJOURS là.** Le web retire celles hors droits ; le
 * plan approuvé dit de les griser, et le plan gagne : un caissier qui ne voit
 * jamais « Stock » ne sait pas que la fonction existe ni qu'il peut la demander.
 */
import { ScrollView, View } from "react-native";
import { router, usePathname } from "expo-router";
import { ROLE_LABELS } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { etablissement } from "@/data/organisation";
import { useDeconnexion } from "@/session/deconnexion";
import { useSession } from "@/session/provider";
import {
  Avatar,
  Badge,
  Divider,
  Icon,
  Logo,
  Pressable,
  Text,
  useMargesSysteme,
  useToast,
} from "@/ui";
import { HIT } from "@/ui/tokens";
import { fermerPuis } from "./fermeture";
import { entreesDuMenu, type EtatEntree } from "./menu";

/** Entrée active : le préfixe le PLUS LONG qui corresponde, comme sur le web. */
function cleActive(chemin: string, entrees: EtatEntree[]): string | null {
  const candidates = entrees.filter(
    (e) => chemin === e.href || (e.href !== "/" && chemin.startsWith(`${e.href}/`))
  );
  if (candidates.length === 0) return chemin === "/" ? "index" : null;
  return candidates.reduce((a, b) => (b.href.length > a.href.length ? b : a)).cle;
}

export function MenuLateral({ onFermer }: { onFermer: () => void }) {
  const marges = useMargesSysteme();
  const chemin = usePathname();
  const { snapshot, can } = useSession();
  const { demander } = useDeconnexion();
  const { donnees: etab } = useLecture(etablissement, { tables: ["organizations"] });
  const toast = useToast();

  const entrees = entreesDuMenu(can);
  const active = cleActive(chemin, entrees);
  const role = snapshot?.membership?.role ?? null;

  /** Ferme le tiroir, puis va quelque part. Voir `fermeture.ts`. */
  const aller = (href: string) => fermerPuis(onFermer, () => router.push(href as never));

  /**
   * Une entrée hors droits se referme AUSSI, et dit pourquoi.
   *
   * Elle était simplement inerte : le marchand appuyait, rien ne bougeait, et
   * rien ne distinguait « vous n'avez pas le droit » de « l'application est
   * bloquée ». La pastille est pourtant à côté - mais on n'appuie pas sur une
   * entrée qu'on vient de lire. Le motif part donc dans un toast, qui survit à
   * la fermeture du tiroir, et le retour haptique est celui d'un REFUS.
   */
  const refuser = (raison: string | null) =>
    fermerPuis(onFermer, raison ? () => toast.info(raison) : undefined);

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
        <Pressable
          onPress={fermerPuis(onFermer)}
          accessibilityRole="button"
          accessibilityLabel="Fermer le menu"
          className="items-center justify-center rounded-lg"
          style={{ width: HIT.min, height: HIT.min }}
        >
          <Icon name="X" size={20} color="mutedForeground" />
        </Pressable>
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

      {/* 3. Les onze sections. */}
      <ScrollView className="flex-1" contentContainerStyle={{ paddingVertical: 12 }}>
        {entrees.map((e) => {
          const estActive = e.cle === active;
          return (
            <View key={e.cle} className="px-3 py-0.5">
              <Pressable
                onPress={e.accessible ? aller(e.href) : refuser(e.raison)}
                haptic={e.accessible ? "selection" : "warning"}
                accessibilityRole="link"
                accessibilityState={{ selected: estActive }}
                accessibilityLabel={e.raison ? `${e.label}. ${e.raison}` : e.label}
                className={`flex-row items-center gap-3 rounded-lg px-4 py-2.5${
                  estActive ? " bg-primary" : ""
                }${e.accessible ? "" : " opacity-50"}`}
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
                {e.raison ? (
                  <Badge tone="neutral">{e.raison}</Badge>
                ) : estActive ? (
                  <Icon name="ChevronRight" size={16} color="primaryForeground" />
                ) : null}
              </Pressable>
            </View>
          );
        })}

        <Divider />

        {/* Bloc propre au terminal : sans miroir dans le back-office. */}
        <View className="px-3 pt-2">
          <Text variant="caption" className="px-4 pb-1 uppercase">
            Cet appareil
          </Text>
          {[
            { titre: "Synchronisation", icon: "CloudDownload" as const, href: "/(app)/appareil/synchronisation" },
            // Le SEUL endroit où un refus du serveur devient lisible. L'écran
            // Synchronisation porte bien un bandeau pour la quarantaine, mais
            // AUCUN pour les opérations bloquées : sans cette entrée, une
            // opération retenue par un abonnement impayé n'a plus aucun chemin.
            { titre: "Opérations à corriger", icon: "AlertTriangle" as const, href: "/(app)/appareil/operations" },
            { titre: "Imprimante", icon: "Printer" as const, href: "/(app)/appareil/imprimante" },
            // ⚠ SANS CETTE ENTRÉE, L'ÉCRAN DE DIAGNOSTIC N'EXISTE POUR PERSONNE.
            // Il a été écrit pour qu'un marchand chez qui la barre du système
            // recouvre le bas de l'écran puisse nous envoyer un relevé - et il
            // n'était câblé nulle part. Un outil qu'on ne peut pas atteindre ne
            // sert qu'à celui qui l'a écrit.
            { titre: "Diagnostic d'affichage", icon: "Ruler" as const, href: "/(app)/appareil/affichage" },
          ].map((a) => (
            <Pressable
              key={a.href}
              onPress={aller(a.href)}
              haptic="selection"
              accessibilityRole="link"
              accessibilityLabel={a.titre}
              className="flex-row items-center gap-3 rounded-lg px-4 py-2.5"
            >
              <Icon name={a.icon} size={18} color="mutedForeground" />
              <Text variant="bodySmall" className="flex-1 text-muted-foreground">
                {a.titre}
              </Text>
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
