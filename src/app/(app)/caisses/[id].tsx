/**
 * Une caisse : son état, et ses clôtures passées.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE WEB N'A PAS CET ÉCRAN, et c'est un manque, pas un choix.             │
 * │                                                                          │
 * │ Le back-office ne montre que le tiroir du moment. Sur un terminal, ce    │
 * │ qu'on vient chercher est le Z d'hier soir, parce que c'est le papier     │
 * │ qu'on demande au caissier. Les clôtures sont donc listées ici.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Un solde non enregistré n'est PAS zéro.** Une session close par un ancien
 * chemin peut n'avoir ni attendu ni compté ; l'écran écrit « non enregistré »
 * plutôt qu'un rassurant « 0 » qui ferait conclure à un tiroir juste.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateTimeFr } from "@vente-facile/core";

import { parcDeCaisses, sessionsFermees, type SessionFermee } from "@/data/caisses";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { depuis } from "@/data/ventes";
import { libelleEnvoi } from "@/data/envoi";
import {
  AppBar, Badge, Banner, Button, Card, CardHeader, Divider, EmptyState, Icon,
  Pressable, Screen, Spinner, Text,
} from "@/ui";

const TABLES = ["registers", "register_sessions", "warehouses", "sales", "users"];

function Paire({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 py-1">
      <Text variant="bodySmall" numberOfLines={1} className="min-w-0 flex-1 text-muted-foreground">
        {label}
      </Text>
      <Text variant="bodySmall" numeric className="shrink-0 font-sans-medium">
        {valeur}
      </Text>
    </View>
  );
}

export default function DetailCaisse() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMonnaie();
  const [ouverte, setOuverte] = useState<string | null>(null);

  const chargerCaisse = useCallback(async () => {
    const parc = await parcDeCaisses();
    return parc.caisses.find((c) => c.id === id) ?? null;
  }, [id]);
  const { donnees: c, chargement } = useLecture(chargerCaisse, {
    tables: [...TABLES, "outbox_operations"],
    deps: [id],
  });

  const chargerHistorique = useCallback(() => sessionsFermees(id), [id]);
  const { donnees: historique } = useLecture(chargerHistorique, {
    tables: TABLES,
    deps: [id],
  });

  if (chargement && !c) {
    return (
      <Screen>
        <AppBar title="Caisse" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!c) {
    return (
      <Screen padded={false}>
        <AppBar title="Caisse" />
        <EmptyState
          icon="Calculator"
          title="Caisse introuvable"
          message="Elle n'est pas descendue sur ce terminal, ou elle a été supprimée."
          action={{ label: "Revenir", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const sessions = historique ?? [];

  // Les soldes d'une session sont SCALAIRES dans la table tirée : ils sont
  // dans la devise principale de l'établissement. L'écrire explicitement, car
  // une chaîne vide ferait sortir un montant SANS SYMBOLE.
  const somme = (v: number | null): string =>
    v === null ? "Non enregistré" : money.money(v, money.primaryCode);

  const ligne = (s: SessionFermee) => {
    const deplie = ouverte === s.id;
    return (
      <View key={s.id}>
        <Pressable
          onPress={() => setOuverte(deplie ? null : s.id)}
          accessibilityRole="button"
          accessibilityLabel={`Clôture du ${s.fermeeLe ? formatDateTimeFr(s.fermeeLe) : "?"}`}
          className="flex-row items-center gap-3 px-4 py-3"
        >
          <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Icon name="Calculator" size={16} color="mutedForeground" />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
              {s.fermeeLe ? formatDateTimeFr(s.fermeeLe) : "Date inconnue"}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {[
                `${s.nbVentes} ${s.nbVentes > 1 ? "ventes" : "vente"}`,
                s.parQui ? `fermée par ${s.parQui}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          <View className="shrink-0 items-end">
            {/* ┌────────────────────────────────────────────────────────────┐
                │ « TIROIR JUSTE » EST UNE AFFIRMATION, PAS UN DÉFAUT.      │
                │                                                            │
                │ Relevé sur une vraie session : le serveur avait enregistré │
                │ un écart de 0 et AUCUN comptage. Un écart nul qui ne       │
                │ s'appuie sur rien n'est pas un tiroir juste, c'est une     │
                │ valeur par défaut, et la pastille verte la faisait passer  │
                │ pour un contrôle réussi.                                   │
                └────────────────────────────────────────────────────────────┘ */}
            {s.compte === null ? (
              <Badge tone="neutral">Comptage non enregistré</Badge>
            ) : s.ecart === null ? (
              <Badge tone="neutral">Écart non enregistré</Badge>
            ) : s.ecart === 0 ? (
              <Badge tone="success">Tiroir juste</Badge>
            ) : (
              <Badge tone={s.ecart > 0 ? "warning" : "destructive"}>
                {`${s.ecart > 0 ? "+" : ""}${money.money(s.ecart, money.primaryCode)}`}
              </Badge>
            )}
            <Icon name={deplie ? "ChevronUp" : "ChevronDown"} size={16} color="mutedForeground" />
          </View>
        </Pressable>
        {deplie ? (
          <View className="border-t border-border px-4 py-3">
            <Paire
              label="Ouverte le"
              valeur={s.ouverteLe ? formatDateTimeFr(s.ouverteLe) : "—"}
            />
            <Paire label="Fond d'ouverture" valeur={money.money(s.fondOuverture, money.primaryCode)} />
            <Paire label="Attendu" valeur={somme(s.attendu)} />
            <Paire label="Compté" valeur={somme(s.compte)} />
            <Paire label="Écart" valeur={somme(s.ecart)} />
            {s.notes ? (
              <View className="mt-2">
                <Text variant="caption" className="mb-1">
                  Note de clôture
                </Text>
                <Text variant="bodySmall">{s.notes}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Screen scroll padded={false}>
      <AppBar
        title={c.nom}
        subtitle={c.code}
        right={
          <Badge tone={c.actif ? "success" : "neutral"}>
            {c.actif ? "Active" : "Inactive"}
          </Badge>
        }
      />

      <View className="gap-4 p-4">
        <Card>
          <CardHeader title="État" />
          {c.session ? (
            <View className="gap-3">
              <View className="gap-1">
                <View className="flex-row items-center gap-2">
                  <Icon
                    name={c.session.envoi === "bloque" ? "AlertTriangle" : "CheckCircle2"}
                    size={18}
                    color={c.session.envoi === "bloque" ? "warning" : "success"}
                  />
                  <Text variant="bodySmall" className="font-sans-medium">
                    {libelleEnvoi(c.session.envoi)?.court ?? "Session ouverte"}
                  </Text>
                </View>
                {/* Le POURQUOI, là où il y a la place de l'écrire : sans lui,
                    le marchand cherche du réseau qui ne débloquera rien. */}
                {libelleEnvoi(c.session.envoi) ? (
                  <Text variant="caption" className="text-muted-foreground">
                    {libelleEnvoi(c.session.envoi)?.detail}
                  </Text>
                ) : null}
              </View>
              <View>
                <Paire
                  label="Ouverte"
                  valeur={c.session.ouverteLe ? depuis(c.session.ouverteLe) : "—"}
                />
                {c.session.parQui ? (
                  <Paire label="Par" valeur={c.session.parQui} />
                ) : null}
                <Paire label="Ventes" valeur={String(c.session.nbVentes)} />
              </View>
              <View className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  leftIcon="Calculator"
                  disabled={c.session.envoi !== "envoye"}
                  onPress={() => router.push(`/cloture/${c.session?.id}`)}
                >
                  Clôturer
                </Button>
                <Button
                  className="flex-1"
                  leftIcon="ShoppingCart"
                  onPress={() => router.push("/vendre")}
                >
                  Continuer
                </Button>
              </View>
            </View>
          ) : (
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <Icon name="PauseCircle" size={18} color="mutedForeground" />
                <Text variant="bodySmall" className="font-sans-medium">
                  Aucune session ouverte
                </Text>
              </View>
              <Text variant="caption">
                {c.entrepot
                  ? `Le stock sortirait de ${c.entrepot}.`
                  : "Aucun entrepôt n'est rattaché à cette caisse."}
              </Text>
            </View>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <View className="p-4 pb-2">
            <CardHeader
              title={`Clôtures passées (${sessions.length})`}
              subtitle="Touchez une ligne pour voir son comptage."
            />
          </View>
          {sessions.length === 0 ? (
            <View className="px-4 pb-4">
              <Text variant="caption">
                Aucune clôture n&apos;est descendue sur ce terminal pour cette caisse.
              </Text>
            </View>
          ) : (
            sessions.map((s, i) => (
              <View key={s.id}>
                {i > 0 ? <Divider /> : null}
                {ligne(s)}
              </View>
            ))
          )}
        </Card>

        <Banner
          tone="info"
          title="Réimprimer un Z"
          message="Le Z se réimprime depuis « Documents imprimés », sur le terminal qui l'a produit : c'est là que sont rangées ses données, ventilées par devise. Le numéro ne change pas, la copie porte la pastille DUPLICATA."
          action={{
            label: "Documents imprimés",
            onPress: () => router.push("/appareil/documents"),
          }}
        />
      </View>
    </Screen>
  );
}
