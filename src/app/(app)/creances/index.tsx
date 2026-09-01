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
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES QUATRE TRANCHES ANNONÇAIENT ZÉRO SOUS UN TOTAL DE DIX MILLE.        │
 * │                                                                          │
 * │ Trois des quatre champs lus n'existaient pas côté serveur, et le         │
 * │ quatrième lisait le PAS ENCORE ÉCHU sous l'étiquette « 0-30 j ». Le      │
 * │ correctif est dans `data/rapports.ts` ; ce qu'il change ici, c'est que   │
 * │ l'écran cesse de dire « rien n'est en retard » sur des créances qui le   │
 * │ sont toutes.                                                             │
 * │                                                                          │
 * │ Et un rapport de créances sert à RELANCER : la liste des débiteurs, que  │
 * │ le serveur rendait déjà (`by_customer`) et que le back-office affiche,   │
 * │ manquait entièrement. Une balance âgée sans nom ne dit pas à qui         │
 * │ téléphoner ; chaque ligne mène à la fiche du client.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useMonnaie } from "@/data/devises";
import { chargerCreances, type CleTranche, type Creances } from "@/data/rapports";
import { useEnLigne } from "@/data/reseau";
import { useSession } from "@/session/provider";
import {
  AppBar, Banner, Card, CardHeader, DataRow, Divider, ProgressBar, Screen,
  Spinner, StatStrip, StatStripItem, StatValue, Text,
} from "@/ui";

/**
 * Le ton d'une tranche.
 *
 * « Pas encore échu » n'est PAS une alerte : le peindre comme le reste ferait
 * du rouge la couleur normale de l'écran, et on ne verrait plus les vrais
 * retards. C'est la même règle que `StatStripItem`, qui ne colore pas un zéro.
 */
const TONS_TRANCHE: Record<CleTranche, "primary" | "warning" | "destructive"> = {
  current: "primary",
  d1_30: "primary",
  d31_60: "warning",
  d61_90: "warning",
  d90_plus: "destructive",
};

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

        {creances && creances.parDevise.length > 0 ? (
          <StatStrip>
            <StatStripItem
              label="Clients débiteurs"
              value={String(creances.nbDebiteurs)}
              icon="Users"
            />
            <StatStripItem
              label="Factures ouvertes"
              value={String(creances.nbFactures)}
              icon="Receipt"
            />
          </StatStrip>
        ) : null}

        {creances?.parDevise.map((d) => {
          // Rouge seulement s'il y a un retard : un total peint en destructif
          // quand tout est dans les délais fait crier l'écran pour rien.
          const echu = d.tranches
            .filter((t) => t.cle !== "current")
            .reduce((somme, t) => somme + t.montant, 0);
          return (
            <Card key={d.devise}>
              <CardHeader title={d.devise} />
              <StatValue
                value={money.money(d.total, d.devise)}
                tone={echu > 0 ? "destructive" : "foreground"}
              />
              <View className="mt-3 gap-2">
                {d.tranches.map((t) => (
                  <View key={t.cle}>
                    <View className="flex-row items-baseline justify-between gap-3">
                      <Text variant="caption">{t.label}</Text>
                      <Text
                        variant="bodySmall"
                        numeric
                        className={
                          t.montant > 0 && t.cle !== "current"
                            ? "font-sans-medium text-warning"
                            : "font-sans-medium"
                        }
                      >
                        {money.money(t.montant, d.devise)}
                      </Text>
                    </View>
                    {/* La barre dit la PART de chaque tranche : c'est ce qui
                        montre qu'une dette vieillit, plus qu'un montant seul. */}
                    <View className="mt-1">
                      <ProgressBar
                        valeur={t.montant}
                        max={d.total || 1}
                        tone={TONS_TRANCHE[t.cle]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          );
        })}

        {/* QUI relancer. Le serveur rendait déjà la liste ; sans elle, la
            balance âgée dit qu'il y a du retard sans dire chez qui, et le
            marchand doit rouvrir chaque fiche client une par une. */}
        {creances && creances.debiteurs.length > 0 ? (
          <View>
            <Text variant="h4" className="mb-3">
              Qui doit
            </Text>
            <Card className="overflow-hidden p-0">
              {creances.debiteurs.map((b, i) => (
                <View key={`${b.clientId}-${b.devise}`}>
                  {i > 0 ? <Divider /> : null}
                  <DataRow
                    principal={b.nom}
                    secondaire={[
                      `${b.nbFactures} ${b.nbFactures > 1 ? "factures" : "facture"}`,
                      // Zéro jour n'est pas « échue depuis 0 j » : rien n'est
                      // en retard, et le dire autrement inquiète pour rien.
                      b.plusAncienneJours > 0
                        ? `la plus ancienne échue depuis ${b.plusAncienneJours} j`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    valeur={
                      <Text variant="bodySmall" numeric className="font-sans-semibold">
                        {money.money(b.montant, b.devise)}
                      </Text>
                    }
                    sousValeur={
                      b.echu > 0 ? `${money.money(b.echu, b.devise)} échus` : null
                    }
                    icon="User"
                    onPress={
                      b.clientId
                        ? () => router.push(`/client/${b.clientId}` as never)
                        : undefined
                    }
                  />
                </View>
              ))}
            </Card>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
