/**
 * Synchronisation.
 *
 * L'écran d'attente affiche une progression CHIFFRÉE, pas une roue. Une roue ne
 * dit pas si l'on en a pour dix secondes ou pour dix minutes, et sur un premier
 * tirage de 20 000 articles en 3G, la différence décide si le caissier attend
 * ou s'il redémarre l'application au milieu.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { router } from "expo-router";

import { ApiError } from "@/api/errors";
import { labelFor } from "@/features/sync/labels";
import {
  countByState,
  pullAll,
  pushAll,
  readAllStates,
  type OutboxState,
  type PullProgress,
} from "@/sync";
import { useSession } from "@/session/provider";
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
  const [progress, setProgress] = useState<PullProgress | null>(null);
  const [states, setStates] = useState<SyncStateRow[]>([]);
  const [outbox, setOutbox] = useState<Record<OutboxState, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const { snapshot } = useSession();

  const refresh = useCallback(async () => {
    setStates(await readAllStates());
    setOutbox(await countByState());
  }, []);

  useEffect(() => {
    void refresh();
    // Quitter l'écran interrompt proprement : le point de reprise reste sur la
    // dernière page réussie, rien n'est rejoué ni sauté.
    return () => abort.current?.abort();
  }, [refresh]);

  const lancer = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    abort.current = new AbortController();

    try {
      // On ENVOIE d'abord. Ce que le terminal porte est la seule chose que le
      // serveur ne connaît pas ; le tirage qui suit en rapporte le résultat
      // autoritatif.
      await pushAll(snapshot?.device?.id);
      await pullAll({
        signal: abort.current.signal,
        onProgress: setProgress,
      });
    } catch (e) {
      setError(
        e instanceof ApiError && e.kind === "network"
          ? "Serveur injoignable. Les données déjà reçues sont conservées, la reprise partira de là."
          : e instanceof Error
            ? e.message
            : "La synchronisation a échoué."
      );
    } finally {
      setBusy(false);
      setProgress(null);
      await refresh();
    }
  };

  const pct =
    progress?.expectedTotal && progress.expectedTotal > 0
      ? Math.min(100, Math.round((progress.receivedTotal / progress.expectedTotal) * 100))
      : null;

  const totalLignes = states.reduce((n, s) => n + s.rowCount, 0);

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

      {error ? (
        <View className="mb-4">
          <Banner tone="destructive" title="Interrompue" message={error} />
        </View>
      ) : null}

      {notice ? (
        <View className="mb-4">
          <Banner tone="info" title={notice} />
        </View>
      ) : null}

      {progress ? (
        <Card className="mb-4">
          <Text variant="label">{labelFor(progress.table)}</Text>
          <Text variant="caption" className="mt-1">
            Table {progress.index} sur {progress.tableCount}
            {progress.expected != null
              ? ` · ${progress.received} / ${progress.expected}`
              : ` · ${progress.received} lignes`}
          </Text>

          {pct != null ? (
            <>
              <View className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <View className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </View>
              <Text variant="caption" className="mt-1.5" numeric>
                {progress.receivedTotal} / {progress.expectedTotal} lignes · {pct} %
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
              onPress: () => router.push("/(app)/operations"),
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
          loading={busy}
          leftIcon="cloud-download-outline"
          onPress={lancer}
        >
          {busy ? "Synchronisation en cours" : "Synchroniser maintenant"}
        </Button>
      </View>

      {states.length > 0 ? (
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
