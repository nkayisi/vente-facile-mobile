/**
 * Détail d'une dépense, avec son reçu.
 *
 * **Le reçu de dépense est l'un des trois documents que le lot 5 avait
 * préparés sans écran pour les déclencher.** Il sort ici, sous un numéro tiré
 * dans la série de l'appareil, et se réimprime marqué DUPLICATA.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateTimeFr } from "@vente-facile/core";

import { STATUT_DEPENSE, detailDepense } from "@/data/caisse";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { chromeDeLaSession } from "@/features/pos/ticket";
import { PREFIXE, prochainNumero } from "@/features/pos/numerotation";
import { documentParNumero, enregistrerEtImprimer, imprimerDocument } from "@/printing/jobs";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, Button, Card, CardHeader, EmptyState, Screen, Spinner,
  StatValue, Text, useToast,
} from "@/ui";

const TABLES = ["expenses", "expense_categories", "payment_methods"];

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

export default function DetailDepense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMonnaie();
  const toast = useToast();
  const { snapshot } = useSession();
  const [impression, setImpression] = useState(false);

  const charger = useCallback(() => detailDepense(id), [id]);
  const { donnees: d, chargement } = useLecture(charger, { tables: TABLES, deps: [id] });

  if (chargement && !d) {
    return (
      <Screen>
        <AppBar title="Dépense" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen padded={false}>
        <AppBar title="Dépense" />
        <EmptyState
          icon="Receipt"
          title="Dépense introuvable"
          message="Elle n'est pas encore descendue sur ce terminal, ou elle a été supprimée."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const s = STATUT_DEPENSE[d.statut];

  const imprimer = async () => {
    if (impression) return;
    setImpression(true);
    try {
      // La référence de la dépense EST son numéro de document : elle vient du
      // serveur et ne change pas. En fabriquer un second ici donnerait deux
      // numéros pour une seule sortie de caisse.
      const range = await documentParNumero(d.reference);
      if (range) {
        await imprimerDocument(range.id);
      } else {
        await enregistrerEtImprimer({
          kind: "expense",
          documentNumber: d.reference,
          label: d.description || d.reference,
          donnees: {
            kind: "expense",
            number: d.reference,
            date: formatDateTimeFr(d.date ?? new Date()),
            chrome: chromeDeLaSession(snapshot),
            cashierName: snapshot?.user.full_name,
            category: d.categorie ?? undefined,
            payee: d.beneficiaire ?? undefined,
            paymentMethod: d.moyen ?? undefined,
            amount: d.montant,
            currency: d.devise,
            description: d.description || undefined,
          },
        });
      }
      toast.succes("Reçu de dépense envoyé à l'imprimante.");
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "Le reçu n'a pas pu être imprimé.");
    } finally {
      setImpression(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar
        title={d.description || d.reference}
        subtitle={d.reference}
        right={s ? <Badge tone={s.ton}>{s.label}</Badge> : undefined}
      />

      <View className="gap-4 p-4">
        <Card>
          <Text variant="caption" className="mb-1">
            Montant
          </Text>
          <StatValue value={money.money(d.montant, d.devise)} tone="destructive" />
        </Card>

        <Button
          variant="outline"
          fullWidth
          leftIcon="Printer"
          disabled={impression}
          onPress={() => void imprimer()}
        >
          {impression ? "Impression…" : "Imprimer le reçu"}
        </Button>

        <Card>
          <CardHeader title="Détail" />
          <View>
            <Paire label="Référence" valeur={d.reference} />
            {d.categorie ? <Paire label="Catégorie" valeur={d.categorie} /> : null}
            {d.beneficiaire ? <Paire label="Bénéficiaire" valeur={d.beneficiaire} /> : null}
            {d.moyen ? <Paire label="Moyen de paiement" valeur={d.moyen} /> : null}
            {d.reference_paiement ? (
              <Paire label="Référence du paiement" valeur={d.reference_paiement} />
            ) : null}
            <Paire
              label="Date"
              valeur={d.date ? formatDateTimeFr(d.date) : "—"}
            />
            {d.payeeLe ? (
              <Paire label="Payée le" valeur={formatDateTimeFr(d.payeeLe)} />
            ) : null}
          </View>
          {d.notes ? (
            <View className="mt-3">
              <Text variant="caption" className="mb-1">
                Notes
              </Text>
              <Text variant="bodySmall">{d.notes}</Text>
            </View>
          ) : null}
        </Card>
      </View>
    </Screen>
  );
}
