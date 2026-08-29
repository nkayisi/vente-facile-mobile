/**
 * « Plus » : la barre latérale du back-office, à l'identique.
 *
 * C'est la pièce qui tient toute la promesse du lot. Un marchand qui quitte son
 * ordinateur pour son terminal doit retrouver LES MÊMES ENTRÉES, DANS LE MÊME
 * ORDRE, AVEC LES MÊMES LIBELLÉS ET LES MÊMES GLYPHES. La barre d'onglets est
 * l'ajout mobile ; ceci est le miroir.
 *
 * Quatre blocs, dans cet ordre : l'établissement (miroir du bloc de tête de la
 * barre latérale), les onze sections (miroir de la liste), « Cet appareil »
 * (ajout mobile, sans miroir), et le pied de compte (miroir du menu avatar).
 *
 * **Aucune des onze n'est jamais absente.** Le web les retire (`return null`
 * dans `sidebar.tsx`) ; le plan approuvé dit de les griser, et le plan gagne :
 * un caissier qui ne voit jamais « Stock » ne sait pas que la fonction existe,
 * ni qu'il peut la demander.
 */
import { View } from "react-native";
import { router } from "expo-router";
import { ROLE_LABELS } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { etablissement } from "@/data/organisation";
import { useSession } from "@/session/provider";
import { countByState } from "@/sync";
import {
  Avatar,
  Badge,
  Card,
  Divider,
  Icon,
  ListItem,
  Pressable,
  Screen,
  Section,
  Text,
} from "@/ui";
import { entreesDuMenu } from "@/navigation/menu";

export default function Plus() {
  const { snapshot, can, lock, logout } = useSession();
  const org = snapshot?.organization;
  const role = snapshot?.membership?.role ?? null;

  const { donnees: etab } = useLecture(etablissement, { tables: ["organizations"] });
  const { donnees: compteurs } = useLecture(countByState, { tables: ["outbox_operations"] });

  const entrees = entreesDuMenu(can);
  const enAttente = (compteurs?.pending ?? 0) + (compteurs?.inflight ?? 0);
  const enQuarantaine = compteurs?.quarantined ?? 0;

  return (
    <Screen scroll>
      {/* 1. Établissement : miroir du bloc de tête de la barre latérale web. */}
      <Pressable
        onPress={() => router.push("/parametres")}
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel={`${org?.name ?? "Établissement"}, ouvrir les paramètres`}
        className="mb-5 mt-2 flex-row items-center gap-3"
      >
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-accent">
          <Icon name="Store" size={20} color="accentForeground" />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="label" numberOfLines={1}>
            {org?.name ?? "Établissement"}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {etab?.typeAffiche ?? " "}
          </Text>
        </View>
        <Icon name="ChevronRight" size={18} color="mutedForeground" />
      </Pressable>

      {/* 2. Les onze sections, dans l'ordre du web, sans regroupement. */}
      <Card className="mb-6 overflow-hidden p-0">
        {entrees.map((e, i) => (
          <View key={e.cle}>
            {i > 0 ? <Divider inset /> : null}
            <ListItem
              title={e.label}
              icon={e.icon}
              onPress={e.accessible ? () => router.push(e.href as never) : undefined}
              chevron={e.accessible}
              // Hors droits : grisé, et la RAISON à la place du chevron.
              // Pas encore câblée : accessible, mais annoncée.
              trailing={
                e.raison ? (
                  <Badge tone="neutral">{e.raison}</Badge>
                ) : e.bientot ? (
                  <Badge tone="neutral">Bientôt</Badge>
                ) : undefined
              }
              className={e.accessible ? undefined : "opacity-50"}
            />
          </View>
        ))}
      </Card>

      {/* 3. Cet appareil : ajout mobile, aucun miroir dans le back-office. */}
      <Section title="Cet appareil">
        <Card className="overflow-hidden p-0">
          <ListItem
            title="Synchronisation"
            icon="CloudDownload"
            value={enAttente > 0 ? `${enAttente} en attente` : undefined}
            onPress={() => router.push("/(app)/appareil/synchronisation")}
            chevron
          />
          <Divider inset />
          <ListItem
            title="Opérations à corriger"
            icon="AlertTriangle"
            value={enQuarantaine > 0 ? String(enQuarantaine) : undefined}
            valueTone={enQuarantaine > 0 ? "destructive" : "muted"}
            onPress={() => router.push("/(app)/appareil/operations")}
            chevron
          />
          <Divider inset />
          <ListItem
            title="Imprimante"
            icon="Printer"
            onPress={() => router.push("/(app)/appareil/imprimante")}
            chevron
          />
          <Divider inset />
          <ListItem
            title="Apparence"
            icon="Settings"
            onPress={() => router.push("/(app)/appareil/apparence")}
            chevron
          />
        </Card>
      </Section>

      {/* 4. Pied de compte : miroir du menu avatar du back-office. */}
      <Section title="Mon compte">
        <Card className="overflow-hidden p-0">
          <ListItem
            title={snapshot?.user.full_name ?? "Mon profil"}
            subtitle={role ? ROLE_LABELS[role] : undefined}
            leading={<Avatar nom={snapshot?.user.full_name} taille={36} />}
            onPress={() => router.push("/profil")}
            chevron
          />
          <Divider inset />
          <ListItem title="Verrouiller" icon="Lock" onPress={lock} />
          <Divider inset />
          <ListItem
            title="Se déconnecter"
            icon="LogOut"
            valueTone="destructive"
            onPress={() => void logout()}
          />
        </Card>
      </Section>
    </Screen>
  );
}
