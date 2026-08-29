/**
 * Paramètres, Devises. Miroir de `app/dashboard/settings/currencies/page.tsx`.
 *
 * Lecture depuis les tables tirées `organization_currencies` et `currencies` :
 * l'écran s'affiche hors ligne. Le taux et la devise principale se modifient en
 * ligne seulement (`POST .../update_rate`, `POST .../set_primary`).
 */
import { View } from "react-native";

import { useSession } from "@/session/provider";
import { Badge, Card, Divider, EmptyState, ListItem, Section } from "@/ui";

export default function Devises() {
  const { snapshot } = useSession();
  const devises = snapshot?.currencies ?? [];

  if (devises.length === 0) {
    return (
      <View className="py-8">
        <EmptyState
          icon="Coins"
          title="Aucune devise"
          message="Les devises de l'établissement apparaîtront ici après une synchronisation."
        />
      </View>
    );
  }

  return (
    <View className="p-4">
      <Section title={`${devises.length} devise${devises.length > 1 ? "s" : ""} active${devises.length > 1 ? "s" : ""}`}>
        <Card className="overflow-hidden p-0">
          {devises.map((d, i) => (
            <View key={d.currency_code ?? String(i)}>
              {i > 0 ? <Divider inset /> : null}
              <ListItem
                title={`${d.currency_symbol ?? ""} ${d.currency_code ?? ""}`.trim()}
                subtitle={d.currency_name ?? undefined}
                value={d.is_primary ? undefined : String(d.exchange_rate ?? "")}
                trailing={d.is_primary ? <Badge tone="primary">Principale</Badge> : undefined}
              />
            </View>
          ))}
        </Card>
      </Section>
    </View>
  );
}
