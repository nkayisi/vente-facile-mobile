/**
 * En-tête de page : titre, puis SOIT un sous-titre SOIT un compteur.
 *
 * **Les deux sont exclusifs, et c'est un choix.** Le web mélange les deux
 * grammaires sans règle (« Vue d'ensemble de vos entrepôts… » ici, « 100
 * produits au total » là). Ici, `count` gagne dès qu'une page est une liste, et
 * `subtitle` sert partout ailleurs. Le compteur est la seule information que
 * l'en-tête d'une liste ajoute vraiment.
 *
 * **L'action primaire ne va PAS ici.** Le web la pose en haut à droite, hors de
 * portée du pouce sur un téléphone : elle descend dans un `Fab`. C'est un écart
 * au web, volontaire, listé comme tel dans la check-list de parité. `actions`
 * n'accueille que du secondaire, typiquement le menu d'export.
 */
import { View } from "react-native";

import { Text } from "./text";

export type PageHeaderProps = {
  title: string;
  actions?: React.ReactNode;
} & (
  | { subtitle?: string; count?: never }
  | { count: { n: number; label: string }; subtitle?: never }
);

export function PageHeader({ title, actions, ...reste }: PageHeaderProps) {
  const sousTitre =
    "count" in reste && reste.count
      ? `${reste.count.n} ${reste.count.label}`
      : (reste as { subtitle?: string }).subtitle;

  return (
    <View className="gap-3">
      <View>
        <Text variant="h2">{title}</Text>
        {sousTitre ? (
          <Text variant="muted" className="mt-1">
            {sousTitre}
          </Text>
        ) : null}
      </View>
      {actions ? <View className="flex-row flex-wrap items-center gap-2">{actions}</View> : null}
    </View>
  );
}
