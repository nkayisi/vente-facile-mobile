/**
 * Accueil provisoire.
 *
 * Le lot 1 s'arrête à la session : cet écran atteste qu'elle est ouverte, que
 * l'identité mise en cache est lisible et que les droits sont chargés. Les
 * onglets adaptés au rôle arrivent avec les écrans métier.
 */
import { View } from "react-native";
import { router } from "expo-router";

import { useSession } from "@/session/provider";
import { Button, Card, CardHeader, Divider, ListItem, Screen, Section, Text } from "@/ui";

export default function Home() {
  const { snapshot, logout, lock, refresh } = useSession();

  const org = snapshot?.organization;
  const membership = snapshot?.membership;

  return (
    <Screen scroll>
      <View className="mb-6 mt-4">
        <Text variant="h2">{org?.name ?? "Vente Facile"}</Text>
        <Text variant="muted">
          {snapshot?.user.full_name} · {membership?.role ?? "sans rôle"}
        </Text>
      </View>

      <Section title="Session hors ligne">
        <Card className="p-0 overflow-hidden">
          <ListItem
            title="Terminal"
            value={snapshot?.device?.device_code ?? "—"}
            icon="hardware-chip-outline"
          />
          <Divider inset />
          <ListItem
            title="Droits chargés"
            value={String(membership?.permissions.length ?? 0)}
            icon="key-outline"
          />
          <Divider inset />
          <ListItem
            title="Devises"
            value={String(snapshot?.currencies.length ?? 0)}
            icon="cash-outline"
          />
          <Divider inset />
          <ListItem
            title="Entrepôts"
            value={String(membership?.assigned_warehouses.length ?? 0)}
            icon="business-outline"
          />
        </Card>
      </Section>

      <Section title="Identité imprimée sur les tickets">
        <Card>
          <CardHeader title={org?.name ?? ""} subtitle={[org?.address, org?.city].filter(Boolean).join(", ")} />
          {org?.phone ? <Text variant="caption">Tél. {org.phone}</Text> : null}
          {org?.rccm ? <Text variant="caption">RCCM {org.rccm}</Text> : null}
          {org?.id_nat ? <Text variant="caption">ID Nat {org.id_nat}</Text> : null}
          {org?.tax_id ? <Text variant="caption">NIF {org.tax_id}</Text> : null}
        </Card>
      </Section>

      <View className="gap-3">
        <Button
          fullWidth
          leftIcon="cloud-download-outline"
          onPress={() => router.push("/(app)/sync")}
        >
          Synchronisation
        </Button>
        <Button variant="outline" fullWidth leftIcon="refresh" onPress={() => void refresh()}>
          Rafraîchir la session
        </Button>
        <Button variant="outline" fullWidth leftIcon="lock-closed-outline" onPress={lock}>
          Verrouiller
        </Button>
        <Button variant="destructive" fullWidth leftIcon="log-out-outline" onPress={() => void logout()}>
          Se déconnecter
        </Button>
      </View>
    </Screen>
  );
}
