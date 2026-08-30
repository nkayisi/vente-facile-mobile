/**
 * Détail d'un retour.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ APPROUVER UN RETOUR ÉTEINT D'ABORD LA DETTE, ET NE REMBOURSE QUE LE     │
 * │ RELIQUAT.                                                               │
 * │                                                                          │
 * │ Le client a rendu la marchandise : il n'a plus à la payer. Sans cet      │
 * │ ordre, il rendait le produit ET continuait de devoir la totalité,        │
 * │ pendant qu'on lui remboursait en espèces de l'argent jamais encaissé.    │
 * │ Le dialogue le dit AVANT, parce que l'opération ne se défait pas.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateTimeFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import {
  STATUT_RETOUR,
  detailRetour,
  type DetailRetour,
} from "@/data/retours-devis";
import { nomsDeProduits } from "@/data/articles";
import {
  detailEnAttente,
  enAttenteRetoursDevis,
  transitionRetour,
} from "@/features/ventes/retours-devis";
import { useSession } from "@/session/provider";
import {
  AlertDialog, AppBar, Badge, Banner, Button, Card, CardHeader, Divider,
  EmptyState, Screen, Spinner, StatValue, Text, useToast,
} from "@/ui";

const TABLES = ["sale_returns", "sale_return_items", "sales", "products"];

export default function DetailRetourEcran() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMonnaie();
  const toast = useToast();
  const { can } = useSession();
  const [confirmation, setConfirmation] = useState<"approve" | "reject" | null>(null);
  const [envoi, setEnvoi] = useState(false);

  /**
   * La table tirée d'abord, le JOURNAL ensuite.
   *
   * Un retour tout juste créé n'est PAS dans `sale_returns`, et ne doit pas y
   * être. Sans ce repli, le toucher depuis la liste ouvrirait une fiche
   * « Retour introuvable » quelques secondes après l'avoir enregistré.
   */
  const charger = useCallback(async (): Promise<DetailRetour | null> => {
    const tire = await detailRetour(id);
    if (tire) return tire;

    const attente = await detailEnAttente(id);
    if (!attente || attente.kind !== "sale_return") return null;

    const noms = await nomsDeProduits(attente.lignes.map((l) => l.produitId));
    return {
      id,
      // La référence est attribuée par le SERVEUR : ne pas en inventer une
      // provisoire, qui circulerait sur un papier et ne vaudrait rien.
      reference: "Référence à venir",
      venteId: attente.venteId,
      venteReference: null,
      statut: "draft",
      montant: attente.montant,
      rembourse: attente.montant,
      devise: "",
      motif: attente.motif,
      date: attente.date,
      approuveLe: null,
      lignes: attente.lignes.map((l, i) => ({
        id: `${id}-${i}`,
        produit: noms.get(l.produitId) ?? "Article",
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        total: l.total,
        remisEnStock: l.remisEnStock,
      })),
    };
  }, [id]);
  const { donnees: r, chargement } = useLecture(charger, {
    tables: [...TABLES, "outbox_operations"],
    deps: [id],
  });
  const { donnees: attente } = useLecture(enAttenteRetoursDevis, {
    tables: ["outbox_operations"],
  });

  if (chargement && !r) {
    return (
      <Screen>
        <AppBar title="Retour" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!r) {
    return (
      <Screen padded={false}>
        <AppBar title="Retour" />
        <EmptyState
          icon="PackageX"
          title="Retour introuvable"
          message="Il n'est pas encore descendu sur ce terminal, ou il a été supprimé."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const s = STATUT_RETOUR[r.statut];
  // La devise de la facture d'origine. Vide quand la vente n'est pas descendue
  // sur ce terminal : on se replie sur la principale plutôt que d'écrire un
  // montant SANS SYMBOLE, qui ne dirait pas dans quoi le client est remboursé.
  const devise = r.devise || money.primaryCode;
  const enFile = attente?.retours.has(r.id) ?? false;
  const aCreer = attente?.creations.has(r.id) ?? false;
  const decidable = r.statut === "draft" && can("sale_returns.approve") && !enFile;

  const executer = async (transition: "approve" | "reject") => {
    if (envoi) return;
    setEnvoi(true);
    try {
      await transitionRetour(r.id, transition);
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
        title={r.reference}
        subtitle={r.venteReference ? `Sur ${r.venteReference}` : undefined}
        right={s ? <Badge tone={s.ton}>{s.label}</Badge> : undefined}
      />

      <View className="gap-4 p-4">
        {aCreer ? (
          <Banner
            tone="warning"
            title="Ce retour attend son envoi"
            message="Il n'existe encore que sur ce terminal. Sa référence définitive et son approbation viendront après la synchronisation."
          />
        ) : enFile ? (
          <Banner
            tone="warning"
            title="Une décision attend son envoi"
            message="Le statut ne changera qu'après synchronisation."
          />
        ) : null}

        <Card>
          <Text variant="caption" className="mb-1">
            Marchandise rendue
          </Text>
          <StatValue value={money.money(r.montant, devise)} />
          {r.rembourse !== r.montant ? (
            <View className="mt-3">
              <Text variant="caption" className="mb-1">
                Remboursé en espèces
              </Text>
              <StatValue value={money.money(r.rembourse, devise)} tone="destructive" />
              {/* La différence a éteint de la dette : c'est la règle de l'ordre
                  d'imputation, et la dire évite de croire à une erreur. */}
              <Text variant="caption" className="mt-1">
                Le reste a éteint la dette du client sur cette facture.
              </Text>
            </View>
          ) : null}
          {r.motif ? (
            <View className="mt-3">
              <Text variant="caption" className="mb-1">
                Motif
              </Text>
              <Text variant="bodySmall">{r.motif}</Text>
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
              Approuver le retour
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
          <CardHeader title={`Articles (${r.lignes.length})`} />
          <View>
            {r.lignes.map((l, i) => (
              <View key={l.id}>
                {i > 0 ? <Divider /> : null}
                <View className="flex-row items-start justify-between gap-3 py-3">
                  <View className="min-w-0 flex-1">
                    <Text variant="bodySmall" className="font-sans-medium">
                      {l.produit}
                    </Text>
                    <Text variant="caption">
                      {`${l.quantite} × ${money.money(l.prixUnitaire, devise)}`}
                      {/* Ne PAS remettre en stock est le cas particulier : un
                          article cassé ne retourne pas en rayon. */}
                      {l.remisEnStock ? "" : "  ·  non remis en stock"}
                    </Text>
                  </View>
                  <Text variant="bodySmall" numeric className="shrink-0 font-sans-medium">
                    {money.money(l.total, devise)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <CardHeader title="Informations" />
          <View className="gap-0.5">
            <Text variant="caption">
              {`Créé le ${r.date ? formatDateTimeFr(r.date) : "—"}`}
            </Text>
            {r.approuveLe ? (
              <Text variant="caption">{`Approuvé le ${formatDateTimeFr(r.approuveLe)}`}</Text>
            ) : null}
          </View>
          {r.venteId ? (
            <View className="mt-3">
              <Button
                variant="outline"
                fullWidth
                leftIcon="Receipt"
                onPress={() => router.push(`/vente/${r.venteId}`)}
              >
                Voir la vente d&apos;origine
              </Button>
            </View>
          ) : null}
        </Card>
      </View>

      <AlertDialog
        ouvert={confirmation !== null}
        titre={
          confirmation === "approve" ? "Approuver ce retour ?" : "Rejeter ce retour ?"
        }
        message={
          confirmation === "approve"
            ? "La marchandise revient en stock. Le montant ÉTEINT D'ABORD la dette du client sur cette facture ; seul le reliquat sort de la caisse. Cette opération ne se défait pas."
            : "Le retour est rejeté. Ni le stock ni la caisse ne bougent."
        }
        confirmer={confirmation === "approve" ? "Approuver" : "Rejeter"}
        annuler="Revenir"
        destructif={confirmation === "reject"}
        enCours={envoi}
        onConfirmer={() => confirmation && void executer(confirmation)}
        onAnnuler={() => setConfirmation(null)}
      />
    </Screen>
  );
}
