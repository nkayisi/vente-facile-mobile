/**
 * Détail d'un ajustement. Miroir de `stock/adjustments/[id]/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCART EST VENTILÉ PAR CANAL : « -2 casiers, +5 bouteilles ».          │
 * │                                                                          │
 * │ Un manquant de scellés et un surplus d'unités isolées se compensent dans │
 * │ le total et y DISPARAISSENT. Ventilés, chacun désigne sa cause : l'un    │
 * │ ressemble à un vol de carton, l'autre à une erreur de comptage au        │
 * │ détail. La virgule remplace le « + » pour qu'on ne lise pas un signe     │
 * │ comme une addition.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Approuver APPLIQUE l'écart au stock. C'est irréversible, et le dialogue le
 * dit avant, pas après.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateTimeFr, formatPrice } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { STATUT_AJUSTEMENT, detailAjustement } from "@/data/stock-operations";
import { enAttenteSurStock, transitionAjustement } from "@/features/stock/actes";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import {
  AlertDialog, AppBar, Badge, Button, Card, CardHeader, Divider,
  EmptyState, Screen, Spinner, StatValue, Text, useToast,
} from "@/ui";

const TABLES = ["stock_adjustments", "stock_adjustment_items", "warehouses", "products"];

export default function DetailAjustementEcran() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { can } = useSession();
  const [confirmation, setConfirmation] = useState<"approve" | "reject" | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => detailAjustement(id), [id]);
  const { donnees: a, chargement } = useLecture(charger, { tables: TABLES, deps: [id] });
  const { donnees: attente } = useLecture(enAttenteSurStock, {
    tables: ["outbox_operations"],
  });

  if (chargement && !a) {
    return (
      <Screen>
        <AppBar title="Ajustement" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!a) {
    return (
      <Screen padded={false}>
        <AppBar title="Ajustement" />
        <EmptyState
          icon="SlidersHorizontal"
          title="Ajustement introuvable"
          message="Il n'est pas encore descendu sur ce terminal, ou il a été supprimé."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const s = STATUT_AJUSTEMENT[a.statut];
  const envoiEnFile = attente?.ajustements.get(a.id);
  const enFile = envoiEnFile !== undefined;
  const decidable = a.statut === "draft" && can("stock_adjustments.approve") && !enFile;

  const executer = async (transition: "approve" | "reject") => {
    if (envoi) return;
    setEnvoi(true);
    try {
      await transitionAjustement(a.id, transition);
      setConfirmation(null);
      toast.succes("Décision mise en file. Elle partira à la prochaine synchronisation.");
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "La décision n'a pas pu être mise en file.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar
        title={a.reference}
        subtitle={[a.typeLabel, a.entrepot].filter(Boolean).join(" · ")}
        right={s ? <Badge tone={s.ton}>{s.label}</Badge> : undefined}
      />

      <View className="gap-4 p-4">
        <BandeauEnvoi
          envoi={envoiEnFile}
          titre="Une décision attend son envoi"
          consequence="Le statut ne changera qu'après."
        />

        <Card>
          <Text variant="caption" className="mb-1">
            Valeur de l&apos;écart
          </Text>
          <StatValue
            value={formatPrice(a.valeurEcart)}
            tone={a.valeurEcart < 0 ? "destructive" : a.valeurEcart > 0 ? "success" : "foreground"}
          />
          {a.motif ? (
            <View className="mt-3">
              <Text variant="caption" className="mb-1">
                Motif
              </Text>
              <Text variant="bodySmall">{a.motif}</Text>
            </View>
          ) : null}
        </Card>

        {decidable ? (
          <View className="gap-2">
            <Button
              fullWidth
              size="lg"
              leftIcon="Check"
              onPress={() => setConfirmation("approve")}
            >
              Approuver et appliquer
            </Button>
            <Button
              variant="destructive"
              fullWidth
              leftIcon="XCircle"
              onPress={() => setConfirmation("reject")}
            >
              Rejeter
            </Button>
          </View>
        ) : null}

        <Card>
          <CardHeader title={`Articles (${a.lignes.length})`} />
          <View>
            {a.lignes.map((l, i) => (
              <View key={l.id}>
                {i > 0 ? <Divider /> : null}
                <View className="py-3">
                  <Text variant="bodySmall" className="font-sans-medium">
                    {l.produit}
                  </Text>
                  {l.sku ? <Text variant="caption">{l.sku}</Text> : null}
                  <View className="mt-1 flex-row items-baseline justify-between gap-3">
                    <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
                      {`Théorique ${l.attenduAffiche} · Compté ${l.compteAffiche}`}
                    </Text>
                    <Text
                      variant="bodySmall"
                      numeric
                      className={`shrink-0 font-sans-medium ${
                        l.ecart < 0 ? "text-destructive" : l.ecart > 0 ? "text-success" : ""
                      }`}
                    >
                      {l.ecartAffiche}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <CardHeader title="Informations" />
          <View className="gap-0.5">
            <Text variant="caption">{`Créé le ${a.cree ? formatDateTimeFr(a.cree) : "—"}`}</Text>
            {a.approuveLe ? (
              <Text variant="caption">{`Approuvé le ${formatDateTimeFr(a.approuveLe)}`}</Text>
            ) : null}
          </View>
        </Card>
      </View>

      <AlertDialog
        ouvert={confirmation !== null}
        titre={
          confirmation === "approve" ? "Appliquer cet ajustement ?" : "Rejeter cet ajustement ?"
        }
        message={
          confirmation === "approve"
            ? "Les écarts ci-dessus seront APPLIQUÉS au stock, et des mouvements seront écrits. Cette opération ne se défait pas."
            : "L'ajustement sera rejeté. Le stock ne bouge pas."
        }
        confirmer={confirmation === "approve" ? "Appliquer" : "Rejeter"}
        annuler="Revenir"
        destructif={confirmation === "reject"}
        enCours={envoi}
        onConfirmer={() => confirmation && void executer(confirmation)}
        onAnnuler={() => setConfirmation(null)}
      />
    </Screen>
  );
}
