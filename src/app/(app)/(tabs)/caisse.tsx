/**
 * Livre de caisse. Miroir de `app/dashboard/cashbook/page.tsx`.
 *
 * **Chaque carte de solde porte UNE LIGNE PAR DEVISE**, exactement comme le
 * back-office. Un solde de caisse est une somme d'espèces physiques : le tiroir
 * contient des billets de plusieurs devises, qui ne s'additionnent pas. Les
 * mouvements sont d'ailleurs déjà enregistrés dans la devise physique.
 */
import { View } from "react-native";
import { formatPrice } from "@vente-facile/core";

import {
  TYPE_MOUVEMENT,
  mouvementsCaisse,
  relevesCaisse,
  type ParDevise,
} from "@/data/caisse";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Icon,
  MultiCurrencyTotal,
  PageHeader,
  Screen,
  Text,
  type IconName,
} from "@/ui";

const TABLES = ["cash_movements", "expenses", "expense_categories"];

function CarteSolde({
  titre,
  icon,
  fond,
  jeton,
  lignes,
  signe,
  ton,
}: {
  titre: string;
  icon: IconName;
  fond: string;
  jeton: "chart2" | "success" | "destructive" | "chart5";
  lignes: ParDevise;
  signe?: "+" | "-";
  ton?: "success" | "destructive" | "foreground";
}) {
  const money = useMonnaie();
  return (
    <Card className="p-4">
      <View className="flex-row items-start justify-between gap-3">
        <Text variant="bodySmall" className="flex-1 font-sans-medium text-muted-foreground">
          {titre}
        </Text>
        <View className={`h-10 w-10 items-center justify-center rounded-lg ${fond}`}>
          <Icon name={icon} size={20} color={jeton} />
        </View>
      </View>
      <View className="mt-2">
        <MultiCurrencyTotal
          lignes={lignes.map((l) => ({
            ...l,
            montant: signe === "-" ? -Math.abs(l.montant) : l.montant,
          }))}
          money={money.money}
          tone={ton ?? "foreground"}
          vide={formatPrice(0)}
        />
      </View>
    </Card>
  );
}

export default function Caisse() {
  const money = useMonnaie();
  const { donnees: r } = useLecture(relevesCaisse, { tables: TABLES });
  const { donnees: mouvements } = useLecture(() => mouvementsCaisse(30), { tables: TABLES });

  return (
    <Screen scroll edges={[]}>
      <PageHeader
        title="Livre de caisse"
        subtitle="Suivi des entrées et sorties de caisse"
        actions={
          <>
            <Button variant="outline" size="sm" leftIcon="Receipt" disabled onPress={() => {}}>
              Dépenses
            </Button>
            <Button variant="outline" size="sm" leftIcon="Calendar" disabled onPress={() => {}}>
              Rapports de caisse
            </Button>
          </>
        }
      />
      <Text variant="caption" className="mt-1">
        La saisie d'entrées, les dépenses et les rapports arrivent au lot 9.
      </Text>

      {/* Quatre cartes, UNE colonne : c'est ce que le web rend à cette largeur. */}
      <View className="mt-4 gap-4">
        <CarteSolde titre="Solde de caisse" icon="Wallet" fond="bg-chart-2/15" jeton="chart2"
                    lignes={r?.solde ?? []} />
        <CarteSolde titre="Entrées du jour" icon="TrendingUp" fond="bg-success/15" jeton="success"
                    lignes={r?.entreesDuJour ?? []} ton="success" />
        <CarteSolde titre="Sorties du jour" icon="TrendingDown" fond="bg-destructive/15"
                    jeton="destructive" lignes={r?.sortiesDuJour ?? []} signe="-" ton="destructive" />
        <CarteSolde titre="Net du jour" icon="ArrowLeftRight" fond="bg-chart-5/15" jeton="chart5"
                    lignes={r?.netDuJour ?? []} />
      </View>

      <View className="mt-6">
        <Text variant="h4" className="mb-3">
          {`Mouvements (${mouvements?.length ?? 0})`}
        </Text>
        {(mouvements ?? []).length === 0 ? (
          <EmptyState
            icon="Wallet"
            title="Aucun mouvement trouvé"
            message="Les entrées et sorties de caisse apparaîtront ici."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            {(mouvements ?? []).map((m, i) => {
              const entree = m.direction === "in";
              return (
                <View key={m.id} className={m.annule ? "opacity-50" : undefined}>
                  {i > 0 ? <Divider /> : null}
                  <View className="flex-row items-center gap-3 px-4 py-3">
                    <View
                      className={`h-9 w-9 items-center justify-center rounded-lg ${
                        entree ? "bg-success/15" : "bg-destructive/15"
                      }`}
                    >
                      <Icon
                        name={entree ? "ArrowDownRight" : "ArrowUpRight"}
                        size={16}
                        color={entree ? "success" : "destructive"}
                      />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
                        {m.description?.trim() || TYPE_MOUVEMENT[m.type] || m.type}
                      </Text>
                      <Text variant="caption" numberOfLines={1}>
                        {[
                          TYPE_MOUVEMENT[m.type] ?? m.type,
                          m.date ? m.date.toLocaleDateString("fr-CD") : null,
                          m.reference,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <View className="shrink-0 items-end gap-1">
                      <Text
                        variant="bodySmall"
                        numeric
                        className={
                          entree
                            ? "font-sans-semibold text-success"
                            : "font-sans-semibold text-destructive"
                        }
                      >
                        {`${entree ? "+" : "-"}${money.money(m.montant, m.devise)}`}
                      </Text>
                      {m.annule ? <Badge tone="neutral">Annulé</Badge> : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
      </View>
    </Screen>
  );
}
