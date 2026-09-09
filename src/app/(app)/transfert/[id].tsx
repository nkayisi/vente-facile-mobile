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
import {
  FeuilleReception,
  type LigneRecue,
} from "@/features/stock/feuille-reception";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import {
  AlertDialog,
  AppBar,
  Badge,
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
  {
    label: string;
    icone: "Check" | "Truck" | "Boxes" | "XCircle";
    depuis: string[];
    permission: string;
    question: string;
  }
> = {
  approve: {
    label: "Approuver",
    icone: "Check",
    depuis: ["draft"],
    permission: "stock_transfers.ship",
    question: "Le transfert passera en attente d'expédition. Le stock ne bouge pas encore.",
  },
  ship: {
    label: "Expédier",
    icone: "Truck",
    depuis: ["draft", "pending"],
    permission: "stock_transfers.ship",
    question:
      "Le stock QUITTE l'entrepôt source dès maintenant. Cette opération ne se défait qu'en annulant le transfert.",
  },
  receive: {
    label: "Réceptionner",
    icone: "Boxes",
    depuis: ["in_transit"],
    permission: "stock_transfers.receive",
    // ⚠ Ne plus écrire que la réception partielle « se saisit depuis le
    // back-office » : la feuille la saisit ici, canal par canal, et les champs
    // y sont préremplis de l'expédié.
    question:
      "Les quantités que vous avez saisies entrent dans l'entrepôt de destination.",
  },
  cancel: {
    label: "Annuler",
    icone: "XCircle",
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
  // ⚠ La RÉCEPTION n'est pas une simple confirmation : une réception partielle
  // est le cas ordinaire, et le magasinier doit pouvoir dire ce qu'il a
  // réellement déchargé. Les trois autres transitions n'ont rien à saisir.
  const [reception, setReception] = useState(false);
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
  const envoiEnFile = attente?.transferts.get(t.id);
  const enFile = envoiEnFile !== undefined;
  const possibles = (Object.keys(ACTIONS) as TransitionTransfert[]).filter(
    (a) => ACTIONS[a].depuis.includes(t.statut) && can(ACTIONS[a].permission)
  );

  const executer = async (
    transition: TransitionTransfert,
    recues?: LigneRecue[]
  ) => {
    if (envoi) return;
    setEnvoi(true);
    try {
      await transitionTransfert(t.id, transition, recues);
      setConfirmation(null);
      setReception(false);
      toast.succes("Opération mise en file. Elle partira à la prochaine synchronisation.");
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "L'opération n'a pas pu être mise en file."
      );
    } finally {
      setEnvoi(false);
    }
  };

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LES TRANSITIONS DESCENDENT DANS UNE BARRE FIXE.                        │
  // │                                                                        │
  // │ Elles s'empilaient en TÊTE de page : elles repoussaient les lignes du  │
  // │ transfert sous la ligne de flottaison, et « Réceptionner » sortait de  │
  // │ l'écran dès qu'on descendait lire CE QU'ON RÉCEPTIONNE, c'est-à-dire   │
  // │ au moment précis où l'on décide. Le haut d'un écran de six pouces est  │
  // │ hors de portée du pouce ; la barre, elle, est toujours là.             │
  // │                                                                        │
  // │ Les boutons restent AFFICHÉS quand une opération est en file, fermés   │
  // │ et accompagnés de leur motif : un bouton absent est un cul-de-sac, un  │
  // │ bouton fermé qui dit pourquoi n'en est pas un.                         │
  // └────────────────────────────────────────────────────────────────────────┘
  const progressifs = possibles.filter((a) => a !== "cancel");
  // Le plus AVANCÉ prend la place primaire, à droite, où tombe le pouce :
  // depuis un brouillon on peut approuver ou expédier, et c'est l'expédition
  // qui fait avancer le transfert.
  const principal = progressifs.at(-1);
  const secondaires = progressifs.slice(0, -1);
  const barreActions =
    progressifs.length === 0 ? undefined : (
      <View className="gap-2.5">
        {enFile ? (
          <Text variant="caption" className="text-muted-foreground">
            {envoiEnFile === "bloque"
              ? "Une opération sur ce transfert attend un droit : elle repartira dès que l'abonnement sera réglé ou la permission accordée."
              : "Une opération sur ce transfert est déjà en file. Les actions rouvriront après la prochaine synchronisation."}
          </Text>
        ) : null}
        <View className="flex-row gap-2">
          {secondaires.map((a) => (
            <Button
              key={a}
              variant="outline"
              size="lg"
              className="flex-1"
              leftIcon={ACTIONS[a].icone}
              disabled={enFile || envoi}
              onPress={() => setConfirmation(a)}
            >
              {ACTIONS[a].label}
            </Button>
          ))}
          {principal ? (
            <Button
              size="lg"
              className="flex-1"
              leftIcon={ACTIONS[principal].icone}
              disabled={enFile || envoi}
              onPress={() =>
                principal === "receive" ? setReception(true) : setConfirmation(principal)
              }
            >
              {ACTIONS[principal].label}
            </Button>
          ) : null}
        </View>
      </View>
    );

  return (
    <Screen scroll padded={false} pied={barreActions}>
      <AppBar
        title={t.reference}
        subtitle={`${t.source ?? "?"} → ${t.destination ?? "?"}`}
        right={s ? <Badge tone={s.ton}>{s.label}</Badge> : undefined}
      />

      <View className="gap-4 p-4">
        <BandeauEnvoi
          envoi={envoiEnFile}
          titre="Une opération attend son envoi"
          consequence="Le statut ci-dessus ne changera qu'après, et les actions restent fermées d'ici là pour ne pas expédier deux fois."
        />

        {/* ┌──────────────────────────────────────────────────────────────────┐
            │ LE GESTE RARE ET LOURD RESTE ICI, LOIN DU POUCE.                 │
            │                                                                  │
            │ Annuler un transfert déjà expédié fait revenir la marchandise à  │
            │ la source : c'est un geste qu'on ne fait pas deux fois par jour, │
            │ et l'éloigner du bas de l'écran n'est pas un oubli. Les          │
            │ transitions qui FONT AVANCER le transfert, elles, descendent     │
            │ dans la barre fixe. Même partage que sur la fiche de vente.      │
            └──────────────────────────────────────────────────────────────────┘ */}
        {possibles.includes("cancel") ? (
          <Button
            variant="destructive"
            fullWidth
            leftIcon="XCircle"
            disabled={enFile || envoi}
            onPress={() => setConfirmation("cancel")}
          >
            Annuler le transfert
          </Button>
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

      {/* Rendue CONDITIONNELLEMENT : chaque ouverture est un montage, donc un
          préremplissage frais depuis l'expédié, sans effet de remise à zéro à
          tenir en phase avec les champs. Même motif que la feuille de retour. */}
      {reception ? (
        <FeuilleReception
          lignes={t.lignes}
          ouvert
          onFermer={() => setReception(false)}
          enCours={envoi}
          onConfirmer={(recues) => void executer("receive", recues)}
        />
      ) : null}

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
