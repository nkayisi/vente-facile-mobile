/**
 * Liste de données : la grammaire de rangée de toute l'application.
 *
 * Miroir REPENSÉ de `ProductsDataTable`. Le web garde ses tableaux à huit
 * colonnes et les fait défiler horizontalement à 390 points ; un tableau à
 * colonnes est illisible au pouce, et un défilement horizontal dans une page
 * qui défile déjà verticalement est un piège. La grammaire mobile est donc la
 * **rangée à deux colonnes** : l'identité à gauche (nom, ligne secondaire), la
 * mesure à droite (valeur, qualificatif).
 *
 * `DataList` encapsule `FlashList`. **Aucun écran n'importe `FlatList` ni
 * `FlashList` directement**, un test l'interdit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RÈGLE : un écran-liste n'utilise JAMAIS `<Screen scroll>`.               │
 * │                                                                          │
 * │ `FlashList` imbriquée dans le `ScrollView` de `Screen scroll` casse la    │
 * │ virtualisation SANS lever d'erreur : mesuré sur l'émulateur, le geste     │
 * │ part à la liste interne, la page ne défile plus, et logcat ne dit rien    │
 * │ (zéro avertissement « VirtualizedLists should never be nested »). La      │
 * │ liste s'affiche, elle rame, et la cause se cherche trois mois plus tard.  │
 * │ L'en-tête de page passe donc par `enTete`.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { RefreshControl, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { Divider } from "./divider";
import { EmptyState } from "./feedback";
import { Icon, type IconName } from "./icon";
import { Pressable } from "./pressable";
import { SkeletonList } from "./feedback";
import { Text } from "./text";
import { useColor } from "./theme";
import { HIT } from "./tokens";

export function DataList<T>({
  donnees,
  cle,
  rendu,
  enTete,
  pied,
  vide,
  chargement = false,
  onRefresh,
  refreshing = false,
  onFin,
  separateur = true,
}: {
  donnees: T[];
  cle: (item: T) => string;
  rendu: (item: T) => React.ReactElement;
  enTete?: React.ReactElement;
  pied?: React.ReactElement;
  vide: { icon: IconName; titre: string; message?: string; action?: { label: string; onPress: () => void } };
  chargement?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Défilement infini : appelé à l'approche du bas. */
  onFin?: () => void;
  separateur?: boolean;
}) {
  const primary = useColor("primary");

  return (
    <FlashList
      data={donnees}
      keyExtractor={cle}
      renderItem={({ item }) => rendu(item)}
      ListHeaderComponent={enTete}
      ListFooterComponent={pied}
      ItemSeparatorComponent={separateur ? () => <Divider /> : undefined}
      ListEmptyComponent={
        chargement ? (
          <View className="px-4 py-2">
            <SkeletonList rows={10} />
          </View>
        ) : (
          <EmptyState
            icon={vide.icon}
            title={vide.titre}
            message={vide.message}
            action={vide.action}
          />
        )
      }
      onEndReached={onFin}
      onEndReachedThreshold={0.4}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} colors={[primary]} />
        ) : undefined
      }
      contentContainerStyle={{ paddingBottom: 96 }}
    />
  );
}

/**
 * Rangée à deux colonnes.
 *
 * `principal` et `valeur` ne se disputent jamais la largeur : la mesure ne
 * rétrécit pas, c'est l'identité qui se tronque. Un montant tronqué est un faux
 * montant, c'est la même règle que sur le ticket imprimé.
 */
export function DataRow({
  principal,
  secondaire,
  valeur,
  sousValeur,
  badge,
  icon,
  onPress,
  chevron = true,
}: {
  principal: string;
  secondaire?: string | null;
  valeur?: React.ReactNode;
  sousValeur?: string | null;
  badge?: React.ReactNode;
  icon?: IconName;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const contenu = (
    <View className="flex-row items-center gap-3 bg-card px-4 py-3" style={{ minHeight: HIT.min }}>
      {icon ? (
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted">
          <Icon name={icon} size={18} color="mutedForeground" />
        </View>
      ) : null}
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text variant="bodySmall" numberOfLines={1} className="min-w-0 flex-1 font-sans-medium">
            {principal}
          </Text>
          {badge}
        </View>
        {secondaire ? (
          <Text variant="caption" numberOfLines={1}>
            {secondaire}
          </Text>
        ) : null}
      </View>
      {valeur || sousValeur ? (
        <View className="shrink-0 items-end">
          {valeur}
          {sousValeur ? <Text variant="caption">{sousValeur}</Text> : null}
        </View>
      ) : null}
      {onPress && chevron ? <Icon name="ChevronRight" size={16} color="mutedForeground" /> : null}
    </View>
  );

  if (!onPress) return contenu;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={principal}>
      {contenu}
    </Pressable>
  );
}
