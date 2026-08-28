import type { ReactNode } from "react";
import { View } from "react-native";

import { Icon, type IconName } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";
import { HIT } from "./tokens";

/**
 * Ligne de liste.
 *
 * Trois zones : un devant (icône ou vignette), un corps (titre et sous-titre),
 * un derrière (valeur, pastille, chevron). La hauteur minimale est la cible
 * tactile, pas une valeur esthétique.
 */
export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Valeur alignée à droite : un montant, une quantité, un statut. */
  value?: string;
  valueTone?: "default" | "muted" | "success" | "destructive";
  icon?: IconName;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  /** Chevron : ne le poser que si l'appui ouvre vraiment un écran. */
  chevron?: boolean;
}

const VALUE_TONE = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  success: "text-success",
  destructive: "text-destructive",
} as const;

export function ListItem({
  title,
  subtitle,
  value,
  valueTone = "default",
  icon,
  leading,
  trailing,
  onPress,
  chevron = false,
}: ListItemProps) {
  const content = (
    <View
      className="flex-row items-center bg-card px-4"
      style={{ minHeight: HIT.min }}
    >
      {leading ?? (icon ? <View className="mr-3"><Icon name={icon} color="mutedForeground" /></View> : null)}

      <View className="flex-1 py-2.5">
        <Text variant="body" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1} className="mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text variant="bodySmall" numeric className={`ml-3 ${VALUE_TONE[valueTone]}`}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {chevron ? (
        <View className="ml-1.5">
          <Icon name="chevron-forward" size={18} color="mutedForeground" />
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} pressedClassName="active:opacity-60">
      {content}
    </Pressable>
  );
}
