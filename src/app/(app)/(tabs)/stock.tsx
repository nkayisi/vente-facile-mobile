/**
 * Gestion de stock. Miroir de `app/dashboard/stock/page.tsx`.
 *
 * C'est la page la plus aboutie du back-office en langage visuel, et elle est
 * reprise telle quelle : bandeau de relevés à deux colonnes, section
 * « Opérations » à quatre raccourcis, puis les entrepôts.
 *
 * **Les relevés sont réels**, lus dans les tables tirées : l'écran est juste
 * hors ligne. Les actions d'écriture attendent le lot 7 et le disent.
 *
 * Écart au web assumé : les quatre raccourcis sont en UNE colonne. Le web écrit
 * `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`, donc à 390 points il rend lui
 * aussi une seule colonne : c'est la parité exacte, pas une simplification.
 */
import { View } from "react-native";
import { formatNumber, formatPrice } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { entrepots, relevesStock } from "@/data/stock";
import {
  ActionTile,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Screen,
  SearchInput,
  Section,
  StatStrip,
  StatStripItem,
  Text,
} from "@/ui";
import { useState } from "react";

const TABLES = ["stocks", "products", "warehouses"];

export default function Stock() {
  const [recherche, setRecherche] = useState("");
  const { donnees: r } = useLecture(relevesStock, { tables: TABLES });
  const { donnees: liste } = useLecture(entrepots, { tables: TABLES });

  const filtres = (liste ?? []).filter((w) =>
    `${w.nom} ${w.code}`.toLowerCase().includes(recherche.trim().toLowerCase())
  );

  return (
    <Screen scroll>
      <PageHeader
        title="Gestion de stock"
        subtitle="Vue d'ensemble de vos entrepôts, niveaux de stock et mouvements"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              leftIcon="Activity"
              disabled
              onPress={() => {}}
            >
              Entrée de stock
            </Button>
            <Button size="sm" leftIcon="Plus" disabled onPress={() => {}}>
              Nouvel entrepôt
            </Button>
          </>
        }
      />
      <Text variant="caption" className="mt-1">
        La saisie de mouvements et la création d'entrepôts arrivent au lot 7.
      </Text>

      {/* Les six relevés, dans l'ordre EXACT du back-office. */}
      <View className="mt-5">
        <StatStrip>
          <StatStripItem label="Entrepôts" value={String(r?.entrepots ?? 0)} icon="Warehouse" />
          <StatStripItem
            label="Produits en stock"
            value={String(r?.produitsEnStock ?? 0)}
            icon="Package"
          />
          <StatStripItem
            label="Unités au total"
            value={formatNumber(r?.unitesAuTotal ?? 0)}
            icon="Boxes"
          />
          <StatStripItem
            label="Stock bas"
            value={String(r?.stockBas ?? 0)}
            icon="TrendingDown"
            tone="warn"
          />
          <StatStripItem
            label="En rupture"
            value={String(r?.enRupture ?? 0)}
            icon="PackageX"
            tone="alert"
          />
          <StatStripItem
            label="Valeur totale"
            value={formatPrice(r?.valeurTotale ?? 0)}
            icon="BarChart3"
            tone="accent"
          />
        </StatStrip>
      </View>

      {/* Section « Opérations », titre et libellés repris mot pour mot. */}
      <View className="mt-6">
        <Text variant="h4" className="mb-3">
          Opérations
        </Text>
        <View className="gap-3">
          <ActionTile
            href="/stock"
            title="Niveaux de stock"
            description="Ce qui reste en rayon"
            icon="Package"
            accent="primary"
            raison="Arrive au lot 7."
          />
          <ActionTile
            href="/mouvements"
            title="Mouvements"
            description="Entrées et sorties"
            icon="ClipboardList"
            accent="chart2"
          />
          <ActionTile
            href="/stock"
            title="Transferts"
            description="D'un entrepôt à l'autre"
            icon="ArrowLeftRight"
            accent="chart3"
            raison="Arrive au lot 7."
          />
          <ActionTile
            href="/stock"
            title="Ajustements"
            description="Corriger un écart"
            icon="SlidersHorizontal"
            accent="primary"
            raison="Arrive au lot 7."
          />
        </View>
      </View>

      <View className="mt-6">
        <Text variant="h4" className="mb-3">
          Entrepôts
        </Text>
        <View className="mb-3">
          <SearchInput valeur={recherche} onChange={setRecherche} placeholder="Rechercher..." />
        </View>

        {filtres.length === 0 ? (
          <EmptyState
            icon="Warehouse"
            title="Aucun entrepôt"
            message={
              recherche
                ? "Essayez un autre nom ou un autre code."
                : "Créez votre premier entrepôt pour commencer à gérer votre stock."
            }
          />
        ) : (
          <View className="gap-4">
            {filtres.map((w) => (
              <Card key={w.id} className="p-4">
                <View className="flex-row items-start gap-3">
                  <View className="h-9 w-9 items-center justify-center rounded-lg bg-chart-2/10">
                    <Icon name="Warehouse" size={18} color="chart2" />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text variant="label" numberOfLines={1}>
                      {w.nom}
                    </Text>
                    <Text variant="caption" numberOfLines={1}>
                      {w.code}
                    </Text>
                  </View>
                </View>

                {w.adresse ? (
                  <View className="mt-3 flex-row items-center gap-1.5">
                    <Icon name="MapPin" size={14} color="mutedForeground" />
                    <Text variant="caption" numberOfLines={1} className="flex-1">
                      {w.adresse}
                    </Text>
                  </View>
                ) : null}

                <View className="mt-3 flex-row items-center gap-2">
                  {w.parDefaut ? <Badge tone="neutral">Par défaut</Badge> : null}
                  <Badge tone={w.actif ? "success" : "neutral"}>
                    {w.actif ? "Actif" : "Inactif"}
                  </Badge>
                </View>

                <View className="mt-3 flex-row items-center justify-between border-t border-border pt-3">
                  <Text variant="muted">Valeur du stock</Text>
                  <Text variant="bodySmall" numeric className="font-sans-semibold">
                    {formatPrice(w.valeurStock)}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
