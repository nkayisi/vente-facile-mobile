/**
 * Créances, ventilées par devise ET par ancienneté.
 * Miroir de `app/dashboard/reports/receivables/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE RAPPORT QUE LE BACK-OFFICE A MIS LE PLUS LONGTEMPS À OBTENIR JUSTE.   │
 * │                                                                          │
 * │ Additionner des dettes en francs et en dollars produit un nombre qui     │
 * │ n'existe pas, et sur lequel un marchand décide pourtant de relancer ou   │
 * │ non. La ventilation par devise n'est donc pas une finesse : c'est la     │
 * │ seule présentation vraie.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { useMonnaie } from "@/data/devises";
import { chargerCreances, type Creances } from "@/data/rapports";
import { useEnLigne } from "@/data/reseau";
import { useSession } from "@/session/provider";
import {
  AppBar, Banner, Card, CardHeader, Divider, ProgressBar, Screen, Spinner,
  StatValue, Text,
} from "@/ui";

export default function EcranCreances() {
  const money = useMonnaie();
  const { snapshot } = useSession();
  const enLigne = useEnLigne();
  const [creances, setCreances] = useState<Creances | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const organisation = snapshot?.organization.id ?? "";
  const devisePrincipale =
    snapshot?.currencies?.find((d) => d.is_primary)?.currency_code ?? "CDF";

  const charger = useCallback(async () => {
    if (!organisation) return;
    setChargement(true);
    setErreur(null);
    try {
      setCreances(
        await chargerCreances({ organisation, money: money.money, devisePrincipale })
      );
    } catch (e) {
      setErreur(enLigne ? (e instanceof Error ? e.message : "Échec") : "hors-ligne");
      setCreances(null);
    } finally {
      setChargement(false);
    }
  }, [organisation, devisePrincipale, money.money, enLigne]);

  useEffect(() => {
    void charger();
  }, [charger]);

  return (
    <Screen scroll padded={false} onRefresh={() => void charger()} refreshing={chargement}>
      <AppBar title="Créances" subtitle="Balance âgée, par devise" />

      <View className="gap-4 p-4">
        {erreur === "hors-ligne" ? (
          <Banner
            tone="warning"
            title="Les créances demandent une connexion"
            message="Le calcul de la balance âgée vient du serveur, pour qu'il ne diffère jamais de celui du back-office."
            action={{ label: "Réessayer", onPress: () => void charger() }}
          />
        ) : erreur ? (
          <Banner
            tone="destructive"
            title="Chargement impossible"
            message={erreur}
            action={{ label: "Réessayer", onPress: () => void charger() }}
          />
        ) : null}

        {chargement && !creances ? (
          <View className="items-center py-8">
            <Spinner />
          </View>
        ) : null}

        {creances?.parDevise.length === 0 && !chargement && !erreur ? (
          <Card>
            <Text variant="bodySmall">
              Aucune créance en cours : toutes les factures sont soldées.
            </Text>
          </Card>
        ) : null}

        {creances?.parDevise.map((d) => (
          <Card key={d.devise}>
            <CardHeader title={d.devise} />
            <StatValue value={money.money(d.total, d.devise)} tone="destructive" />
            <View className="mt-3 gap-2">
              {d.tranches.map((t) => (
                <View key={t.label}>
                  <View className="flex-row items-baseline justify-between gap-3">
                    <Text variant="caption">{t.label}</Text>
                    <Text variant="bodySmall" numeric className="font-sans-medium">
                      {money.money(t.montant, d.devise)}
                    </Text>
                  </View>
                  {/* La barre dit la PART de chaque tranche : c'est ce qui
                      montre qu'une dette vieillit, plus qu'un montant seul. */}
                  <View className="mt-1">
                    <ProgressBar
                      valeur={t.montant}
                      max={d.total || 1}
                      tone={
                        t.label === "90 j et +"
                          ? "destructive"
                          : t.label === "60-90 j"
                            ? "warning"
                            : "primary"
                      }
                    />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
