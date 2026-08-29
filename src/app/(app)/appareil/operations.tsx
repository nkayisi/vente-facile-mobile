/**
 * Opérations à corriger.
 *
 * L'ancienne application n'affichait qu'un compteur d'échecs. Le caissier
 * voyait « 3 » sans savoir lesquelles, ni pourquoi, ni quoi faire : il ne
 * pouvait que réessayer, indéfiniment, une opération que le serveur refuserait
 * toujours.
 *
 * Ici chaque refus porte son motif en clair et deux issues : corriger, ou
 * abandonner en connaissance de cause.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { discard, quarantined } from "@/sync";
import type { OutboxOperation } from "@/db/schema";
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Screen,
  Text,
} from "@/ui";

const KIND_LABELS: Record<string, string> = {
  "sale.create": "Vente",
  "sale.add_payment": "Règlement de facture",
  "sale.cancel": "Annulation de vente",
  "register_session.open": "Ouverture de caisse",
  "customer.create": "Nouveau client",
  "customer.record_payment": "Règlement client",
  "stock_movement.create": "Mouvement de stock",
  "expense.create": "Dépense",
  "cash_movement.create": "Mouvement de caisse",
};

/** Ce qu'on peut dire d'une opération sans ouvrir son contenu. */
function resume(op: OutboxOperation): string | null {
  try {
    const p = JSON.parse(op.payload) as Record<string, unknown>;
    if (typeof p.reference === "string") return p.reference;
    if (Array.isArray(p.items)) return `${p.items.length} article(s)`;
    if (p.amount) return String(p.amount);
    return null;
  } catch {
    return null;
  }
}

export default function Operations() {
  const [rows, setRows] = useState<OutboxOperation[]>([]);

  const refresh = useCallback(async () => setRows(await quarantined()), []);
  useEffect(() => void refresh(), [refresh]);
  useFocusEffect(useCallback(() => void refresh(), [refresh]));

  const abandonner = (op: OutboxOperation) => {
    const quoi = KIND_LABELS[op.kind] ?? op.kind;
    Alert.alert(
      "Abandonner cette opération ?",
      `${quoi}${resume(op) ? ` · ${resume(op)}` : ""}\n\n` +
        "Elle ne sera jamais envoyée. Si c'était une vente encaissée, " +
        "le paiement restera sans trace au serveur.",
      [
        { text: "Garder", style: "cancel" },
        {
          text: "Abandonner",
          style: "destructive",
          onPress: async () => {
            await discard(op.id);
            await refresh();
          },
        },
      ]
    );
  };

  if (rows.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="CheckCircle2"
          title="Rien à corriger"
          message="Toutes vos opérations sont parties, ou attendent le réseau."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View className="mb-5 mt-4">
        <Text variant="h2">Opérations à corriger</Text>
        <Text variant="muted">
          Le serveur a refusé {rows.length} opération{rows.length > 1 ? "s" : ""}.
          Elles ne repartiront pas d'elles-mêmes.
        </Text>
      </View>

      {rows.map((op, i) => (
        <View key={op.id} className={i > 0 ? "mt-3" : ""}>
          <Card>
            <View className="mb-2 flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text variant="label">{KIND_LABELS[op.kind] ?? op.kind}</Text>
                {resume(op) ? (
                  <Text variant="caption" className="mt-0.5">
                    {resume(op)}
                  </Text>
                ) : null}
              </View>
              <Badge tone="destructive">refusée</Badge>
            </View>

            <Divider />

            <Text variant="bodySmall" className="mt-3">
              {op.lastError ?? "Motif inconnu."}
            </Text>
            <Text variant="caption" className="mt-1">
              {op.occurredAt.toLocaleString("fr-FR")}
            </Text>

            <View className="mt-3">
              <Button
                variant="outline"
                size="sm"
                leftIcon="Trash2"
                onPress={() => abandonner(op)}
              >
                Abandonner
              </Button>
            </View>
          </Card>
        </View>
      ))}
    </Screen>
  );
}
