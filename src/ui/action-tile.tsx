/**
 * Raccourci de navigation.
 *
 * Porté du back-office, mais **repensé pour le tactile**. Toute la doctrine du
 * composant web tient dans le survol : la tuile se soulève, la flèche avance.
 * **Il n'y a pas de survol sur un doigt.** L'affordance migre donc entièrement
 * dans l'état pressé, et le chevron reste immobile, comme repère de direction.
 *
 * Ce qui est conservé parce que c'est la doctrine : la pastille colorée est un
 * repère de RUBRIQUE et non un signal d'interactivité (c'est le défaut que le
 * commentaire du composant web décrit, « neuf boîtes de même taille dont quatre
 * seulement réagissaient au clic »), et les rayons concentriques, tuile en
 * `rounded-xl` et pastille en `rounded-lg`.
 *
 * **Trois accents seulement**, pris sur des jetons existants. Le web en a cinq
 * (`purple`, `indigo`, `cyan`, `amber`, `orange`) mais aucun n'a de jeton chez
 * nous et aucun ne basculerait en sombre ; et cinq pastilles colorées sur un
 * écran de 390 points, c'est du bruit.
 */
import { View } from "react-native";
import { router } from "expo-router";

import { Icon, type IconName } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";

export type AccentTuile = "primary" | "chart2" | "chart3";

const ACCENTS: Record<AccentTuile, { fond: string; jeton: "primary" | "chart2" | "chart3" }> = {
  primary: { fond: "bg-primary/10", jeton: "primary" },
  chart2: { fond: "bg-chart-2/10", jeton: "chart2" },
  chart3: { fond: "bg-chart-3/10", jeton: "chart3" },
};

export function ActionTile({
  href,
  title,
  description,
  icon,
  accent = "primary",
  raison,
}: {
  href: string;
  title: string;
  description: string;
  icon: IconName;
  accent?: AccentTuile;
  /** Présent : la tuile est grisée, non pressable, et dit pourquoi. */
  raison?: string;
}) {
  const a = ACCENTS[accent];
  const desactive = Boolean(raison);

  return (
    <View>
      <Pressable
        onPress={desactive ? undefined : () => router.push(href as never)}
        haptic={desactive ? "none" : "selection"}
        disabled={desactive}
        accessibilityRole="link"
        accessibilityLabel={`${title}. ${description}`}
        className={`flex-row items-center gap-3 rounded-xl border border-border bg-card p-3.5${
          desactive ? " opacity-50" : ""
        }`}
        pressedClassName="active:opacity-90 active:scale-[0.98]"
      >
        <View className={`h-9 w-9 items-center justify-center rounded-lg ${a.fond}`}>
          <Icon name={icon} size={18} color={a.jeton} />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
            {title}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {description}
          </Text>
        </View>
        <Icon name="ChevronRight" size={16} color="mutedForeground" />
      </Pressable>
      {raison ? (
        <Text variant="caption" className="mt-1 px-1">
          {raison}
        </Text>
      ) : null}
    </View>
  );
}
