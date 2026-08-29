/**
 * Choix de l'établissement.
 *
 * Écran que l'ancienne application n'avait pas : elle prenait `orgs[0]` en
 * silence. Un gérant de deux boutiques encaissait donc dans la mauvaise sans
 * jamais l'apprendre, et rien à l'écran ne lui disait laquelle.
 */
import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { ApiError } from "@/api/errors";
import { useSession } from "@/session/provider";
import type { OrganizationChoice } from "@/session/session";
import { Banner, Card, Divider, ListItem, Screen, Spinner, Text } from "@/ui";

const ROLE_LABELS: Record<string, string> = {
  owner: "Administrateur",
  manager: "Gérant",
  stock_keeper: "Magasinier",
  cashier: "Caissier",
};

export default function ChooseOrganization() {
  const { chooseOrganization } = useSession();
  const params = useLocalSearchParams<{ organizations?: string }>();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  let organizations: OrganizationChoice[] = [];
  try {
    organizations = JSON.parse(params.organizations ?? "[]");
  } catch {
    organizations = [];
  }

  const choose = async (id: string) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      await chooseOrganization(id);
    } catch (e) {
      setError(
        e instanceof ApiError && e.kind === "network"
          ? "Impossible de joindre le serveur. Réessayez."
          : e instanceof Error
            ? e.message
            : "L'enrôlement a échoué."
      );
      setBusy(null);
    }
  };

  return (
    <Screen scroll>
      <View className="mb-6 mt-8">
        <Text variant="h2">Quel établissement ?</Text>
        <Text variant="muted">
          Ce terminal sera rattaché à celui que vous choisissez. Pour en changer,
          il faudra le réenrôler.
        </Text>
      </View>

      {error ? (
        <View className="mb-4">
          <Banner tone="destructive" title={error} />
        </View>
      ) : null}

      <Card className="p-0 overflow-hidden">
        {organizations.map((org, index) => (
          <View key={org.id}>
            {index > 0 ? <Divider /> : null}
            <ListItem
              title={org.name}
              subtitle={ROLE_LABELS[org.role] ?? org.role_display}
              icon="Store"
              onPress={() => choose(org.id)}
              chevron={busy !== org.id}
              trailing={busy === org.id ? <Spinner /> : undefined}
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
