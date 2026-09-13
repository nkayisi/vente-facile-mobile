/**
 * Fiche d'un article. Miroir de `app/dashboard/products/[id]`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX CANAUX, CHACUN AVEC SON COUPLE ACHAT / VENTE, et une marge          │
 * │ CALCULÉE SUR LE PRIX DE VENTE.                                          │
 * │                                                                          │
 * │ La calculer sur le prix d'achat donnerait un chiffre plus flatteur et    │
 * │ faux. C'est la convention posée à la session 2026-08-15, et elle vaut de │
 * │ la même façon sur les deux surfaces.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `null` ne se lit jamais comme zéro : un prix non défini s'écrit « Non
 * défini », et une marge inconnue « — » plutôt que « 0 % ».
 */
import { useCallback } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatFixedFr, formatPrice, pluralizeUnit } from "@vente-facile/core";

import { detailArticle } from "@/data/articles";
import { VignetteArticle } from "@/ui";
import { useLecture } from "@/data/live";
import {
  AppBar, Badge, Card, CardHeader, Divider, EmptyState, Screen, Spinner,
  StatValue, Text,
} from "@/ui";

const TABLES = ["products", "categories", "brands", "units", "stocks", "warehouses"];

function Paire({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 py-1">
      <Text variant="bodySmall" numberOfLines={1} className="min-w-0 flex-1 text-muted-foreground">
        {label}
      </Text>
      <Text variant="bodySmall" numeric className="shrink-0 font-sans-medium">
        {valeur}
      </Text>
    </View>
  );
}

export default function FicheArticle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const charger = useCallback(() => detailArticle(id), [id]);
  const { donnees: a, chargement, erreur } = useLecture(charger, {
    tables: TABLES,
    deps: [id],
  });

  if (chargement && !a) {
    return (
      <Screen>
        <AppBar title="Article" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UNE LECTURE QUI ÉCHOUE N'EST PAS UN ARTICLE ABSENT.                  │
   * │                                                                      │
   * │ `useLecture` range l'erreur À PART et laisse `donnees` à `null` : la │
   * │ fiche concluait donc « Article introuvable - il n'est pas encore     │
   * │ descendu sur ce terminal » sur une requête qui avait PLANTÉ. Le      │
   * │ marchand va synchroniser, rien ne change, et il n'a aucun moyen de   │
   * │ savoir que le problème n'est pas là où l'écran le désigne.           │
   * │                                                                      │
   * │ C'est la règle « `null` ne se lit jamais comme zéro », appliquée à   │
   * │ une lecture : absent et illisible sont deux états distincts.         │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  if (erreur) {
    return (
      <Screen padded={false}>
        <AppBar title="Article" />
        <EmptyState
          icon="AlertTriangle"
          title="Fiche illisible"
          message={erreur.message || "La fiche n'a pas pu être lue sur ce terminal."}
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  if (!a) {
    return (
      <Screen padded={false}>
        <AppBar title="Article" />
        <EmptyState
          icon="Package"
          title="Article introuvable"
          message="Il n'est pas encore descendu sur ce terminal, ou il a été supprimé."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false}>
      <AppBar
        title={a.nom}
        subtitle={[a.sku, a.categorie].filter(Boolean).join(" · ")}
        right={a.actif ? undefined : <Badge tone="neutral">Inactif</Badge>}
      />

      <View className="gap-4 p-4">
        {/* La photo en tête, comme la fiche du back-office. Elle n'apparaît
            que si l'article en porte une : une case vide de cent points en
            haut d'une fiche ne dit rien et repousse les prix hors de l'écran,
            alors que la majorité des articles n'ont pas de photo. */}
        {a.image ? (
          <Card>
            <View className="items-center">
              <VignetteArticle uri={a.image} taille="lg" />
            </View>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Prix" />
          <View>
            {a.prix.map((c, i) => (
              <View key={c.canal}>
                {i > 0 ? (
                  <View className="my-2">
                    <Divider />
                  </View>
                ) : null}
                <Text variant="label" className="mb-1">
                  {c.label}
                </Text>
                <Paire
                  label="Achat"
                  valeur={c.achat != null ? formatPrice(c.achat) : "Non défini"}
                />
                <Paire
                  label="Vente"
                  valeur={c.vente != null ? formatPrice(c.vente) : "Non défini"}
                />
                <Paire
                  label="Marge (sur le prix de vente)"
                  valeur={
                    c.margePourcent != null
                      ? `${formatFixedFr(c.margePourcent, 1)} %`
                      : "—"
                  }
                />
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <CardHeader title="Conditionnement" />
          <View>
            <Paire label="Unité de détail" valeur={a.uniteDetail ?? "Non définie"} />
            {a.unitesParContenant && a.unitesParContenant > 1 ? (
              <Paire
                label="Contenant"
                valeur={`${a.unitesParContenant} ${pluralizeUnit(a.uniteDetail ?? "unité", a.unitesParContenant)} par ${a.uniteContenant ?? "contenant"}`}
              />
            ) : (
              <Paire label="Contenant" valeur="Vendu à l'unité seule" />
            )}
            <Paire
              label="Suivi de stock"
              valeur={a.suitLeStock ? "Activé" : "Non suivi"}
            />
            {a.suitLeStock ? (
              <Paire
                label="Seuil de réassort"
                valeur={a.seuilReassort > 0 ? String(a.seuilReassort) : "Non défini"}
              />
            ) : null}
            <Paire
              label="Taxe"
              valeur={a.taxable ? `${a.tauxTaxe} %` : "Non taxable"}
            />
          </View>
        </Card>

        {a.suitLeStock ? (
          <Card>
            <CardHeader title="Stock par entrepôt" />
            <View>
              {a.stocks.length === 0 ? (
                // `null` ne se lit pas comme zéro : « aucune ligne » n'est pas
                // « zéro en rayon ».
                <Text variant="caption">Aucune ligne de stock pour cet article.</Text>
              ) : (
                a.stocks.map((s) => (
                  <Paire key={s.entrepot} label={s.entrepot} valeur={s.affiche} />
                ))
              )}
            </View>
          </Card>
        ) : null}

        {a.description ? (
          <Card>
            <CardHeader title="Description" />
            <Text variant="bodySmall">{a.description}</Text>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Identification" />
          <View>
            {a.sku ? <Paire label="SKU" valeur={a.sku} /> : null}
            {a.codeBarres ? <Paire label="Code-barres" valeur={a.codeBarres} /> : null}
            {a.marque ? <Paire label="Marque" valeur={a.marque} /> : null}
            {a.categorie ? <Paire label="Catégorie" valeur={a.categorie} /> : null}
          </View>
        </Card>
      </View>
    </Screen>
  );
}
