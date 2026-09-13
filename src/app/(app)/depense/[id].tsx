/**
 * Détail d'une dépense : son reçu, et les cinq décisions.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES CINQ TRANSITIONS MANQUAIENT AU TERMINAL.                            │
 * │                                                                          │
 * │ Soumettre, approuver, rejeter, payer, annuler vivaient dans              │
 * │ `ExpenseViewSet`, donc hors d'atteinte du journal : un gérant au comptoir │
 * │ ne pouvait pas approuver la dépense qu'un caissier venait d'enregistrer, │
 * │ et devait ouvrir un ordinateur. Les corps sont descendus dans            │
 * │ `cashbook.services`, que la vue ET le journal appellent : la parité      │
 * │ n'est pas surveillée, elle est structurelle.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES DÉCISIONS VIVENT DANS UNE BARRE FIXE, PAS AU MILIEU DE LA PAGE.     │
 * │                                                                          │
 * │ Elles défileraient hors de l'écran au moment précis où l'on descend LIRE │
 * │ ce qu'on approuve. `Screen pied` est un FRÈRE du défilement : le contenu │
 * │ se réduit d'autant, rien ne passe dessous, et la zone sûre a un seul     │
 * │ propriétaire. C'est la grammaire de la fiche de vente et de celle d'un   │
 * │ retour.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **APPROUVER est l'acte destructeur, pas REJETER.** Rejeter ne bouge ni le
 * stock ni la caisse : c'est le refus d'un changement. Approuver et payer font
 * SORTIR de l'argent du tiroir, et ne se défont que par une annulation qui
 * laisse deux écritures. Le rouge vit donc dans la confirmation, sur l'acte
 * irréversible - le porter sur « Rejeter » dirait l'inverse du risque.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateTimeFr } from "@vente-facile/core";

import { detailDepense } from "@/data/caisse";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import {
  STATUT_DEPENSE,
  TRANSITION_DEPENSE,
  decisionsPossibles,
  type TransitionDepense,
} from "@/data/types-caisse";
import { enAttenteCaisse, transitionDepense } from "@/features/caisse/actes";
import { chromeDeLaSession } from "@/features/pos/ticket";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { documentParNumero, enregistrerEtImprimer, imprimerDocument } from "@/printing/jobs";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, Button, Card, CardHeader, EmptyState, FormField, Icon, Input,
  Screen, Sheet, Spinner, StatValue, Text, useToast, type IconName,
} from "@/ui";

const TABLES = ["expenses", "expense_categories", "payment_methods", "outbox_operations"];

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
  const { snapshot, can } = useSession();
  const [impression, setImpression] = useState(false);
  const [decision, setDecision] = useState<TransitionDepense | null>(null);
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => detailDepense(id), [id]);
  const { donnees: d, chargement } = useLecture(charger, { tables: TABLES, deps: [id] });
  const { donnees: attente } = useLecture(enAttenteCaisse, {
    tables: ["outbox_operations"],
  });
  const transitionEnFile = attente?.transitions.get(id);

  const possibles = useMemo(
    () =>
      d
        ? decisionsPossibles(d.statut, Boolean(d.envoi)).filter((t) =>
            can(TRANSITION_DEPENSE[t].permission)
          )
        : [],
    [d?.statut, d?.envoi, can]
  );

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

  const decider = async () => {
    if (!decision || envoi) return;
    setEnvoi(true);
    try {
      await transitionDepense(`expense.${decision}` as never, d.id, motif);
      toast.succes(
        `${TRANSITION_DEPENSE[decision].label} : l'opération partira à la prochaine synchronisation.`
      );
      setDecision(null);
      setMotif("");
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "La décision n'a pas pu être enregistrée."
      );
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen
      scroll
      padded={false}
      pied={
        possibles.length > 0 ? (
          <View className="gap-2">
            {/* Un bouton fermé qui DIT pourquoi n'est pas un cul-de-sac ; un
                bouton absent en est un. La phrase distingue les deux états :
                bloqué n'attend pas le réseau, il attend une décision. */}
            {transitionEnFile ? (
              <Text variant="caption">
                {transitionEnFile === "bloque"
                  ? "Une décision est en file et attend un droit ou un abonnement à jour."
                  : "Une décision attend déjà son envoi pour cette dépense."}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              {possibles.map((t) => (
                <View key={t} className="min-w-[46%] flex-1">
                  <Button
                    fullWidth
                    variant={TRANSITION_DEPENSE[t].destructif ? "outline" : "primary"}
                    leftIcon={TRANSITION_DEPENSE[t].icone as IconName}
                    disabled={Boolean(transitionEnFile)}
                    onPress={() => {
                      setMotif("");
                      setDecision(t);
                    }}
                  >
                    {TRANSITION_DEPENSE[t].label}
                  </Button>
                </View>
              ))}
            </View>
          </View>
        ) : undefined
      }
    >
      <AppBar
        title={d.description || d.reference}
        subtitle={d.reference}
        right={s ? <Badge tone={s.ton}>{s.label}</Badge> : undefined}
      />

      <View className="gap-4 p-4">
        {/* La pièce elle-même n'est pas encore partie : c'est ce qui ferme
            les décisions, et il faut le DIRE. Un pied vide se lirait comme une
            fiche à qui l'on aurait retiré ses actions. */}
        {d.envoi ? (
          <BandeauEnvoi
            envoi={d.envoi}
            titre="Cette dépense attend son envoi"
            consequence="Les décisions seront possibles une fois le serveur informé. Le reçu, lui, porte déjà son numéro définitif."
          />
        ) : transitionEnFile ? (
          <BandeauEnvoi
            envoi={transitionEnFile}
            titre="Une décision attend son envoi"
            consequence="Le statut de la dépense ne changera qu'après."
          />
        ) : null}

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
          loading={impression}
          onPress={() => void imprimer()}
        >
          Imprimer le reçu
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
            <Paire label="Date" valeur={d.date ? formatDateTimeFr(d.date) : "—"} />
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

        {/* Quand il n'y a AUCUN bouton, l'écran dit pourquoi : un pied vide se
            lit comme une fiche à qui l'on aurait retiré ses actions. */}
        {possibles.length === 0 ? (
          <View className="flex-row items-start gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <Icon name="Info" size={16} color="mutedForeground" />
            <Text variant="caption" className="min-w-0 flex-1">
              {d.envoi
                ? "Le serveur ne connaît pas encore cette dépense. Synchronisez pour pouvoir la soumettre, l'approuver ou la payer."
                : d.statut === "cancelled"
                  ? "Cette dépense est annulée : plus aucune décision n'est possible."
                  : "Aucune décision ne vous est ouverte sur cette dépense. L'approbation et le paiement demandent le droit « approuver une dépense »."}
            </Text>
          </View>
        ) : null}
      </View>

      <Sheet
        ouvert={decision !== null}
        onFermer={() => setDecision(null)}
        titre={decision ? TRANSITION_DEPENSE[decision].label : ""}
      >
        {decision ? (
          <>
            <Text variant="bodySmall">{PHRASES[decision]}</Text>
            {/* Le motif ne se demande QUE là où le serveur le range dans les
                notes de la dépense. L'offrir ailleurs ferait taper un texte
                que personne ne relira jamais. */}
            {decision === "reject" || decision === "cancel" ? (
              <FormField label="Motif" hint="Il rejoint les notes de la dépense.">
                <Input value={motif} onChangeText={setMotif} autoFocus />
              </FormField>
            ) : null}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button variant="outline" fullWidth onPress={() => setDecision(null)}>
                  Retour
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  fullWidth
                  // Le rouge est sur l'acte IRRÉVERSIBLE : approuver et payer
                  // font sortir l'argent, annuler le contrepasse. Rejeter ne
                  // bouge rien.
                  variant={
                    decision === "reject" ? "primary" : "destructive"
                  }
                  loading={envoi}
                  onPress={() => void decider()}
                >
                  {TRANSITION_DEPENSE[decision].label}
                </Button>
              </View>
            </View>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

/** Ce que chaque décision ENGAGE, dit avant l'appui. */
const PHRASES: Record<TransitionDepense, string> = {
  submit:
    "La dépense passe en attente d'approbation. Rien ne sort encore du tiroir.",
  approve:
    "L'argent SORT de la caisse : un mouvement de sortie est créé dans la devise de la dépense.",
  reject:
    "La dépense est refusée. Ni le tiroir ni le stock ne bougent, et elle reste consultable.",
  pay: "La dépense est marquée payée, et approuvée au passage si elle ne l'était pas. L'argent sort alors de la caisse.",
  cancel:
    "La dépense est annulée et sa sortie de caisse CONTREPASSÉE : l'argent revient au tiroir. Les deux écritures restent au rapport de caisse.",
};
