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
import { router } from "expo-router";
import { formatPrice } from "@vente-facile/core";

import { compteursRubriques, listeArticles, type ArticleListe } from "@/data/articles";
import { useLecture } from "@/data/live";
import { FeuilleImportArticles } from "@/features/inventaire/feuille-import";
import { VignetteArticle } from "@/ui";
import { useSession } from "@/session/provider";
import {
  Badge,
  Button,
  DataList,
  DataRow,
  PageHeader,
  Screen,
  SearchInput,
  Mesure,
} from "@/ui";

const TABLES = ["products", "categories", "brands", "units", "stocks"];

export default function Articles() {
  const { can } = useSession();
  const [recherche, setRecherche] = useState("");
  const [importOuvert, setImportOuvert] = useState(false);
  // Un import réussi écrit dans `products` côté SERVEUR : la table locale ne
  // bouge qu'au prochain tirage, et `useLecture` n'a donc rien à écouter. Ce
  // compteur force la relecture, et la feuille dit d'aller synchroniser.
  const [apresImport, setApresImport] = useState(0);

  const charger = useCallback(() => listeArticles({ recherche, limite: 100 }), [recherche]);
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, apresImport],
  });
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
            {/* ┌──────────────────────────────────────────────────────────┐
                │ L'IMPORT NE RESTE PLUS AU SEUL BACK-OFFICE.              │
                │                                                          │
                │ Le bouton était DÉSACTIVÉ, au motif que relire des       │
                │ erreurs ligne à ligne se fait au clavier. C'est vrai du  │
                │ CONFORT, et faux du besoin : un marchand qui n'a qu'un   │
                │ téléphone ne pouvait pas garnir son catalogue du tout.   │
                │ La feuille le dit - le back-office reste plus            │
                │ confortable - au lieu de fermer la porte.                │
                │                                                          │
                │ Le classeur est lu par le SERVEUR : ses règles (codes    │
                │ déjà pris, plafond du plan, catégories créées au         │
                │ passage) ne sont pas recopiées ici.                      │
                └──────────────────────────────────────────────────────────┘ */}
            {can("products.create") ? (
              <Button
                variant="outline"
                size="sm"
                leftIcon="Upload"
                onPress={() => setImportOuvert(true)}
              >
                Importer les Produits
              </Button>
            ) : undefined}
            {can("products.create") ? (
              <Button
                size="sm"
                leftIcon="Plus"
                onPress={() => router.push("/article/nouveau")}
              >
                Nouveau produit
              </Button>
            ) : undefined}
          </>
        }
      />

      {/* Liens rapides de rubrique, avec leur compteur en pastille grise. */}
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          leftIcon="FolderTree"
          onPress={() => router.push("/referentiel")}
        >
          {`Catégories  ${compteurs?.categories ?? 0}`}
        </Button>
        <Button
          variant="outline"
          size="sm"
          leftIcon="Tag"
          onPress={() => router.push("/referentiel")}
        >
          {`Marques  ${compteurs?.marques ?? 0}`}
        </Button>
        <Button
          variant="outline"
          size="sm"
          leftIcon="Ruler"
          onPress={() => router.push("/referentiel")}
        >
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
      // La photo si l'article en porte une, l'icône colis sinon : la majorité
      // n'en a pas, et le repli doit rester identique partout.
      vignette={<VignetteArticle uri={a.image} />}
      principal={a.nom}
      secondaire={[a.sku, a.categorie].filter(Boolean).join(" · ") || null}
      badge={a.actif ? undefined : <Badge tone="neutral">Inactif</Badge>}
      valeur={a.prix ? <Mesure value={formatPrice(a.prix)} tone="primary" /> : undefined}
      // `null` ne se lit JAMAIS comme zéro : un produit non suivi affiche « - »,
      // comme le back-office, et surtout pas « 0 » qui affirmerait une rupture.
      sousValeur={a.stockAffiche ?? (a.suitLeStock ? "—" : "Non suivi")}
      onPress={() => router.push(`/article/${a.id}`)}
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

      {/* Rendue CONDITIONNELLEMENT : chaque ouverture est un montage, donc un
          formulaire vierge, sans effet de remise à zéro à tenir en phase. */}
      {importOuvert ? (
        <FeuilleImportArticles
          ouvert
          onFermer={() => setImportOuvert(false)}
          onImporte={() => setApresImport((n) => n + 1)}
        />
      ) : null}
    </Screen>
  );
}
