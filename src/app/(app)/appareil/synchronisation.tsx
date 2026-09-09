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

function formatDate(value: Date | null): string {
  if (!value) return "jamais";
  const minutes = Math.round((Date.now() - value.getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} j`;
}

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
    <Screen scroll>
      <View className="mb-5 mt-4">
        <Text variant="h2">Synchronisation</Text>
        <Text variant="muted">
          {totalLignes > 0
            ? `${totalLignes} lignes en base locale.`
            : "Aucune donnée locale pour l'instant."}
        </Text>
      </View>

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

      {outbox && outbox.pending > 0 ? (
        <View className="mb-4">
          <Banner
            tone="warning"
            title={`${outbox.pending} opération(s) en attente`}
            message="Elles partiront à la prochaine synchronisation."
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
                        : `Complet ${formatDate(s.lastFullSyncAt)}`
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
    </Screen>
  );
}
