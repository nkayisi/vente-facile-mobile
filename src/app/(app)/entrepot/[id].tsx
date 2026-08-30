/**
 * Fiche d'un entrepôt. Miroir de `stock/warehouses/[id]/page.tsx`.
 *
 * **« Unités au total » additionne des unités de PRODUITS DIFFÉRENTS**, donc
 * des choses qui ne s'additionnent pas vraiment. Le libellé le dit, faute de
 * quoi le nombre se lit comme un nombre de contenants : c'est la correction que
 * le back-office a dû appliquer à cette même carte.
 */
import { useCallback } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatNumber, formatPrice } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { detailEntrepot } from "@/data/stock";
import {
  AppBar, Badge, Button, Card, CardHeader, EmptyState, Screen, Spinner,
  StatStrip, StatStripItem, StatValue, Text,
} from "@/ui";

const TABLES = ["warehouses", "stocks", "products"];

export default function FicheEntrepot() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const charger = useCallback(() => detailEntrepot(id), [id]);
  const { donnees: e, chargement } = useLecture(charger, { tables: TABLES, deps: [id] });

  if (chargement && !e) {
    return (
      <Screen>
        <AppBar title="Entrepôt" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!e) {
    return (
      <Screen padded={false}>
        <AppBar title="Entrepôt" />
        <EmptyState
          icon="Warehouse"
          title="Entrepôt introuvable"
          message="Il n'est pas encore descendu sur ce terminal, ou il a été supprimé."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false}>
      <AppBar
        title={e.nom}
        subtitle={e.code}
        right={
          e.parDefaut ? (
            <Badge tone="primary">Principal</Badge>
          ) : !e.actif ? (
            <Badge tone="neutral">Inactif</Badge>
          ) : undefined
        }
      />

      <View className="gap-4 p-4">
        <Card>
          <Text variant="caption" className="mb-1">
            Valeur du stock
          </Text>
          <StatValue value={formatPrice(e.valeurStock)} />
        </Card>

        <StatStrip>
          <StatStripItem label="Produits" value={String(e.produits)} icon="Package" />
          <StatStripItem
            label="Unités au total"
            value={formatNumber(e.unitesAuTotal)}
            icon="Boxes"
          />
          <StatStripItem
            label="Stock bas"
            value={String(e.stockBas)}
            icon="AlertTriangle"
            tone={e.stockBas > 0 ? "warn" : undefined}
          />
          <StatStripItem
            label="En rupture"
            value={String(e.enRupture)}
            icon="PackageX"
            tone={e.enRupture > 0 ? "alert" : undefined}
          />
        </StatStrip>
        <Text variant="caption">
          « Unités au total » additionne des unités de produits différents : elle
          mesure un volume, pas un nombre de contenants.
        </Text>

        <Card>
          <CardHeader title="Réglages" />
          <View className="gap-1">
            {e.adresse ? <Text variant="bodySmall">{e.adresse}</Text> : null}
            <Text variant="caption">
              {e.stockNegatifAutorise
                ? "Le stock peut descendre sous zéro dans cet entrepôt."
                : "Le stock ne peut pas descendre sous zéro."}
            </Text>
          </View>
        </Card>

        <Button
          variant="outline"
          fullWidth
          leftIcon="Boxes"
          onPress={() => router.push("/rayon")}
        >
          Voir les niveaux de stock
        </Button>
      </View>
    </Screen>
  );
}
