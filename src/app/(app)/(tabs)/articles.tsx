/**
 * Produits. Miroir de `app/dashboard/products/page.tsx`.
 *
 * **Premier écran-liste, donc premier à appliquer la convention 11 : pas de
 * `Screen scroll`.** `DataList` encapsule une `FlashList`, et une `FlashList`
 * imbriquée dans un `ScrollView` casse la virtualisation SANS lever d'erreur -
 * mesuré sur l'émulateur, le geste part à la liste interne et la page ne défile
 * plus. L'en-tête de page passe donc par `enTete`.
 *
 * Écart au web assumé, à lister dans la check-list de parité : le back-office
 * garde ici un tableau de huit colonnes qu'il fait défiler horizontalement à
 * 390 points. Un tableau à colonnes ne se lit pas au pouce, et un défilement
 * horizontal dans une page qui défile déjà verticalement est un piège. On rend
 * la même information dans la grammaire de rangée : identité à gauche (nom,
 * SKU, catégorie), mesure à droite (stock lisible, prix).
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { formatPrice } from "@vente-facile/core";

import { compteursRubriques, listeArticles, type ArticleListe } from "@/data/articles";
import { useLecture } from "@/data/live";
import {
  Badge,
  Button,
  DataList,
  DataRow,
  PageHeader,
  Screen,
  SearchInput,
  StatValue,
  Text,
} from "@/ui";

const TABLES = ["products", "categories", "brands", "units", "stocks"];

export default function Articles() {
  const [recherche, setRecherche] = useState("");

  const charger = useCallback(() => listeArticles({ recherche, limite: 100 }), [recherche]);
  const { donnees, chargement } = useLecture(charger, { tables: TABLES, deps: [recherche] });
  const { donnees: compteurs } = useLecture(compteursRubriques, { tables: TABLES });

  const articles = donnees?.elements ?? [];
  const total = donnees?.total ?? 0;

  const enTete = (
    <View className="gap-4 px-4 pb-3 pt-2">
      <PageHeader
        title="Produits"
        count={{ n: total, label: total > 1 ? "produits au total" : "produit au total" }}
        actions={
          <>
            <Button variant="outline" size="sm" leftIcon="Upload" disabled onPress={() => {}}>
              Importer les Produits
            </Button>
            <Button size="sm" leftIcon="Plus" disabled onPress={() => {}}>
              Nouveau produit
            </Button>
          </>
        }
      />
      <Text variant="caption">
        La création et l'import de produits arrivent au lot 8.
      </Text>

      {/* Liens rapides de rubrique, avec leur compteur en pastille grise. */}
      <View className="flex-row flex-wrap gap-2">
        <Button variant="outline" size="sm" leftIcon="FolderTree" disabled onPress={() => {}}>
          {`Catégories  ${compteurs?.categories ?? 0}`}
        </Button>
        <Button variant="outline" size="sm" leftIcon="Tag" disabled onPress={() => {}}>
          {`Marques  ${compteurs?.marques ?? 0}`}
        </Button>
        <Button variant="outline" size="sm" leftIcon="Ruler" disabled onPress={() => {}}>
          {`Unités  ${compteurs?.unites ?? 0}`}
        </Button>
      </View>

      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder="Rechercher par nom, SKU ou code-barres..."
      />
    </View>
  );

  const rendu = (a: ArticleListe) => (
    <DataRow
      principal={a.nom}
      secondaire={[a.sku, a.categorie].filter(Boolean).join(" · ") || null}
      badge={a.actif ? undefined : <Badge tone="neutral">Inactif</Badge>}
      valeur={a.prix ? <StatValue value={formatPrice(a.prix)} tone="primary" /> : undefined}
      // `null` ne se lit JAMAIS comme zéro : un produit non suivi affiche « - »,
      // comme le back-office, et surtout pas « 0 » qui affirmerait une rupture.
      sousValeur={a.stockAffiche ?? (a.suitLeStock ? "—" : "Non suivi")}
      chevron={false}
    />
  );

  return (
    <Screen edges={[]} padded={false}>
      <DataList
        donnees={articles}
        cle={(a) => a.id}
        rendu={rendu}
        enTete={enTete}
        chargement={chargement && articles.length === 0}
        vide={{
          icon: "Package",
          titre: recherche ? "Aucun produit trouvé" : "Aucun produit",
          message: recherche
            ? "Aucun produit ne correspond à vos critères de recherche."
            : "Commencez par ajouter votre premier produit.",
        }}
      />
    </Screen>
  );
}
