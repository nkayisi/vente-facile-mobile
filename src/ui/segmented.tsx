/**
 * Contrôle segmenté.
 *
 * **Un seul composant pour les DEUX grammaires du web.** Le back-office a des
 * onglets-routes sur Paramètres (`border-b-2 border-orange-500`) et des `Tabs`
 * Radix sur Rapports : visuellement identiques, techniquement différents. Ici
 * l'appelant décide s'il pilote un état local ou un `router.replace`.
 *
 * **Au-delà de trois segments, la rangée défile horizontalement.** Les huit
 * onglets de Rapports ne tiennent pas sur 390 points ; le web les replie sur
 * trois ou quatre lignes, ce qui mange la moitié de l'écran. Le défilement est
 * préférable sur un téléphone, à condition que la coupe se voie : le dernier
 * segment reste donc partiellement visible.
 */
import { ScrollView, View } from "react-native";

import { Icon, type IconName } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";

export interface OptionSegment<T extends string> {
  valeur: T;
  label: string;
  icon?: IconName;
}

export function Segmented<T extends string>({
  options,
  valeur,
  onChange,
}: {
  options: OptionSegment<T>[];
  valeur: T;
  onChange: (v: T) => void;
}) {
  const contenu = options.map((o) => {
    const actif = o.valeur === valeur;
    return (
      <Pressable
        key={o.valeur}
        onPress={() => onChange(o.valeur)}
        haptic="selection"
        accessibilityRole="tab"
        accessibilityState={{ selected: actif }}
        accessibilityLabel={o.label}
        className={`h-11 flex-row items-center gap-1.5 border-b-2 px-4 ${
          actif ? "border-primary" : "border-transparent"
        }`}
      >
        {o.icon ? <Icon name={o.icon} size={16} color={actif ? "primary" : "mutedForeground"} /> : null}
        <Text
          variant="bodySmall"
          className={actif ? "font-sans-medium text-primary" : "font-sans-medium text-muted-foreground"}
        >
          {o.label}
        </Text>
      </Pressable>
    );
  });

  if (options.length <= 3) {
    return <View className="flex-row border-b border-border bg-card">{contenu}</View>;
  }

  return (
    <View className="border-b border-border bg-card">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {contenu}
      </ScrollView>
    </View>
  );
}
