/**
 * Tableau de bord. Miroir de `app/dashboard/page.tsx`.
 *
 * Le back-office rend ses quatre cartes de relevé **en UNE colonne** à 390
 * points (`grid-cols-1 md:grid-cols-2`) : libellé en haut à gauche, pastille à
 * droite, valeur dessous, ligne de variation en pied. C'est repris tel quel.
 *
 * Les graphiques attendent le lot 9 : `react-native-svg` est là, mais un
 * graphique sans les données agrégées du serveur serait une approximation, et
 * la doctrine du produit veut de toute façon des tableaux de montants complets
 * avant des courbes.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatNumber, formatPrice } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { alertes, ventesParJour } from "@/data/tableau-alertes";
import {
  LABELS_PERIODE,
  relevesTableauDeBord,
  type Periode,
} from "@/data/tableau-de-bord";
import { useSession } from "@/session/provider";
import {
  BarChart,
  Card,
  CardHeader,
  Divider,
  Icon,
  ListItem,
  MultiCurrencyTotal,
  PageHeader,
  Pressable,
  Screen,
  StatValue,
  Text,
  type IconName,
} from "@/ui";

const PERIODES: Periode[] = ["day", "week", "month", "year"];
const TABLES = ["sales", "sale_items", "customers"];

/** Carte de relevé du tableau de bord : libellé en haut, pastille à droite. */
function CarteKpi({
  label,
  icon,
  fond,
  jeton,
  children,
  pied,
}: {
  label: string;
  icon: IconName;
  fond: string;
  jeton: "success" | "primary" | "chart5" | "chart2";
  children: React.ReactNode;
  pied?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <View className="flex-row items-start justify-between gap-3">
        <Text variant="bodySmall" className="flex-1 font-sans-medium text-muted-foreground">
          {label}
        </Text>
        <View className={`h-10 w-10 items-center justify-center rounded-lg ${fond}`}>
          <Icon name={icon} size={20} color={jeton} />
        </View>
      </View>
      <View className="mt-2">{children}</View>
      {pied ? <View className="mt-2">{pied}</View> : null}
    </Card>
  );
}

/** « ↗ 100 % vs période précédente », comme le web. */
function Variation({ valeur }: { valeur: number | null }) {
  if (valeur === null) return null;
  const positif = valeur >= 0;
  return (
    <View className="flex-row items-center gap-1">
      <Icon
        name={positif ? "ArrowUpRight" : "ArrowDownRight"}
        size={14}
        color={positif ? "success" : "destructive"}
      />
      <Text variant="caption" className={positif ? "text-success" : "text-destructive"}>
        {`${Math.abs(Math.round(valeur))} %`}
      </Text>
      <Text variant="caption">vs période précédente</Text>
    </View>
  );
}

export default function TableauDeBord() {
  const { snapshot } = useSession();
  const money = useMonnaie();
  const [periode, setPeriode] = useState<Periode>("month");

  const charger = useCallback(() => relevesTableauDeBord(periode), [periode]);
  const { donnees: r } = useLecture(charger, { tables: TABLES, deps: [periode] });

  // La devise du GRAPHIQUE : la principale de l'établissement. Une série qui
  // mêlerait les devises ne dirait rien.
  const deviseGraphe =
    snapshot?.currencies?.find((d) => d.is_primary)?.currency_code ?? "CDF";
  const chargerSerie = useCallback(
    () => ventesParJour(deviseGraphe, 7),
    [deviseGraphe]
  );
  const { donnees: serie } = useLecture(chargerSerie, {
    tables: ["sales"],
    deps: [deviseGraphe],
  });
  const { donnees: lesAlertes } = useLecture(() => alertes(12), {
    tables: ["stocks", "products", "sales", "customers"],
  });
  const listeAlertes = lesAlertes ?? [];

  return (
    <Screen scroll edges={[]}>
      <PageHeader
        title="Tableau de bord"
        subtitle={`${snapshot?.organization.name ?? ""} • ${LABELS_PERIODE[periode].phrase}`}
      />

      {/* Sélecteur de période : les quatre boutons du web, « Mois » par défaut. */}
      <View className="mt-4 flex-row gap-2">
        {PERIODES.map((p) => {
          const actif = p === periode;
          return (
            <Pressable
              key={p}
              onPress={() => setPeriode(p)}
              haptic="selection"
              accessibilityRole="button"
              accessibilityState={{ selected: actif }}
              accessibilityLabel={LABELS_PERIODE[p].bouton}
              className={`h-9 flex-1 items-center justify-center rounded-lg border ${
                actif ? "border-primary bg-primary" : "border-border bg-card"
              }`}
            >
              <Text
                variant="bodySmall"
                className={
                  actif
                    ? "font-sans-medium text-primary-foreground"
                    : "font-sans-medium text-foreground"
                }
              >
                {LABELS_PERIODE[p].bouton}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Quatre cartes, UNE colonne : c'est ce que le web rend à cette largeur. */}
      <View className="mt-4 gap-4">
        <CarteKpi label="Ventes totales" icon="Banknote" fond="bg-success/15" jeton="success"
                  pied={<Variation valeur={r?.variationVentes ?? null} />}>
          <MultiCurrencyTotal lignes={r?.ventes ?? []} money={money.money} vide={formatPrice(0)} />
        </CarteKpi>

        <CarteKpi label="Total clients" icon="Users" fond="bg-primary/10" jeton="primary"
                  pied={
                    <Text variant="caption">
                      <Text variant="caption" className="text-success">{`+${r?.nouveauxClients ?? 0} `}</Text>
                      nouveaux cette période
                    </Text>
                  }>
          <StatValue value={formatNumber(r?.clients ?? 0)} />
        </CarteKpi>

        <CarteKpi label="Unités vendues" icon="Package" fond="bg-chart-5/15" jeton="chart5">
          <StatValue value={formatNumber(r?.unitesVendues ?? 0)} />
        </CarteKpi>

        <CarteKpi label="Bénéfice brut" icon="TrendingUp" fond="bg-chart-2/15" jeton="chart2"
                  pied={
                    r?.marge != null ? (
                      <Text variant="caption">{`Marge : ${r.marge.toFixed(1)} %`}</Text>
                    ) : null
                  }>
          <MultiCurrencyTotal lignes={r?.benefice ?? []} money={money.money} vide={formatPrice(0)} />
        </CarteKpi>
      </View>

      {/* L'ÉVOLUTION, dans UNE devise nommée. Empiler des francs et des
          dollars dessinerait une courbe qui ne veut rien dire. */}
      <View className="mt-6">
        <Card>
          <CardHeader
            title="Ventes des 7 derniers jours"
            subtitle={`En ${deviseGraphe}`}
          />
          <BarChart
            points={serie ?? []}
            formater={(v: number) => money.money(v, deviseGraphe)}
          />
        </Card>
      </View>

      <View className="mt-6">
        <Text variant="h4" className="mb-3">
          {`Alertes (${listeAlertes.length})`}
        </Text>
        {listeAlertes.length === 0 ? (
          <Card>
            <Text variant="bodySmall">
              Rien à signaler : aucune rupture, aucun stock bas, aucune facture en
              retard.
            </Text>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            {listeAlertes.map((a, i) => (
              <View key={a.id}>
                {i > 0 ? <Divider /> : null}
                <ListItem
                  title={a.titre}
                  subtitle={a.detail}
                  icon={
                    a.genre === "rupture"
                      ? "PackageX"
                      : a.genre === "stock_bas"
                        ? "TrendingDown"
                        : "Clock"
                  }
                  chevron={Boolean(a.cible)}
                  onPress={a.cible ? () => router.push(a.cible as never) : undefined}
                />
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
