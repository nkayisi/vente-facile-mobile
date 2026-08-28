/**
 * Une vignette d'article dans la grille du comptoir.
 *
 * Ce qu'elle doit dire en un coup d'œil, dans cet ordre : quoi, combien, et
 * s'il en reste. Le prix passe avant le stock parce que c'est la question que
 * le client pose ; le stock passe avant le code parce que c'est la question qui
 * fait refuser la vente.
 */
import { View } from "react-native";

import { getPackaging, pluralizeUnit } from "@vente-facile/core";

import { Icon, Pressable, Text } from "@/ui";
import type { ArticlePos } from "./catalogue";

interface Props {
  article: ArticlePos;
  /** Montant formaté par l'appelant : les décimales dépendent de la devise. */
  prix: string;
  prixGros?: string | null;
  /** Quantité déjà au panier, pour la signaler sans rouvrir la fiche. */
  auPanier?: number;
  epuise?: boolean;
  onPress: () => void;
}

export function CarteArticle({ article, prix, prixGros, auPanier = 0, epuise, onPress }: Props) {
  const conditionnement = getPackaging(article);

  return (
    <Pressable
      onPress={onPress}
      disabled={epuise}
      haptic="selection"
      className={`flex-1 rounded-xl border p-3 ${
        epuise ? "border-border bg-muted opacity-60" : "border-border bg-card active:bg-muted"
      }`}
      accessibilityLabel={`${article.name}, ${prix}`}
    >
      <View className="flex-row items-start justify-between">
        <Text variant="body" numberOfLines={2} className="flex-1 font-medium">
          {article.name}
        </Text>
        {auPanier > 0 ? (
          <View className="ml-2 min-w-6 items-center rounded-full bg-primary px-1.5 py-0.5">
            <Text variant="caption" className="text-primary-foreground">
              {auPanier}
            </Text>
          </View>
        ) : null}
      </View>

      <Text variant="bodyLarge" className="mt-2 font-semibold text-primary">
        {prix}
      </Text>
      {conditionnement && prixGros ? (
        <Text variant="caption" className="text-muted-foreground">
          {prixGros} le {conditionnement.packageWord}
        </Text>
      ) : null}

      <View className="mt-2 flex-row items-center gap-1">
        <Icon
          name={epuise ? "close-circle-outline" : "cube-outline"}
          size={13}
          color={epuise ? "destructive" : "mutedForeground"}
        />
        <Text
          variant="caption"
          className={epuise ? "text-destructive" : "text-muted-foreground"}
        >
          {libelleStock(article, conditionnement)}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Le disponible, ventilé quand le partage est connu.
 *
 * Un rayon qui porte 3 casiers scellés et 7 bouteilles isolées ne se présente
 * JAMAIS comme « 43 » : le caissier a besoin de savoir ce qu'il peut vendre en
 * gros. Et sa réciproque, tout aussi contraignante : là où le partage n'est pas
 * enregistré, on ne l'invente pas.
 */
function libelleStock(
  article: ArticlePos,
  conditionnement: ReturnType<typeof getPackaging>
): string {
  if (!article.track_inventory) return "Stock non suivi";
  if (article.stock_quantity === null) return "Stock inconnu";

  const detail = article.stock_loose;
  const scelles = article.stock_packages;

  if (conditionnement && scelles !== null && detail !== null) {
    const parts: string[] = [];
    if (scelles > 0) parts.push(`${scelles} ${pluralizeUnit(conditionnement.packageWord, scelles)}`);
    if (detail > 0) parts.push(`${detail} ${pluralizeUnit(conditionnement.retailWord, detail)}`);
    return parts.length ? parts.join(" + ") : "Épuisé";
  }

  const total = article.stock_quantity;
  if (total <= 0) return "Épuisé";
  const mot = article.unit_name || "unité";
  return `${total} ${pluralizeUnit(mot, total)}`;
}
