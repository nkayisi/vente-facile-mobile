/**
 * Détail d'un transfert. Miroir de `stock/transfers/[id]/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE TRANSITION NE SE RÉESSAIE PAS. Expédier un transfert déjà expédié le │
 * │ réexpédierait, et le stock sortirait deux fois. Le serveur refuse par un │
 * │ verdict `rejected`, jamais `retry` : l'opération part en quarantaine.    │
 * │                                                                          │
 * │ D'où la garde ici : dès qu'une transition attend dans le journal, les    │
 * │ boutons se ferment. Sans elle, un magasinier impatient sur un réseau     │
 * │ lent appuierait deux fois et remplirait sa quarantaine.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les quantités sont rendues dans les termes de la SAISIE, facteur figé sur la
 * ligne : un produit repassé de 24 à 12 par casier ne doit pas réécrire
 * l'historique.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateTimeFr } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { STATUT_TRANSFERT, detailTransfert } from "@/data/stock-operations";
import {
  enAttenteSurStock,
  transitionTransfert,
  type TransitionTransfert,
} from "@/features/stock/actes";
import { useSession } from "@/session/provider";
import {
  AlertDialog,
  AppBar,
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  Screen,
  Spinner,
  Text,
  useToast,
} from "@/ui";

const TABLES = ["stock_transfers", "stock_transfer_items", "warehouses", "products"];

/** Ce qui est proposé, selon l'état, et avec quelle permission. */
const ACTIONS: Record<
  TransitionTransfert,
  { label: string; depuis: string[]; permission: string; question: string }
> = {
  approve: {
    label: "Approuver",
    depuis: ["draft"],
    permission: "stock_transfers.ship",
    question: "Le transfert passera en attente d'expédition. Le stock ne bouge pas encore.",
  },
  ship: {
    label: "Expédier",
    depuis: ["draft", "pending"],
    permission: "stock_transfers.ship",
    question:
      "Le stock QUITTE l'entrepôt source dès maintenant. Cette opération ne se défait qu'en annulant le transfert.",
  },
  receive: {
    label: "Réceptionner",
    depuis: ["in_transit"],
    permission: "stock_transfers.receive",
    question:
      "Les quantités expédiées entrent dans l'entrepôt de destination. Une réception partielle se saisit depuis le back-office.",
  },
  cancel: {
    label: "Annuler",
    depuis: ["draft", "pending", "in_transit"],
    permission: "stock_transfers.cancel",
    question:
      "Le transfert est annulé. S'il était déjà expédié, le stock revient à l'entrepôt source.",
  },
};

export default function DetailTransfertEcran() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { can } = useSession();
  const [confirmation, setConfirmation] = useState<TransitionTransfert | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => detailTransfert(id), [id]);
  const { donnees: t, chargement } = useLecture(charger, { tables: TABLES, deps: [id] });
  const { donnees: attente } = useLecture(enAttenteSurStock, {
    tables: ["outbox_operations"],
  });

  if (chargement && !t) {
    return (
      <Screen>
        <AppBar title="Transfert" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!t) {
    return (
      <Screen padded={false}>
        <AppBar title="Transfert" />
        <EmptyState
          icon="ArrowLeftRight"
          title="Transfert introuvable"
          message="Il n'est pas encore descendu sur ce terminal, ou il a été supprimé."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const s = STATUT_TRANSFERT[t.statut];
  const enFile = attente?.transferts.has(t.id) ?? false;
  const possibles = (Object.keys(ACTIONS) as TransitionTransfert[]).filter(
    (a) => ACTIONS[a].depuis.includes(t.statut) && can(ACTIONS[a].permission)
  );

  const executer = async (transition: TransitionTransfert) => {
    if (envoi) return;
    setEnvoi(true);
    try {
      await transitionTransfert(t.id, transition);
      setConfirmation(null);
      toast.succes("Opération mise en file. Elle partira à la prochaine synchronisation.");
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "L'opération n'a pas pu être mise en file."
      );
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar
        title={t.reference}
        subtitle={`${t.source ?? "?"} → ${t.destination ?? "?"}`}
        right={s ? <Badge tone={s.ton}>{s.label}</Badge> : undefined}
      />

      <View className="gap-4 p-4">
        {enFile ? (
          <Banner
            tone="warning"
            title="Une opération attend son envoi"
            message="Le statut ci-dessus ne changera qu'après synchronisation. Les actions sont fermées d'ici là, pour ne pas expédier deux fois."
          />
        ) : null}

        {possibles.length > 0 && !enFile ? (
          <View className="gap-2">
            {possibles
              .filter((a) => a !== "cancel")
              .map((a) => (
                <Button
                  key={a}
                  fullWidth
                  size="lg"
                  onPress={() => setConfirmation(a)}
                  leftIcon={a === "ship" ? "Truck" : a === "receive" ? "Boxes" : "Check"}
                >
                  {ACTIONS[a].label}
                </Button>
              ))}
            {possibles.includes("cancel") ? (
              <Button
                variant="destructive"
                fullWidth
                leftIcon="XCircle"
                onPress={() => setConfirmation("cancel")}
              >
                Annuler le transfert
              </Button>
            ) : null}
          </View>
        ) : null}

        <Card>
          <CardHeader title="Informations" />
          <View>
            <Ligne label="Référence" valeur={t.reference} />
            <Ligne label="Source" valeur={t.source ?? "—"} />
            <Ligne label="Destination" valeur={t.destination ?? "—"} />
            <Ligne
              label="Demandé le"
              valeur={t.demandeLe ? formatDateTimeFr(t.demandeLe) : "—"}
            />
            {t.expedieLe ? (
              <Ligne label="Expédié le" valeur={formatDateTimeFr(t.expedieLe)} />
            ) : null}
            {t.recuLe ? (
              <Ligne label="Reçu le" valeur={formatDateTimeFr(t.recuLe)} />
            ) : null}
          </View>
          {t.notes ? (
            <View className="mt-3">
              <Text variant="caption" className="mb-1">
                Notes
              </Text>
              <Text variant="bodySmall">{t.notes}</Text>
            </View>
          ) : null}
        </Card>

        <Card>
          <CardHeader title={`Articles (${t.lignes.length})`} />
          <View>
            {t.lignes.map((l, i) => (
              <View key={l.id}>
                {i > 0 ? <Divider /> : null}
                <View className="py-3">
                  <Text variant="bodySmall" className="font-sans-medium">
                    {l.produit}
                  </Text>
                  {l.sku ? <Text variant="caption">{l.sku}</Text> : null}
                  <View className="mt-1 gap-0.5">
                    <Ligne label="Demandé" valeur={l.demandeAffiche} />
                    {/* `null` n'est PAS zéro : « pas encore expédié » et
                        « expédié : rien » ne se disent pas pareil. */}
                    <Ligne
                      label="Expédié"
                      valeur={l.expedie != null ? String(l.expedie) : "Pas encore"}
                    />
                    <Ligne
                      label="Reçu"
                      valeur={l.recu != null ? String(l.recu) : "Pas encore"}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Card>
      </View>

      <AlertDialog
        ouvert={confirmation !== null}
        titre={confirmation ? `${ACTIONS[confirmation].label} ce transfert ?` : ""}
        message={confirmation ? ACTIONS[confirmation].question : undefined}
        confirmer={confirmation ? ACTIONS[confirmation].label : ""}
        annuler="Revenir"
        destructif={confirmation === "cancel"}
        enCours={envoi}
        onConfirmer={() => confirmation && void executer(confirmation)}
        onAnnuler={() => setConfirmation(null)}
      />
    </Screen>
  );
}

function Ligne({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 py-0.5">
      <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
        {label}
      </Text>
      <Text variant="caption" numeric className="shrink-0 text-foreground">
        {valeur}
      </Text>
    </View>
  );
}
