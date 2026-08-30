/**
 * Puce : filtre de rubrique, filtre actif retirable, choix court.
 *
 * Elle était déjà réimplémentée à la main DEUX fois avant ce lot (les rubriques
 * du comptoir et les moyens de paiement de l'encaissement). La sortir efface
 * deux dettes en naissant.
 *
 * Miroir des `Badge` orange à croix du back-office et de ses puces de filtre.
 */
import { ScrollView, View } from "react-native";

import { Icon, type IconName } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";
import { HIT } from "./tokens";

export function Chip({
  label,
  actif = false,
  onPress,
  onRetirer,
  icon,
}: {
  label: string;
  actif?: boolean;
  onPress?: () => void;
  /** Présent : la puce porte une croix de retrait (puce de filtre actif). */
  onRetirer?: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      haptic={onPress ? "selection" : "none"}
      disabled={!onPress && !onRetirer}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={label}
      className={`h-9 flex-row items-center gap-1.5 rounded-full border px-3 ${
        actif ? "border-primary bg-primary" : "border-border bg-card"
      }`}
    >
      {icon ? <Icon name={icon} size={14} color={actif ? "primaryForeground" : "mutedForeground"} /> : null}
      <Text
        variant="bodySmall"
        className={actif ? "font-sans-medium text-primary-foreground" : "font-sans-medium text-foreground"}
      >
        {label}
      </Text>
      {onRetirer ? (
        <Pressable
          onPress={onRetirer}
          accessibilityRole="button"
          accessibilityLabel={`Retirer le filtre ${label}`}
          className="ml-0.5 rounded-full"
          hitSlop={8}
        >
          <Icon name="X" size={14} color={actif ? "primaryForeground" : "mutedForeground"} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/**
 * Rangée de puces à défilement horizontal.
 *
 * `flexGrow: 0` et une hauteur EXPLICITE ne sont pas décoratifs : dans une
 * feuille basse à taille dynamique, il n'existe aucune hauteur de parent à
 * hériter, et un `ScrollView` horizontal s'y mesure à zéro. La feuille sortait
 * alors avec son titre et rien d'autre - vérifié sur l'émulateur, sans la
 * moindre erreur en journal. La hauteur est celle d'une puce (`h-9`).
 */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, height: 36 }}
      contentContainerStyle={{ gap: 8, paddingRight: 16 }}
    >
      {children}
    </ScrollView>
  );
}

/** Bouton « Filtres » avec sa pastille de décompte. */
export function BoutonFiltres({ actifs, onPress }: { actifs: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={actifs > 0 ? `Filtres, ${actifs} actifs` : "Filtres"}
      className={`flex-row items-center justify-center gap-1.5 rounded-lg border px-3 ${
        actifs > 0 ? "border-primary bg-accent" : "border-border bg-card"
      }`}
      style={{ height: HIT.min, minWidth: HIT.min }}
    >
      <Icon name="Filter" size={18} color={actifs > 0 ? "accentForeground" : "foreground"} />
      {actifs > 0 ? (
        // Pastille RONDE À CONTENU VARIABLE : `min-w` et jamais `w`, sinon
        // « 12 » déborde du cercle.
        <View className="h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1">
          <Text className="text-[11px] font-sans-bold text-primary-foreground">{String(actifs)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
