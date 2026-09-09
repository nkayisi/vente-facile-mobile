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
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PAS D'EN-TÊTE COLLANT : `stickyHeaderIndices` RENDAIT L'EN-TÊTE DEUX     │
 * │ FOIS.                                                                    │
 * │                                                                          │
 * │ Mesuré sur l'émulateur, historique des ventes sur trente jours : arrivé  │
 * │ en butée de liste, « Lundi 24 août · 2 ventes · 15 350,4 $ » s'affichait │
 * │ DEUX FOIS, l'un sous l'autre à environ soixante-dix points d'écart -     │
 * │ l'exemplaire collant, et le vrai que la bibliothèque ne masque pas.      │
 * │ Un en-tête de journée doublé se lit comme une donnée dupliquée, sur un   │
 * │ écran dont l'objet est de compter des ventes.                            │
 * │                                                                          │
 * │ Piste écartée par la mesure : `StickyHeaders.js` ajoute `firstItemOffset`│
 * │ pour l'en-tête SUIVANT et pas pour la recherche du COURANT, ce qui       │
 * │ laissait soupçonner notre en-tête de page, haut d'environ 470 points.    │
 * │ Vérifié en le retirant : le doublon PERSISTE. Ce n'est donc pas notre    │
 * │ mise en page, et rien de ce que nous écrivons ici ne le corrige.         │
 * │                                                                          │
 * │ Les en-têtes de journée restent DANS le flux : ils sont distincts par    │
 * │ leur fond et leur filet, et la chronologie se lit sans eux collés.       │
 * │ `getItemType` reste indispensable, lui, sans quoi la virtualisation      │
 * │ recycle un en-tête en rangée.                                            │
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
  basDeListe = 96,
  typeElement,
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
  /**
   * Ce qui reste sous la dernière ligne.
   *
   * Quatre-vingt-seize points par défaut : c'est la place d'un `Fab`, qui
   * flotte au-dessus de la liste et masquerait sinon la dernière rangée. Un
   * écran qui porte une barre d'actions FIXE (`Screen pied`) n'en a pas
   * besoin - la barre est un frère du défilement, rien ne passe dessous - et
   * ces points y deviendraient un vide au-dessus d'elle.
   */
  basDeListe?: number;
  /**
   * La FAMILLE d'un élément, quand la liste en mêle plusieurs (un en-tête de
   * journée et une rangée de vente, par exemple).
   *
   * Sans elle, la virtualisation recycle un en-tête en rangée et l'inverse :
   * les hauteurs sautent au défilement, et rien n'avertit. C'est ce que
   * `FlashList` appelle `getItemType`.
   */
  typeElement?: (item: T, index: number) => string;
}) {
  const primary = useColor("primary");

  return (
    <FlashList
      data={donnees}
      keyExtractor={cle}
      renderItem={({ item }) => rendu(item)}
      ListHeaderComponent={enTete}
      getItemType={typeElement}
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
      contentContainerStyle={{ paddingBottom: basDeListe }}
    />
  );
}

/**
 * En-tête de section : ce qui coupe une liste en tranches qui ont un sens.
 *
 * Il se distingue d'une rangée par son FOND et sa hauteur, pas par une nuance
 * de gris : quand il reste collé en haut, il passe devant les rangées qui
 * défilent dessous et doit rester opaque, sans quoi le texte de la liste
 * transparaît au travers.
 *
 * La mesure est à droite comme sur `DataRow` : les deux s'alignent, et l'oeil
 * descend une seule colonne de montants.
 */
export function DataSection({
  label,
  meta,
  valeur,
}: {
  label: string;
  /** Ce que la section compte. Jamais un montant : celui-ci va dans `valeur`. */
  meta?: string | null;
  valeur?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3 border-b border-border bg-muted px-4 py-2">
      <View className="min-w-0 flex-1">
        <Text variant="caption" numberOfLines={1} className="font-sans-medium text-foreground">
          {label}
        </Text>
        {meta ? (
          <Text variant="caption" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {valeur ? <View className="shrink-0 items-end">{valeur}</View> : null}
    </View>
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
