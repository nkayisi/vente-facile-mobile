/**
 *
 * Le même corps sert la route et, sur un grand écran, le volet de droite de
 * le catalogue : il lit son identifiant par `useIdDeFiche()` et en sort par
 * `useSortieDeFiche()` (voir `ui/liste-fiche.tsx`).
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
 * défini », et une marge inconnue « - » plutôt que « 0 % ».
 */
import { useCallback } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  formatFixedFr,
  formatPrice,
  formatUnitQuantity,
  formatQuantity,
} from "@vente-facile/core";

import { articleAEditer, detailArticle } from "@/data/articles";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import { useMonnaie } from "@/data/devises";
import { prixAvecEquivalent } from "@/features/pos/affichage-devise";
import { useLecture } from "@/data/live";
import {
  Flux,
  AppBar, Badge, Card, CardHeader, Divider, EmptyState, IconButton, Screen, Spinner,
  Text, VignetteArticle,
  useIdDeFiche,
  useSortieDeFiche,
} from "@/ui";

// `pending_product_photos` : au retour de la modification, la photo qu'on vient
// de prendre doit paraître sur la fiche (`data/image-article.ts`).
const TABLES = [
  "products", "categories", "brands", "units", "stocks", "warehouses", "pending_product_photos",
];

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

export function FicheArticle() {
  const id = useIdDeFiche();
  const sortir = useSortieDeFiche();

  // L'équivalent dans l'AUTRE devise de l'établissement, la même règle que
  // les cartes du comptoir : la facture reste libellée en devise principale.
  const money = useMonnaie();
  const converti = (prix: number) => prixAvecEquivalent(prix, money).equivalent;
  const charger = useCallback(() => detailArticle(id), [id]);
  const { donnees: a, chargement, erreur } = useLecture(charger, {
    tables: TABLES,
    deps: [id],
  });
  const { can } = useSession();
  // Une modification encore en file : la fiche affiche ce que le SERVEUR sait,
  // et le DIT. Les tables tirées ne sont écrites que par le tirage.
  const chargerAttente = useCallback(() => articleAEditer(id), [id]);
  const { donnees: attente } = useLecture(chargerAttente, {
    tables: ["outbox_operations", "products"],
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
          action={{ label: "Retour", onPress: sortir }}
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
          action={{ label: "Retour", onPress: sortir }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false}>
      <AppBar
        title={a.nom}
        subtitle={[a.sku, a.categorie].filter(Boolean).join(" · ")}
        right={
          <View className="flex-row items-center gap-1">
            {a.actif ? null : <Badge tone="neutral">Inactif</Badge>}
            {can("products.edit") ? (
              <IconButton
                name="Pencil"
                label="Modifier l'article"
                texte="Modifier"
                variant="ghost"
                onPress={() => router.push(`/article/nouveau?id=${id}`)}
              />
            ) : null}
          </View>
        }
      />

      <View className="gap-4 p-4">
        <BandeauEnvoi
          envoi={attente?.envoiModification}
          titre="Une modification attend son envoi"
          consequence="La fiche et le comptoir montreront les nouvelles valeurs après l'envoi."
        />
        {/* La photo en tête, comme la fiche du back-office. Elle n'apparaît
            que si l'article en porte une : une case vide de cent points en
            haut d'une fiche ne dit rien et repousse les prix hors de l'écran,
            alors que la majorité des articles n'ont pas de photo. */}
        <Flux className="gap-4">
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
                  {/*
                    ⚠ LE PRIX CONVERTI SUIT LE PRIX DE VENTE, il ne le remplace
                    pas, et il ne paraît que sur un établissement multi-devise.
                    La facture reste libellée en devise principale : montrer le
                    converti seul ferait croire que le ticket sortira ainsi.
                    T10 du retour de test.
                  */}
                  {c.vente != null && converti(c.vente) ? (
                    <Paire label="Soit" valeur={converti(c.vente)!} />
                  ) : null}
                  <Paire
                    label="Marge (sur le prix de vente)"
                    valeur={
                      c.margePourcent != null
                        ? `${formatFixedFr(c.margePourcent, 1)} %`
                        : "-"
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
                  valeur={`${formatUnitQuantity(a.unitesParContenant, a.uniteDetail ?? "unité")} par ${a.uniteContenant ?? "contenant"}`}
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
                  valeur={a.seuilReassort > 0 ? formatQuantity(a.seuilReassort) : "Non défini"}
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
        </Flux>
      </View>
    </Screen>
  );
}
