/**
 * Une vignette d'article dans la grille du comptoir.
 *
 * Ce qu'elle doit dire en un coup d'œil, dans cet ordre : quoi, combien, et
 * s'il en reste. Le prix passe avant le stock parce que c'est la question que
 * le client pose ; le stock passe avant le code parce que c'est la question qui
 * fait refuser la vente.
 */
import { View } from "react-native";

import { formatQuantity, formatUnitQuantity, getPackaging } from "@vente-facile/core";

import { Icon, Pressable, Text, VignetteArticle } from "@/ui";
import type { ArticlePos } from "./catalogue";

interface Props {
  article: ArticlePos;
  /** Montant formaté par l'appelant : les décimales dépendent de la devise. */
  prix: string;
  /**
   * Le même prix dans une AUTRE devise, au taux en vigueur. `null` sinon.
   *
   * ⚠ IL NE REMPLACE JAMAIS `prix`, il le suit. Un prix converti affiché seul
   * se lirait comme le prix de vente, et le ticket sortirait alors dans une
   * autre monnaie que celle annoncée au client - la facture reste libellée en
   * devise principale. T10 du retour de test.
   */
  prixConverti?: string | null;
  prixGros?: string | null;
  /** Quantité déjà au panier, pour la signaler sans rouvrir la fiche. */
  auPanier?: number;
  epuise?: boolean;
  onPress: () => void;
}

export function CarteArticle({
  article, prix, prixConverti, prixGros, auPanier = 0, epuise, onPress,
}: Props) {
  const conditionnement = getPackaging(article);
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ AUCUNE CARTE N'EST PLUS INERTE, PAS MÊME SOUS INVENTAIRE.             │
  // │                                                                        │
  // │ Un article sous inventaire rendait sa carte morte : le caissier ne     │
  // │ pouvait même pas le chiffrer sur une proforma. Comme l'article épuisé, │
  // │ il s'ajoute désormais au panier, et c'est l'ENCAISSEMENT qui se ferme  │
  // │ (le serveur refuse la vente d'un produit bloqué). La carte garde son   │
  // │ cadenas et la RÉFÉRENCE de la session : c'est l'information, et le     │
  // │ caissier doit pouvoir dire au client ce qu'on attend.                  │
  // └────────────────────────────────────────────────────────────────────────┘
  const verrouille = article.verrou_inventaire !== null;

  return (
    <Pressable
      onPress={onPress}
      haptic="selection"
      className="flex-1 rounded-xl border border-border bg-card p-3 active:bg-muted"
      accessibilityLabel={
        verrouille
          ? `${article.name}, ${prix}, sous inventaire : ne s'encaisse pas`
          : `${article.name}, ${prix}`
      }
    >
      {/* LA VIGNETTE CÈDE LA PLACE AU PRIX, jamais l'inverse. Une photo pleine
          largeur au-dessus du nom repousserait le stock hors de l'écran, or
          c'est le stock qui fait refuser la vente. Disposition du web : image
          à gauche, colonne d'information à droite. */}
      <View className="flex-row items-start gap-2">
        <VignetteArticle uri={article.image} taille="md" />
        <View className="flex-1 flex-row items-start justify-between">
          <Text variant="body" numberOfLines={2} className="flex-1 font-sans-medium">
            {article.name}
          </Text>
          {auPanier > 0 ? (
            <View className="ml-2 min-w-6 items-center rounded-full bg-primary px-1.5 py-0.5">
              <Text variant="caption" className="text-primary-foreground">
                {/* Formatée : une demi-unité au panier s'affichait « 0.5 », au
                    point anglais, au milieu d'un écran qui écrit « 1 122,4 $ »
                    (relevé sur l'émulateur le 2026-11-14). */}
                {formatQuantity(auPanier)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text variant="bodyLarge" className="mt-2 font-sans-semibold text-primary">
        {prix}
      </Text>
      {prixConverti ? (
        <Text variant="caption" className="text-muted-foreground">
          {prixConverti}
        </Text>
      ) : null}
      {conditionnement && prixGros ? (
        <Text variant="caption" className="text-muted-foreground">
          {/* « par » et non « le » : le GENRE d'un nom de contenant n'est pas
              dérivable sans lexique, et ce nom vient du marchand. Relevé à
              l'écran : « 28 $ le BOITE ». Même famille que « Ouvrir un BOITE »,
              corrigé au lot 7 par un tour invariable. */}
          {prixGros} par {conditionnement.packageWord}
        </Text>
      ) : null}

      <View className="mt-2 flex-row items-center gap-1">
        <Icon
          name={verrouille ? "Lock" : epuise ? "PackageX" : "Package"}
          size={13}
          color={verrouille || epuise ? "destructive" : "mutedForeground"}
        />
        <Text
          variant="caption"
          numberOfLines={1}
          className={verrouille || epuise ? "text-destructive" : "text-muted-foreground"}
        >
          {/* La RÉFÉRENCE, pas « indisponible » : le caissier doit pouvoir dire
              au client ce qu'on attend, et au gérant quelle session bloquer. */}
          {verrouille
            ? `Inventaire ${article.verrou_inventaire}`
            : libelleStock(article, conditionnement)}
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
  // Aucune ligne de stock dans l'entrepôt de la caisse : ni zéro, ni inconnu,
  // l'état vrai. Le catalogue étant entier, c'est le cas ordinaire d'un article
  // stocké dans un autre dépôt.
  if (article.stock_quantity === null) return "Aucun stock ici";

  const detail = article.stock_loose;
  const scelles = article.stock_packages;

  if (conditionnement && scelles !== null && detail !== null) {
    const parts: string[] = [];
    if (scelles > 0) parts.push(`${formatUnitQuantity(scelles, conditionnement.packageWord)}`);
    if (detail > 0) parts.push(`${formatUnitQuantity(detail, conditionnement.retailWord)}`);
    return parts.length ? parts.join(" + ") : "Épuisé";
  }

  const total = article.stock_quantity;
  if (total <= 0) return "Épuisé";
  const mot = article.unit_name || "unité";
  return `${formatUnitQuantity(total, mot)}`;
}
