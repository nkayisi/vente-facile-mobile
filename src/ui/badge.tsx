import { View } from "react-native";

import { Text } from "./text";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "destructive";

const TONES: Record<BadgeTone, { box: string; label: string }> = {
  neutral: { box: "bg-secondary", label: "text-secondary-foreground" },
  primary: { box: "bg-accent", label: "text-accent-foreground" },
  success: { box: "bg-success/15", label: "text-success" },
  warning: { box: "bg-warning/15", label: "text-warning" },
  destructive: { box: "bg-destructive/15", label: "text-destructive" },
};

/**
 * Pastille d'état : statut de vente, état de synchronisation, rôle.
 *
 * `tone` porte un SENS, pas une couleur : un appel `tone="warning"` reste juste
 * si la palette change, un `className="bg-amber-100"` ne l'est plus.
 */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: BadgeTone;
}) {
  const t = TONES[tone];
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${t.box}`}>
      <Text variant="caption" className={t.label}>
        {children}
      </Text>
    </View>
  );
}
