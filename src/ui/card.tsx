import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "./text";

/**
 * Surface posée sur le fond.
 *
 * Pas d'ombre : sur un fond sombre elle ne se voit pas, et sur Android elle
 * coûte un rendu de plus par carte dans une liste. Le contraste vient du fond
 * `card` contre le fond `background`, qui tient dans les deux thèmes.
 */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={`rounded-xl bg-card p-4 ${className}`}>{children}</View>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View className="mb-3 flex-row items-start justify-between">
      <View className="flex-1 pr-3">
        <Text variant="h4">{title}</Text>
        {subtitle ? (
          <Text variant="caption" className="mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Titre de section entre deux blocs, hors carte. */
export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text variant="label" className="uppercase tracking-wide text-muted-foreground">
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}
