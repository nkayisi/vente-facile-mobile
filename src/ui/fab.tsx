/**
 * Bouton d'action flottant.
 *
 * **Ajout mobile assumé, aucun miroir sur le web.** Le back-office pose son
 * action primaire orange en haut à droite de la page ; sur un téléphone tenu
 * d'une main, ce coin est hors de portée du pouce. L'action descend donc ici.
 * C'est un écart au web, volontaire, listé dans la check-list de parité.
 *
 * **`Fab` ne pose AUCUNE zone sûre**, c'est `Screen` qui s'en charge - même
 * partage que `AppBar`, et pour la même raison : deux composants qui ajoutent
 * `insets.bottom` font flotter le bouton à quatre-vingts points du bord, et
 * cela ne se voit que sur un terminal à indicateur d'accueil.
 *
 * Reste `offsetBas`, qui n'est PAS une zone sûre : c'est la hauteur de la barre
 * d'onglets pour un écran qui vit dedans, laquelle porte déjà sa propre zone
 * sûre. Sans lui, le bouton se pose sur les onglets.
 */
import { View } from "react-native";

import { Icon, type IconName } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";
import { HIT } from "./tokens";

export function Fab({
  icon,
  label,
  onPress,
  raison,
  offsetBas = 0,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Présent : le bouton est grisé, non pressable, et la raison s'écrit dessous. */
  raison?: string;
  /** Hauteur de la barre d'onglets, quand l'écran vit dedans. */
  offsetBas?: number;
}) {
  const desactive = Boolean(raison);
  return (
    <View className="absolute inset-x-0 items-end px-4" style={{ bottom: offsetBas + 16 }}>
      {raison ? (
        <View className="mb-2 max-w-[80%] rounded-lg bg-card px-3 py-2">
          <Text variant="caption" className="text-right">
            {raison}
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={desactive ? undefined : onPress}
        disabled={desactive}
        haptic={desactive ? "none" : "selection"}
        accessibilityRole="button"
        accessibilityLabel={label}
        className={`flex-row items-center gap-2 rounded-full bg-primary px-5 shadow-lg${
          desactive ? " opacity-50" : ""
        }`}
        style={{ height: HIT.pos }}
      >
        <Icon name={icon} size={20} color="primaryForeground" />
        <Text className="font-sans-semibold text-primary-foreground">{label}</Text>
      </Pressable>
    </View>
  );
}
