/**
 * Paramètres, Fidélité. Miroir de `app/dashboard/settings/loyalty/page.tsx`.
 *
 * Le web affiche sept encarts. Lecture depuis l'instantané de session, qui
 * porte déjà le programme : l'écran s'affiche hors ligne.
 */
import { View } from "react-native";

import { useSession } from "@/session/provider";
import { Badge, Card, Divider, EmptyState, ListItem, Section } from "@/ui";

export default function Fidelite() {
  const { snapshot } = useSession();
  const p = snapshot?.loyalty_program ?? null;

  if (!p) {
    return (
      <View className="py-8">
        <EmptyState
          icon="Gift"
          title="Aucun programme de fidélité configuré"
          message="Créez un programme pour récompenser vos clients."
        />
      </View>
    );
  }

  const calcul =
    p.points_calculation_type === "percentage"
      ? `${p.points_percentage} % du montant`
      : `${p.points_per_unit} point(s) par ${p.amount_per_unit}`;

  return (
    <View className="p-4">
      <Section title={p.name}>
        <Card className="overflow-hidden p-0">
          <ListItem
            title="Statut"
            trailing={
              <Badge tone={p.is_active ? "success" : "neutral"}>
                {p.is_active ? "Actif" : "Inactif"}
              </Badge>
            }
          />
          <Divider inset />
          <ListItem title="Calcul des points" value={calcul} />
          <Divider inset />
          <ListItem title="Valeur d'un point" value={p.point_value} />
          <Divider inset />
          <ListItem
            title="Minimum pour utiliser"
            value={p.min_points_to_redeem != null ? String(p.min_points_to_redeem) : "—"}
          />
          <Divider inset />
          <ListItem
            title="Part réglable en points"
            value={p.max_redemption_percent ? `${p.max_redemption_percent} %` : "—"}
          />
        </Card>
      </Section>
    </View>
  );
}
