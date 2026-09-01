/**
 * En-tête de page : titre, puis SOIT un sous-titre SOIT un compteur.
 *
 * **Les deux sont exclusifs, et c'est un choix.** Le web mélange les deux
 * grammaires sans règle (« Vue d'ensemble de vos entrepôts… » ici, « 100
 * produits au total » là). Ici, `count` gagne dès qu'une page est une liste, et
 * `subtitle` sert partout ailleurs. Le compteur est la seule information que
 * l'en-tête d'une liste ajoute vraiment.
 *
 * **`actions` n'accueille que du secondaire**, typiquement le menu d'export :
 * il se pose SOUS le titre, sur sa propre ligne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `action` MET UNE ACTION SUR LA LIGNE DU TITRE, ET C'EST UNE EXCEPTION.   │
 * │                                                                          │
 * │ La règle du dépôt reste que l'action primaire d'une LISTE descend dans   │
 * │ un `Fab` : le haut d'un écran de six pouces est hors de portée du pouce, │
 * │ et une liste se parcourt vers le bas.                                    │
 * │                                                                          │
 * │ Un CONCENTRATEUR n'est pas une liste. Il n'a pas de `Fab`, sa raison     │
 * │ d'être est d'envoyer ailleurs, et son action d'en-tête a toujours un     │
 * │ second chemin (le comptoir est aussi l'onglet du CENTRE de la barre,     │
 * │ c'est-à-dire le point le plus sûr du pouce). La poser en pleine largeur  │
 * │ sous le titre coûtait soixante points de hauteur pour un bouton qui      │
 * │ double un onglet, et c'est autant que la liste des ventes du jour        │
 * │ perdait, sur l'écran où on vient précisément la lire.                    │
 * │                                                                          │
 * │ Le titre passe alors sur UNE ligne : sans cela, un titre long et un      │
 * │ bouton se disputent la largeur, et c'est le bouton qui perd son libellé. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { View } from "react-native";

import { Text } from "./text";

export type PageHeaderProps = {
  title: string;
  /** Action primaire, sur la ligne du titre. Réservée aux concentrateurs. */
  action?: React.ReactNode;
  /** Actions secondaires, sur leur propre ligne sous le titre. */
  actions?: React.ReactNode;
} & (
  | { subtitle?: string; count?: never }
  | { count: { n: number; label: string }; subtitle?: never }
);

export function PageHeader({ title, action, actions, ...reste }: PageHeaderProps) {
  const sousTitre =
    "count" in reste && reste.count
      ? `${reste.count.n} ${reste.count.label}`
      : (reste as { subtitle?: string }).subtitle;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="h2" numberOfLines={action ? 1 : undefined}>
            {title}
          </Text>
          {sousTitre ? (
            <Text variant="muted" numberOfLines={action ? 1 : undefined} className="mt-1">
              {sousTitre}
            </Text>
          ) : null}
        </View>
        {action ? <View className="shrink-0">{action}</View> : null}
      </View>
      {actions ? <View className="flex-row flex-wrap items-center gap-2">{actions}</View> : null}
    </View>
  );
}
