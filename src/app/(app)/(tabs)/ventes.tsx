/**
 * Ventes. Miroir de `app/dashboard/sales/page.tsx`.
 *
 * Le hub du back-office, repris dans son ordre : le bouton d'ouverture du
 * comptoir, le bandeau d'état de session, les quatre relevés du jour à deux
 * colonnes, les quatre raccourcis à deux colonnes, puis les ventes du jour.
 *
 * **Aucun total n'est sommé entre devises** : `MultiCurrencyTotal` rend une
 * ligne par devise. Le back-office a dû l'apprendre à ses dépens.
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatPrice } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { STATUT_VENTE, depuis, relevesVentes, sessionOuverteResume } from "@/data/ventes";
import { useSession } from "@/session/provider";
import {
  ActionTile,
  Badge,
  Button,
  Card,
  CarteReleve,
  Divider,
  EmptyState,
  Icon,
  MultiCurrencyTotal,
  PageHeader,
  Screen,
  SearchInput,
  StatValue,
  Text,
} from "@/ui";

const TABLES = ["sales", "register_sessions", "registers", "customers"];

/** « Samedi 29 août », première lettre en capitale, comme le web. */
function dateDuJour(): string {
  const s = new Date().toLocaleDateString("fr-CD", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Ventes() {
  const { can } = useSession();
  const money = useMonnaie();
  const [recherche, setRecherche] = useState("");
  const { donnees: r } = useLecture(relevesVentes, { tables: TABLES });
  const { donnees: session } = useLecture(sessionOuverteResume, { tables: TABLES });

  const terme = recherche.trim().toLowerCase();
  const ventes = (r?.ventesDuJour ?? []).filter(
    (v) =>
      !terme ||
      v.reference.toLowerCase().includes(terme) ||
      (v.client ?? "").toLowerCase().includes(terme)
  );

  return (
    <Screen scroll edges={[]}>
      <PageHeader title="Ventes" subtitle={dateDuJour()} />

      {can("sales.create") ? (
        <View className="mt-4">
          <Button
            fullWidth
            size="lg"
            leftIcon="ShoppingCart"
            onPress={() => router.push("/vendre")}
          >
            {session ? "Ouvrir le point de vente" : "Ouvrir une session"}
          </Button>
        </View>
      ) : null}

      {/* Bandeau d'état de session : toujours présent, deux variantes. */}
      <View className="mt-4">
        {session ? (
          <Card className="border border-success/30 bg-success/10 p-4">
            <View className="flex-row items-start gap-3">
              <Icon name="CheckCircle2" size={20} color="success" />
              <View className="min-w-0 flex-1">
                <Text variant="label">{`Session ouverte · ${session.caisse}`}</Text>
                <Text variant="caption" numberOfLines={1}>
                  {[
                    depuis(session.ouverteLe),
                    `${session.nbVentes} ${session.nbVentes > 1 ? "ventes" : "vente"}`,
                    session.encaisseParDevise.length > 0
                      ? `${session.encaisseParDevise
                          .map((e) => money.money(e.montant, e.devise))
                          .join(" · ")} encaissés`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
            </View>
            <View className="mt-3">
              <Button variant="outline" size="sm" onPress={() => router.push("/vendre")}>
                Continuer à vendre
              </Button>
            </View>
          </Card>
        ) : (
          <Card className="border border-dashed border-border p-4">
            <View className="flex-row items-start gap-3">
              <Icon name="Clock" size={20} color="mutedForeground" />
              <View className="min-w-0 flex-1">
                <Text variant="label">Aucune session ouverte</Text>
                <Text variant="caption">
                  Ouvrez une session de caisse pour encaisser des ventes.
                </Text>
              </View>
            </View>
          </Card>
        )}
      </View>

      {/* Quatre relevés du jour, deux colonnes, dans l'ordre du web. */}
      <View className="mt-4 flex-row flex-wrap gap-4">
        <CarteReleve
          label="Ventes du jour"
          icone={
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-success/15">
              <Icon name="Banknote" size={18} color="success" />
            </View>
          }
        >
          <MultiCurrencyTotal
            lignes={r?.totalParDevise ?? []}
            money={money.money}
            vide={formatPrice(0)}
          />
        </CarteReleve>

        <CarteReleve
          label="Transactions"
          icone={
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-chart-2/15">
              <Icon name="Receipt" size={18} color="chart2" />
            </View>
          }
        >
          <StatValue value={String(r?.transactions ?? 0)} />
        </CarteReleve>

        <CarteReleve
          label="Panier moyen"
          icone={
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-chart-5/15">
              <Icon name="TrendingUp" size={18} color="chart5" />
            </View>
          }
        >
          <MultiCurrencyTotal
            lignes={r?.panierMoyenParDevise ?? []}
            money={money.money}
            vide={formatPrice(0)}
          />
        </CarteReleve>

        <CarteReleve
          label={
            r && r.nbAEncaisser > 0
              ? `À encaisser · ${r.nbAEncaisser} ${r.nbAEncaisser > 1 ? "ventes" : "vente"}`
              : "À encaisser"
          }
          icone={
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-warning/15">
              <Icon name="Clock" size={18} color="warning" />
            </View>
          }
        >
          <MultiCurrencyTotal
            lignes={r?.aEncaisserParDevise ?? []}
            money={money.money}
            tone={r && r.nbAEncaisser > 0 ? "warning" : "foreground"}
            vide={formatPrice(0)}
          />
        </CarteReleve>
      </View>

      {/* Quatre raccourcis, DEUX COLONNES comme le web à cette largeur. */}
      <View className="mt-4 flex-row flex-wrap gap-3">
        <ActionTile
          href="/ventes"
          forme="grille"
          title="Paiements en attente"
          icon="Banknote"
          accent="primary"
          raison="Arrive au lot 6."
        />
        <ActionTile
          href="/ventes"
          forme="grille"
          title="Historique"
          icon="Receipt"
          accent="chart2"
          raison="Arrive au lot 6."
        />
        <ActionTile
          href="/ventes"
          forme="grille"
          title="Caisses"
          icon="Calculator"
          accent="chart3"
          raison="Arrive au lot 6."
        />
        <ActionTile
          href="/ventes"
          forme="grille"
          title="Devis"
          icon="FileText"
          accent="primary"
          raison="Arrive au lot 11."
        />
      </View>

      {/* Ventes du jour, avec son compteur entre parenthèses comme le web. */}
      <View className="mt-6">
        <Text variant="h4" className="mb-3">
          {`Ventes du jour (${ventes.length})`}
        </Text>
        <View className="mb-3">
          <SearchInput
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Référence ou client..."
            accessibilityLabel="Rechercher une vente du jour"
          />
        </View>

        {ventes.length === 0 ? (
          <EmptyState
            icon="Receipt"
            title={terme ? "Aucune vente ne correspond" : "Aucune vente aujourd'hui"}
            message={
              terme
                ? "Essayez une autre référence ou un autre nom de client."
                : "Ouvrez le point de vente pour enregistrer votre première vente."
            }
          />
        ) : (
          <Card className="overflow-hidden p-0">
            {ventes.slice(0, 10).map((v, i) => {
              const st = STATUT_VENTE[v.statut] ?? { label: v.statut, ton: "neutral" as const };
              return (
                <View key={v.id}>
                  {i > 0 ? <Divider /> : null}
                  <View className="flex-row items-center gap-3 px-4 py-3">
                    <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Icon name="Receipt" size={16} color="mutedForeground" />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
                        {v.reference}
                      </Text>
                      <Text variant="caption" numberOfLines={1}>
                        {[
                          v.client ?? "Client anonyme",
                          v.date
                            ? v.date.toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <View className="shrink-0 items-end gap-1">
                      <Badge tone={st.ton}>{st.label}</Badge>
                      <Text variant="bodySmall" numeric className="font-sans-semibold">
                        {money.money(v.total, v.devise)}
                      </Text>
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
