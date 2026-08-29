/**
 * Mon profil. Miroir de `app/dashboard/profil/page.tsx`.
 *
 * Tout vient de l'instantané de session, donc **l'écran s'affiche hors ligne**,
 * démarrage à froid compris. C'est la contrepartie de la règle du lot 1 : ce
 * que le serveur a dit une fois est relu du trousseau et jamais redemandé pour
 * afficher.
 *
 * En rendu étroit, le back-office centre le bloc avatar (`text-center
 * sm:text-left`) : on fait de même.
 */
import { View } from "react-native";
import { ROLE_LABELS } from "@vente-facile/core";

import { useSession } from "@/session/provider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  ListItem,
  PageHeader,
  Screen,
  Section,
  Text,
} from "@/ui";

function dateLisible(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("fr-CD", { day: "numeric", month: "long", year: "numeric" });
}

export default function Profil() {
  const { snapshot, lock, logout } = useSession();
  const u = snapshot?.user;
  const role = snapshot?.membership?.role ?? null;

  return (
    <Screen scroll edges={[]}>
      <PageHeader
        title="Mon profil"
        subtitle="Gérez vos informations personnelles et votre sécurité"
      />

      {/* Bloc avatar, centré comme le web en rendu étroit. */}
      <Card className="mt-4 items-center p-6">
        <Avatar nom={u?.full_name} taille={96} />
        <Text variant="h4" className="mt-4 text-center">
          {u?.full_name ?? "—"}
        </Text>
        <Text variant="muted" className="text-center">
          {u?.email ?? ""}
        </Text>
        <View className="mt-3 flex-row flex-wrap justify-center gap-2">
          <Badge tone="neutral">
            {`${snapshot?.organization.name ?? ""}${role ? ` - ${ROLE_LABELS[role]}` : ""}`}
          </Badge>
        </View>
      </Card>

      <Section title="Informations personnelles">
        <Card className="overflow-hidden p-0">
          <ListItem title="Prénom" value={u?.first_name?.trim() || "—"} />
          <Divider inset />
          <ListItem title="Nom" value={u?.last_name?.trim() || "—"} />
          <Divider inset />
          {/* L'e-mail n'est jamais modifiable, sur le web non plus. */}
          <ListItem title="Email" value={u?.email ?? "—"} />
          <Divider inset />
          <ListItem title="Téléphone" value={u?.phone?.trim() || "—"} />
        </Card>
      </Section>

      <Section title="Informations du compte">
        <Card className="overflow-hidden p-0">
          <ListItem title="Terminal" icon="Cpu" value={snapshot?.device?.device_code ?? "—"} />
          <Divider inset />
          <ListItem
            title="Session valide jusqu'au"
            icon="Calendar"
            value={dateLisible(snapshot?.device?.expires_at)}
          />
          <Divider inset />
          <ListItem
            title="Droits chargés"
            icon="Key"
            value={String(snapshot?.membership?.permissions.length ?? 0)}
          />
        </Card>
      </Section>

      <Section title="Sécurité">
        <Card className="p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Icon name="Lock" size={18} color="mutedForeground" />
            </View>
            <View className="min-w-0 flex-1">
              <Text variant="label">Mot de passe</Text>
              <Text variant="caption">
                Le changement de mot de passe arrive au lot 11.
              </Text>
            </View>
          </View>
          <View className="mt-4 gap-2">
            <Button variant="outline" fullWidth leftIcon="Lock" onPress={lock}>
              Verrouiller le terminal
            </Button>
            <Button variant="destructive" fullWidth leftIcon="LogOut" onPress={() => void logout()}>
              Se déconnecter
            </Button>
          </View>
        </Card>
      </Section>
    </Screen>
  );
}
