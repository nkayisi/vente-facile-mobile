import type { ReactNode } from "react";
import { View } from "react-native";

import { Button } from "./button";
import { Icon, type IconName } from "./icon";
import { Text } from "./text";
import type { Palette } from "./tokens";

export type BannerTone = "info" | "success" | "warning" | "destructive";

const BANNER: Record<
  BannerTone,
  { box: string; icon: IconName; color: keyof Palette }
> = {
  info: { box: "bg-accent", icon: "Info", color: "accentForeground" },
  success: { box: "bg-success/15", icon: "CheckCircle2", color: "success" },
  warning: { box: "bg-warning/15", icon: "AlertTriangle", color: "warning" },
  destructive: { box: "bg-destructive/15", icon: "XCircle", color: "destructive" },
};

/**
 * Bandeau d'information.
 *
 * Ne bloque jamais : c'est tout l'intérêt d'une application hors ligne d'abord
 * que de laisser travailler pendant qu'elle signale. Le bandeau hors ligne en
 * particulier informe, il n'interdit rien.
 */
export function Banner({
  tone = "info",
  title,
  message,
  action,
}: {
  tone?: BannerTone;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  const t = BANNER[tone];
  return (
    <View className={`flex-row items-start rounded-lg p-3 ${t.box}`}>
      <View className="mr-2.5 mt-0.5">
        <Icon name={t.icon} size={18} color={t.color} />
      </View>
      <View className="flex-1">
        <Text variant="label">{title}</Text>
        {message ? (
          <Text variant="caption" className="mt-0.5">
            {message}
          </Text>
        ) : null}
        {action ? (
          <View className="mt-2">
            <Button size="sm" variant="outline" onPress={action.onPress}>
              {action.label}
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * État vide.
 *
 * Un écran vide doit dire trois choses : ce qui manque, pourquoi, et le geste
 * qui remplit. « Aucun résultat » tout seul laisse l'utilisateur bloqué.
 */
export function EmptyState({
  icon = "Inbox",
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      {/* Cercle `h-16 w-16` du back-office : c'est ce qui distingue un etat
          vide DELIBERE d'un ecran qui n'a simplement rien charge. */}
      <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Icon name={icon} size={32} color="mutedForeground" />
      </View>
      <Text variant="h4" className="mt-4 text-center">
        {title}
      </Text>
      {message ? (
        <Text variant="muted" className="mt-1.5 text-center">
          {message}
        </Text>
      ) : null}
      {action ? (
        <View className="mt-5">
          <Button onPress={action.onPress}>{action.label}</Button>
        </View>
      ) : null}
    </View>
  );
}

/** État d'erreur, avec un moyen de réessayer. Jamais un cul-de-sac. */
export function ErrorState({
  title = "Quelque chose n'a pas fonctionné",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Icon name="AlertTriangle" size={44} color="destructive" />
      <Text variant="h4" className="mt-4 text-center">
        {title}
      </Text>
      {message ? (
        <Text variant="muted" className="mt-1.5 text-center">
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <View className="mt-5">
          <Button variant="outline" leftIcon="RefreshCw" onPress={onRetry}>
            Réessayer
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Ossature de chargement.
 *
 * Préférée à une roue dès que la forme du contenu est connue : elle dit ce qui
 * arrive et évite le saut de mise en page quand les données tombent.
 */
export function Skeleton({
  className = "h-4 w-full",
}: {
  className?: string;
}) {
  return <View className={`rounded-md bg-muted ${className}`} />;
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <View>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} className="flex-row items-center bg-card px-4 py-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <View className="ml-3 flex-1">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </View>
          <Skeleton className="h-3.5 w-16" />
        </View>
      ))}
    </View>
  );
}

export function Stack({ children, gap = 3 }: { children: ReactNode; gap?: number }) {
  return <View style={{ gap: gap * 4 }}>{children}</View>;
}
