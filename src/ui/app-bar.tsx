/**
 * Barre de titre d'écran.
 *
 * Maison, et non le header natif de `Stack` : celui-ci ne sait pas lire les
 * variables NativeWind posées par `ThemeProvider`, il faudrait lui passer des
 * couleurs brutes et donc tenir le thème à deux endroits.
 *
 * **`AppBar` ne pose AUCUNE zone sûre**, c'est `Screen` qui s'en charge. Deux
 * composants qui ajoutent `insets.top` donnent une barre de 90 points de haut,
 * et cela ne se voit que sur un terminal à encoche.
 *
 * Le glyphe de retour est `ArrowLeft`, celui que le back-office pose dans un
 * bouton fantôme : un bouton de retour qui ne se ressemble pas d'une surface à
 * l'autre est exactement ce que ce lot corrige.
 *
 * **Sur une tablette, la barre se fond dans la page.** Sur un téléphone c'est
 * un bandeau de carte, bord à bord. Sur un grand écran elle vit dans la colonne
 * centrée de l'écran (`Screen`, gabarit) : un bandeau blanc de 760 points posé
 * au milieu du fond gris s'y lisait comme une carte de plus, sans rien à
 * contenir. Elle devient alors l'en-tête de la page - flèche, titre, actions
 * sur le fond -, exactement comme le titre d'un écran d'onglet sous la barre
 * du haut, et comme l'en-tête d'une page du back-office.
 */
import { View } from "react-native";
import { router } from "expo-router";

import { useDisposition } from "./disposition";
import { useVoletDeFiche } from "./volet-fiche";
import { HIT } from "./tokens";
import { Icon } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";

export function AppBar({
  title,
  subtitle,
  right,
  onBack,
  back = true,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  back?: boolean;
}) {
  const { classe } = useDisposition();
  const bandeau = classe === "compact";
  // Dans un volet, la fiche ne se QUITTE pas, elle se FERME : une flèche de
  // retour y ferait croire qu'on revient à un écran précédent, alors que la
  // liste est déjà là, à gauche. La croix referme le volet.
  const volet = useVoletDeFiche();
  const fermeLeVolet = volet !== null && onBack === undefined;
  return (
    <View
      className={
        bandeau
          ? "flex-row items-center gap-1 border-b border-border bg-card px-2 py-2"
          : "flex-row items-center gap-1 px-2 pb-1 pt-3"
      }
    >
      {back ? (
        <Pressable
          onPress={fermeLeVolet ? volet.fermer : (onBack ?? (() => router.back()))}
          accessibilityRole="button"
          accessibilityLabel={fermeLeVolet ? "Fermer la fiche" : "Revenir à la page précédente"}
          className="items-center justify-center rounded-lg"
          style={{ width: HIT.min, height: HIT.min }}
        >
          <Icon name={fermeLeVolet ? "X" : "ArrowLeft"} size={20} />
        </Pressable>
      ) : (
        <View className="w-2" />
      )}
      <View className="min-w-0 flex-1">
        {title ? (
          <Text variant="h4" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
