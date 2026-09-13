/**
 * Synchronisation.
 *
 * L'écran d'attente affiche une progression CHIFFRÉE, pas une roue. Une roue ne
 * dit pas si l'on en a pour dix secondes ou pour dix minutes, et sur un premier
 * tirage de 20 000 articles en 3G, la différence décide si le caissier attend
 * ou s'il redémarre l'application au milieu.
 */
import { useEffect } from "react";
import { View } from "react-native";

import { router } from "expo-router";

import { useLecture } from "@/data/live";
import { labelFor } from "@/features/sync/labels";
import { useSynchronisation } from "@/features/sync/provider";
import { countByState, readAllStates, type OutboxState } from "@/sync";
import type { SyncStateRow } from "@/db/schema";
import {
  AppBar,
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  ListItem,
  Screen,
  Section,
  Text,
} from "@/ui";

import { ilYA } from "@/data/dates";

export default function Sync() {
  // Le cycle vit dans le fournisseur, partagé avec les bandeaux de tous les
  // écrans : il n'y a qu'un verrou, donc qu'une synchronisation à la fois.
  const { enCours, origine, progression, erreur, lancer, annuler } = useSynchronisation();

  /**
   * Les compteurs se relisent SEULS.
   *
   * Ils vivaient dans un `useState` rechargé à la main dans le `finally` du
   * cycle, ce qui obligeait à rappeler la relecture à chaque nouvel appelant -
   * et le cycle a désormais deux points de départ, cet écran et les bandeaux.
   * `useLecture` écoute les tables : la progression par table et la file
   * d'attente se mettent à jour PENDANT le tirage, plus seulement à la fin.
   */
  const { donnees: states } = useLecture<SyncStateRow[]>(readAllStates, {
    tables: ["sync_state"],
  });
  const { donnees: outbox } = useLecture<Record<OutboxState, number>>(countByState, {
    tables: ["outbox_operations"],
  });

  useEffect(() => {
    // Quitter l'écran interrompt proprement : le point de reprise reste sur la
    // dernière page réussie, rien n'est rejoué ni sauté. `annuler` ne mord que
    // sur le cycle que CET écran a lancé : quitter pendant qu'un bandeau
    // synchronise ne l'interrompt donc pas.
    return () => annuler("ecran");
  }, [annuler]);

  const pct =
    progression?.expectedTotal && progression.expectedTotal > 0
      ? Math.min(100, Math.round((progression.receivedTotal / progression.expectedTotal) * 100))
      : null;

  const totalLignes = (states ?? []).reduce((n, s) => n + s.rowCount, 0);

  return (
    /* `AppBar` plutôt qu'un titre dans le corps : cet écran s'atteint depuis
       le tiroir ET depuis les bandeaux d'une dizaine d'autres, et il n'avait
       AUCUN chemin de retour. Le titre remonte dans la barre, sans quoi il
       s'afficherait deux fois. */
    <Screen scroll padded={false}>
      <AppBar
        title="Synchronisation"
        subtitle={
          totalLignes > 0
            ? `${totalLignes} lignes en base locale.`
            : "Aucune donnée locale pour l'instant."
        }
      />
      <View className="p-4">
        {erreur ? (
          <View className="mb-4">
            <Banner tone="destructive" title="Interrompue" message={erreur} />
          </View>
        ) : null}

        {progression ? (
          <Card className="mb-4">
            <Text variant="label">{labelFor(progression.table)}</Text>
            <Text variant="caption" className="mt-1">
              Table {progression.index} sur {progression.tableCount}
              {progression.expected != null
                ? ` · ${progression.received} / ${progression.expected}`
                : ` · ${progression.received} lignes`}
            </Text>

            {pct != null ? (
              <>
                <View className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <View className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </View>
                <Text variant="caption" className="mt-1.5" numeric>
                  {progression.receivedTotal} / {progression.expectedTotal} lignes · {pct} %
                </Text>
              </>
            ) : null}
          </Card>
        ) : null}

        {outbox && outbox.quarantined > 0 ? (
          <View className="mb-4">
            <Banner
              tone="destructive"
              title={`${outbox.quarantined} opération(s) refusée(s)`}
              message="Elles ne repartiront pas d'elles-mêmes."
              action={{
                label: "Voir et corriger",
                onPress: () => router.push("/(app)/appareil/operations"),
              }}
            />
          </View>
        ) : null}

        {/* ┌──────────────────────────────────────────────────────────────┐
            │ « BLOQUÉ » N'EST PAS « EN ATTENTE », ET CET ÉCRAN LE TAISAIT.│
            │                                                              │
            │ Une opération bloquée n'attend pas le réseau, elle attend une│
            │ DÉCISION : un abonnement réglé, une permission accordée. Le  │
            │ seul écran qui rend l'état de la synchronisation n'en disait │
            │ rien, si bien que le compteur d'attente ne descendait jamais │
            │ sans qu'on sache pourquoi. Le message ne propose donc ni de  │
            │ synchroniser ni de réessayer : ni l'un ni l'autre n'y peut   │
            │ quoi que ce soit.                                            │
            └──────────────────────────────────────────────────────────────┘ */}
        {outbox && outbox.blocked > 0 ? (
          <View className="mb-4">
            <Banner
              tone="warning"
              title={`${outbox.blocked} opération(s) en attente d'un droit`}
              message="Elles repartiront seules dès que l'abonnement sera réglé ou la permission accordée."
            />
          </View>
        ) : null}

        {outbox && outbox.pending > 0 ? (
          <View className="mb-4">
            <Banner
              tone="info"
              title={`${outbox.pending} opération(s) en attente`}
              message="Elles partent d'elles-mêmes dès que le réseau le permet."
            />
          </View>
        ) : null}

        <View className="mb-5">
          <Button
            fullWidth
            size="lg"
            loading={enCours}
            leftIcon="CloudDownload"
            onPress={() => void lancer("ecran")}
          >
            {/* Un bouton grisé sans raison est un cul-de-sac : quand le cycle
                vient d'un bandeau, on le DIT plutôt que de laisser croire à une
                panne. */}
            {!enCours
              ? "Synchroniser maintenant"
              : origine === "ecran"
                ? "Synchronisation en cours"
                : "Synchronisation lancée ailleurs"}
          </Button>
        </View>

        {states && states.length > 0 ? (
          <Section title="État par table">
            <Card className="overflow-hidden p-0">
              {states
                .filter((s) => s.rowCount > 0 || s.lastError)
                .map((s, i) => (
                  <View key={s.table}>
                    {i > 0 ? <Divider /> : null}
                    <ListItem
                      title={labelFor(s.table)}
                      subtitle={
                        s.lastError
                          ? s.lastError
                          : `Complet ${ilYA(s.lastFullSyncAt)}`
                      }
                      value={String(s.rowCount)}
                      valueTone={s.lastError ? "destructive" : "muted"}
                      trailing={
                        s.hasMore ? <Badge tone="warning">partiel</Badge> : undefined
                      }
                    />
                  </View>
                ))}
            </Card>
          </Section>
        ) : null}
      </View>
    </Screen>
  );
}
