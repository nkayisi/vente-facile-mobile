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
import { View } from "react-native";
import { useFocusEffect } from "expo-router";

import { dateHeureCourteFr } from "@/data/dates";
import { bloquees, discard, quarantined } from "@/sync";
import type { OutboxOperation } from "@/db/schema";
import {
  AlertDialog,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Screen,
  Text,
} from "@/ui";

/**
 * Le nom de l'acte, en français, pour LES TRENTE-CINQ.
 *
 * Neuf y figuraient, pour trente-cinq actes : les vingt-six autres
 * s'affichaient sous leur code technique (« inventory_session.validate »), sur
 * l'écran même où le marchand doit décider quoi faire d'une opération refusée.
 */
const KIND_LABELS: Record<string, string> = {
  "sale.create": "Vente",
  "sale.add_payment": "Règlement de facture",
  "sale.cancel": "Annulation de vente",
  "register_session.open": "Ouverture de caisse",
  "register_session.close": "Clôture de caisse",
  "customer.create": "Nouveau client",
  "customer.record_payment": "Règlement client",
  "customer.adjust_balance": "Ajustement de solde client",
  "stock_movement.create": "Mouvement de stock",
  "stock.unpack": "Déconditionnement",
  "stock_transfer.create": "Transfert de stock",
  "stock_transfer.approve": "Approbation de transfert",
  "stock_transfer.ship": "Expédition de transfert",
  "stock_transfer.receive": "Réception de transfert",
  "stock_transfer.cancel": "Annulation de transfert",
  "stock_adjustment.create": "Ajustement de stock",
  "stock_adjustment.approve": "Approbation d'ajustement",
  "stock_adjustment.reject": "Rejet d'ajustement",
  "sale_return.create": "Retour de vente",
  "sale_return.approve": "Approbation de retour",
  "sale_return.reject": "Rejet de retour",
  "quotation.create": "Devis",
  "quotation.convert": "Conversion de devis",
  "inventory_session.create": "Session d'inventaire",
  "inventory_session.start": "Démarrage d'inventaire",
  "inventory_session.count": "Comptage d'inventaire",
  "inventory_session.submit": "Soumission d'inventaire",
  "inventory_session.validate": "Validation d'inventaire",
  "inventory_session.cancel": "Annulation d'inventaire",
  "product.create": "Nouvel article",
  "category.create": "Nouvelle catégorie",
  "brand.create": "Nouvelle marque",
  "unit.create": "Nouvelle unité",
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
  const [enBlocage, setEnBlocage] = useState<OutboxOperation[]>([]);

  const refresh = useCallback(async () => {
    const [refusees, bloqueesRows] = await Promise.all([quarantined(), bloquees()]);
    setRows(refusees);
    setEnBlocage(bloqueesRows);
  }, []);
  useEffect(() => void refresh(), [refresh]);
  useFocusEffect(useCallback(() => void refresh(), [refresh]));

  // `Alert.alert` a ete remplace par notre `AlertDialog` : le natif ignore le
  // theme sombre, ignore la police, ne sait pas rendre un montant en chiffres
  // tabulaires, et son bouton destructif n'est rouge que sur iOS. Une decision
  // irreversible ne peut pas etre le seul ecran a ne pas ressembler a
  // l'application.
  const [aAbandonner, setAAbandonner] = useState<OutboxOperation | null>(null);
  const [abandonEnCours, setAbandonEnCours] = useState(false);

  const confirmerAbandon = useCallback(async () => {
    if (!aAbandonner) return;
    setAbandonEnCours(true);
    try {
      await discard(aAbandonner.id);
      await refresh();
      setAAbandonner(null);
    } finally {
      setAbandonEnCours(false);
    }
  }, [aAbandonner, refresh]);


  if (rows.length === 0 && enBlocage.length === 0) {
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
          {rows.length > 0
            ? `Le serveur a refusé ${rows.length} opération${rows.length > 1 ? "s" : ""}. Elles ne repartiront pas d'elles-mêmes.`
            : "Aucune opération refusée."}
        </Text>
      </View>

      {/* ┌────────────────────────────────────────────────────────────────────┐
          │ BLOQUÉ N'EST PAS REFUSÉ, ET LA DIFFÉRENCE CHANGE CE QU'ON FAIT.   │
          │                                                                    │
          │ Une opération refusée est définitive : le serveur la refusera      │
          │ toujours, il faut la corriger ou l'abandonner. Une opération       │
          │ bloquée attend un DROIT ou un ABONNEMENT, et repartira d'elle-même │
          │ dès qu'il sera là. Les confondre ferait abandonner des ventes qui  │
          │ n'attendaient qu'une permission.                                   │
          │                                                                    │
          │ L'écran ne lisait que la quarantaine : une opération bloquée       │
          │ restait invisible, et le compteur d'attente ne descendait jamais   │
          │ sans qu'on sache pourquoi.                                         │
          └────────────────────────────────────────────────────────────────────┘ */}
      {enBlocage.length > 0 ? (
        <View className="mb-5">
          <Text variant="h4" className="mb-2">
            {`En attente d'un droit (${enBlocage.length})`}
          </Text>
          <Text variant="muted" className="mb-3">
            Elles repartiront seules dès que la permission sera accordée ou
            l'abonnement réglé. Rien n'est perdu.
          </Text>
          {enBlocage.map((op, i) => (
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
                  <Badge tone="warning">bloquée</Badge>
                </View>
                <Divider />
                <Text variant="bodySmall" className="mt-3">
                  {op.lastError ?? "Motif inconnu."}
                </Text>
                <Text variant="caption" className="mt-1">
                  {dateHeureCourteFr(op.occurredAt)}
                </Text>
              </Card>
            </View>
          ))}
        </View>
      ) : null}

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
              {dateHeureCourteFr(op.occurredAt)}
            </Text>

            <View className="mt-3">
              <Button
                variant="outline"
                size="sm"
                leftIcon="Trash2"
                onPress={() => setAAbandonner(op)}
              >
                Abandonner
              </Button>
            </View>
          </Card>
        </View>
      ))}
          <AlertDialog
        ouvert={aAbandonner !== null}
        titre="Abandonner cette opération ?"
        message={
          aAbandonner
            ? `${KIND_LABELS[aAbandonner.kind] ?? aAbandonner.kind}` +
              `${resume(aAbandonner) ? ` · ${resume(aAbandonner)}` : ""}\n\n` +
              "Elle ne sera jamais envoyée. Si c'était une vente encaissée, " +
              "le paiement restera sans trace au serveur."
            : undefined
        }
        confirmer="Abandonner"
        annuler="Garder"
        destructif
        enCours={abandonEnCours}
        onConfirmer={() => void confirmerAbandon()}
        onAnnuler={() => setAAbandonner(null)}
      />
</Screen>
  );
}
