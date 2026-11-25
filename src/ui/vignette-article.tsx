/**
 * La vignette d'un article. Miroir de `components/products/product-thumb.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PHOTO DESCENDAIT AU TIRAGE ET N'ÉTAIT AFFICHÉE NULLE PART.           │
 * │                                                                          │
 * │ `products.image` est bien au manifeste - vérifié sur le serveur - et la  │
 * │ colonne existe dans le schéma local depuis le lot 2. Ni la liste ni la   │
 * │ fiche ne la lisaient : un marchand qui avait pris la peine de            │
 * │ photographier ses articles au back-office ne les voyait pas sur son      │
 * │ terminal, c'est-à-dire là où la photo sert le plus - au comptoir, pour   │
 * │ retrouver un article dans une grille de plusieurs centaines.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le repli est l'icône colis, comme sur le web : c'est le cas de la MAJORITÉ
 * des articles, et il doit rester discret et identique partout, sinon les
 * listes paraissent incohérentes.
 */
import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";

import { Icon } from "./icon";

const TAILLES = {
  sm: { boite: "h-9 w-9 rounded-lg", icone: 18 },
  /** La grille du comptoir : deux colonnes, la vignette cède la place au prix. */
  md: { boite: "h-12 w-12 rounded-lg", icone: 22 },
  lg: { boite: "h-24 w-24 rounded-xl", icone: 32 },
  /** Remplit son parent, qui porte la taille et l'arrondi (carte du comptoir). */
  plein: { boite: "h-full w-full", icone: 30 },
} as const;

export function VignetteArticle({
  uri,
  taille = "sm",
}: {
  /** L'URL rendue par le serveur, ou `null` pour la plupart des articles. */
  uri?: string | null;
  taille?: keyof typeof TAILLES;
}) {
  const t = TAILLES[taille];
  /**
   * L'adresse dont l'image n'a PAS pu se charger.
   *
   * ⚠ Sans ce repli, une photo injoignable laissait un carré gris vide : il se
   * lit comme un article sans image ET sans icône, c'est-à-dire comme un défaut
   * d'affichage. On retient l'ADRESSE et non un booléen : une rangée recyclée
   * qui reçoit une autre photo doit retenter sa chance.
   */
  const [echecPour, setEchecPour] = useState<string | null>(null);
  const afficher = uri && echecPour !== uri ? uri : null;

  return (
    <View className={`items-center justify-center overflow-hidden bg-muted ${t.boite}`}>
      {afficher ? (
        <Image
          source={{ uri: afficher }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          // Le cache DISQUE : une photo vue (ou préchargée après une
          // synchronisation, `features/sync/photos-prechargees.ts`) s'affiche
          // encore hors ligne.
          cachePolicy="disk"
          // ⚠ INDISPENSABLE dans une liste recyclée (FlashList) : sans clé, une
          // rangée réutilisée montre un instant la photo d'un AUTRE article.
          recyclingKey={afficher}
          transition={120}
          onError={() => setEchecPour(afficher)}
        />
      ) : (
        <Icon name="Package" size={t.icone} color="mutedForeground" />
      )}
    </View>
  );
}
