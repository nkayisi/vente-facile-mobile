/**
 * Section dont la structure existe mais que son lot n'a pas encore câblée.
 *
 * **Le titre est « Bientôt disponible », jamais « En développement ».**
 * L'ancienne application avait trois écrans ainsi libellés : ce mot dit « c'est
 * cassé », pas « c'est prévu ».
 *
 * **Aucun bouton.** Un bouton qui ne fait rien est pire que pas de bouton.
 *
 * **L'en-tête de page reste au-dessus de ce bloc** : c'est ce qui fait qu'un
 * écran non câblé a l'air PRÊT et non cassé.
 */
import { View } from "react-native";

import { Banner } from "./feedback";
import { Icon, type IconName } from "./icon";
import { Text } from "./text";

export function PasEncore({
  icon,
  lot,
  quoi,
  table,
}: {
  icon: IconName;
  /** Numéro du lot du plan qui câblera cette section. */
  lot: number;
  /** Ce qui arrive, en toutes lettres : « les sessions d'inventaire et la feuille de comptage ». */
  quoi: string;
  /** Table de tirage manquante, s'il y en a une. Affichée en développement seulement. */
  table?: string;
}) {
  return (
    <View className="items-center gap-3 px-6 py-14">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Icon name={icon} size={32} color="mutedForeground" />
      </View>
      <Text variant="h4">Bientôt disponible</Text>
      <Text variant="muted" className="text-center">
        {`Cette section arrive au lot ${lot} : ${quoi}.`}
      </Text>
      {table && __DEV__ ? (
        // Un marchand n'a pas à lire un nom de table ; un développeur qui
        // reprend l'écran au lot suivant, si.
        <Banner
          tone="info"
          title="Note de développement"
          message={`La table « ${table} » n'est pas encore au manifeste de tirage.`}
        />
      ) : null}
    </View>
  );
}
