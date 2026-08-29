/**
 * Barre de progression.
 *
 * Miroir de `components/ui/progress.tsx`. Sert la synchronisation progressive
 * (« Produits : 4 200 / 18 000 ») et l'avancement d'un comptage d'inventaire.
 */
import { View } from "react-native";

export function ProgressBar({
  valeur,
  max = 100,
  tone = "primary",
}: {
  valeur: number;
  max?: number;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (valeur / max) * 100));
  const remplissage = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  }[tone];

  return (
    <View
      className="h-2 overflow-hidden rounded-full bg-muted"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now: valeur }}
    >
      <View className={`h-full rounded-full ${remplissage}`} style={{ width: `${pct}%` }} />
    </View>
  );
}
