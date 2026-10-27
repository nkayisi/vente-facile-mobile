/**
 * La fiche d'une réquisition : ce qu'on demande, et pourquoi.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE STOCK ET LE SEUIL AFFICHÉS SONT CEUX DU JOUR DE LA DEMANDE.          │
 * │                                                                          │
 * │ Le serveur les FIGE à la création (`stock_at_request`,                   │
 * │ `reorder_point_at_request`). Les relire aujourd'hui donnerait le stock   │
 * │ d'aujourd'hui, qui a bougé : la fiche ne dirait plus pourquoi la demande │
 * │ a été faite, et son lecteur ne pourrait pas juger si elle tient encore.  │
 * │ Même règle que l'instantané d'une session d'inventaire.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA DÉCISION VIT DANS UNE BARRE FIXE. Posée au milieu de la page, elle
 * défilerait hors de l'écran au moment précis où l'on descend LIRE ce qu'on
 * approuve. Et « Rejeter » n'est pas l'action destructrice : rejeter n'engage
 * rien, approuver engage de l'argent.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateFr, formatQuantity, formatUnitQuantity } from "@vente-facile/core";

import { libelleEnvoi } from "@/data/envoi";
import { useLecture } from "@/data/live";
import {
  TABLES_REQUISITIONS,
  detailRequisition,
} from "@/data/requisitions";
import { useEnLigne } from "@/data/reseau";
import {
  LIBELLE_TRANSITION,
  attentesRequisitions,
  creationsRequisitionsEnAttente,
  transitionRequisition,
  type TransitionRequisition,
} from "@/features/stock/actes-requisition";
import { useSession } from "@/session/provider";
import {
  AlertDialog, AppBar, Badge, Banner, Button, Card, CardHeader, Divider,
  EmptyState, ListItem, Screen, Spinner, Text, useToast,
} from "@/ui";

/** D'où part chaque transition, et quel droit elle demande. */
const ACTIONS: Record<
  TransitionRequisition,
  { depuis: string[]; permission: string; destructif?: boolean }
> = {
  submit: { depuis: ["draft"], permission: "requisitions.create" },
  cancel: { depuis: ["draft", "submitted"], permission: "requisitions.create", destructif: true },
  approve: { depuis: ["submitted"], permission: "requisitions.approve" },
  reject: { depuis: ["submitted"], permission: "requisitions.approve", destructif: true },
};

const TON: Record<string, "neutral" | "warning" | "success" | "destructive"> = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "neutral",
};

export default function FicheRequisition() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useSession();
  const toast = useToast();
  const enLigne = useEnLigne();

  const [envoi, setEnvoi] = useState(false);
  const [confirmation, setConfirmation] = useState<TransitionRequisition | null>(null);

  const charger = useCallback(() => detailRequisition(id), [id]);
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES_REQUISITIONS,
    deps: [id],
  });
  const { donnees: attentes } = useLecture(attentesRequisitions, {
    tables: ["outbox_operations"],
  });
  const { donnees: creations } = useLecture(creationsRequisitionsEnAttente, {
    tables: ["outbox_operations"],
  });

  const executer = useCallback(
    async (transition: TransitionRequisition) => {
      if (envoi) return;
      setEnvoi(true);
      try {
        await transitionRequisition(id, transition);
        setConfirmation(null);
        toast.succes("Opération mise en file. Elle partira à la prochaine synchronisation.");
      } catch (e) {
        toast.erreur(
          e instanceof Error ? e.message : "L'opération n'a pas pu être mise en file."
        );
      } finally {
        setEnvoi(false);
      }
    },
    [id, envoi, toast]
  );

  if (chargement && !donnees) {
    return (
      <Screen>
        <AppBar title="Réquisition" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!donnees) {
    return (
      <Screen padded={false}>
        <AppBar title="Réquisition" />
        <EmptyState
          icon="ShoppingBasket"
          title="Réquisition introuvable"
          message="Elle n'est pas encore descendue sur ce terminal, ou elle a été supprimée."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const { requisition: r, lignes } = donnees;
  const creationEnFile = creations?.get(r.id);
  const envoiEnFile = attentes?.get(r.id);
  const enFile = envoiEnFile !== undefined;

  /**
   * ⚠ UNE PIÈCE QUE LE SERVEUR NE CONNAÎT PAS N'ACCEPTE AUCUNE DÉCISION.
   *
   * `_objet_de_lorg` la chercherait et ne la trouverait pas : refus
   * DÉTERMINISTE, donc quarantaine, découverte des jours plus tard sur un
   * autre écran. On ferme les boutons et on DIT pourquoi.
   */
  const possibles = creationEnFile
    ? []
    : (Object.keys(ACTIONS) as TransitionRequisition[]).filter(
        (a) => ACTIONS[a].depuis.includes(r.statut) && can(ACTIONS[a].permission)
      );

  const progressifs = possibles.filter((a) => a === "submit" || a === "approve");
  const refusants = possibles.filter((a) => a === "cancel" || a === "reject");

  const motif = creationEnFile
    ? "Cette réquisition attend encore son envoi. Les décisions s'ouvriront quand le serveur l'aura reçue."
    : envoiEnFile === "bloque"
      ? "Une opération sur cette réquisition attend un droit : elle repartira dès que l'abonnement sera réglé ou la permission accordée."
      : enFile
        ? "Une opération sur cette réquisition est déjà en file. Les actions rouvriront après la prochaine synchronisation."
        : null;

  const barreActions =
    possibles.length === 0 && !motif ? undefined : (
      <View className="gap-2.5">
        {motif ? (
          <Text variant="caption" className="text-muted-foreground">
            {motif}
          </Text>
        ) : null}
        {possibles.length > 0 ? (
          <View className="flex-row gap-2">
            {refusants.map((a) => (
              <Button
                key={a}
                variant="outline"
                className="flex-1"
                disabled={enFile || envoi}
                onPress={() => setConfirmation(a)}
              >
                {LIBELLE_TRANSITION[a]}
              </Button>
            ))}
            {progressifs.map((a) => (
              <Button
                key={a}
                className="flex-1"
                disabled={enFile || envoi}
                onPress={() => setConfirmation(a)}
              >
                {LIBELLE_TRANSITION[a]}
              </Button>
            ))}
          </View>
        ) : null}
      </View>
    );

  const badgeEnvoi = libelleEnvoi(r.envoi ?? envoiEnFile);

  return (
    <Screen scroll padded={false} pied={barreActions}>
      <AppBar title={r.reference} subtitle={r.entrepot ?? undefined} />

      <View className="gap-4 px-4 pb-6">
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge tone={TON[r.statut] ?? "neutral"}>{r.statutLabel}</Badge>
          {badgeEnvoi ? <Badge tone={badgeEnvoi.ton}>{badgeEnvoi.court}</Badge> : null}
        </View>

        {r.statut === "approved" ? (
          /* ⚠ APPROUVÉE N'EST PAS ACHETÉE. Une réquisition ne commande rien et
             ne bouge aucun stock : le dire évite qu'un gérant la croie passée
             chez le fournisseur. */
          <Banner
            tone="info"
            title="Approuvée, pas encore commandée"
            message="Elle autorise l'achat. Le stock ne bougera qu'à la réception de la marchandise."
          />
        ) : null}

        {r.notesDecision ? (
          <Banner
            tone={r.statut === "rejected" ? "warning" : "info"}
            title={r.statut === "rejected" ? "Motif du refus" : "Note de décision"}
            message={r.notesDecision}
          />
        ) : null}

        <Card className="overflow-hidden p-0">
          <CardHeader
            title={`Articles demandés (${lignes.length})`}
            // Le libellé dit que l'instantané est FIGÉ : sans lui, un lecteur
            // compare ces chiffres au stock d'aujourd'hui et croit à une erreur.
            subtitle="Stock et seuil relevés le jour de la demande"
          />
          {creationEnFile ? (
            /* Une pièce encore en file n'a pas de lignes EN TABLE. On le DIT
               plutôt que d'afficher une section vide, qui se lirait comme une
               réquisition sans article. */
            <View className="pb-4">
              <EmptyState
                variante="carte"
                title="Le détail arrivera avec l'envoi"
                message="Les articles demandés sont dans la file ; ils s'afficheront ici après la prochaine synchronisation."
              />
            </View>
          ) : lignes.length === 0 ? (
            <View className="pb-4">
              <EmptyState variante="carte" title="Aucun article" message="Cette demande est vide." />
            </View>
          ) : (
            lignes.map((l, i) => (
              <View key={l.id}>
                {i > 0 ? <Divider inset /> : null}
                <ListItem
                  title={l.produit}
                  subtitle={`En rayon ${formatQuantity(l.stockAlors)} · seuil ${formatQuantity(l.seuilAlors)}${l.note ? ` · ${l.note}` : ""}`}
                  value={
                    l.unite
                      ? formatUnitQuantity(l.demande, l.unite)
                      : formatQuantity(l.demande)
                  }
                />
              </View>
            ))
          )}
        </Card>

        {r.notes ? (
          <Card>
            <CardHeader title="Note" />
            <View className="px-4 pb-4">
              <Text variant="body">{r.notes}</Text>
            </View>
          </Card>
        ) : null}

        <Card className="overflow-hidden p-0">
          <CardHeader title="Suivi" />
          <ListItem title="Demandée le" value={r.demandeLe ? formatDateFr(r.demandeLe) : "—"} />
          {r.decideLe ? (
            <>
              <Divider inset />
              <ListItem title="Décidée le" value={formatDateFr(r.decideLe)} />
            </>
          ) : null}
        </Card>

        {/* ⚠ LE BORDEREAU VIENT DU SERVEUR, comme tous les documents A4 de ce
            dépôt. Le rendre ici donnerait un second moteur, donc une seconde
            mise en page, et deux papiers pour la même demande. Hors ligne, le
            bouton se ferme AVEC sa raison : échouer après coup ferait croire à
            une panne. */}
        {!enLigne ? (
          <Banner
            tone="warning"
            title="Le bordereau demande une connexion"
            message="Il est mis en page par le serveur, pour qu'il ne diffère jamais de celui du back-office."
          />
        ) : null}
      </View>

      {confirmation ? (
        <AlertDialog
          ouvert
          titre={`${LIBELLE_TRANSITION[confirmation]} la réquisition ?`}
          message={
            confirmation === "approve"
              ? "Elle autorisera l'achat. Le stock ne bougera pas."
              : confirmation === "submit"
                ? "Elle partira pour décision. Vous ne pourrez plus la modifier."
                : "Cette décision ne se défait pas."
          }
          confirmer={LIBELLE_TRANSITION[confirmation]}
          destructif={ACTIONS[confirmation].destructif}
          onConfirmer={() => void executer(confirmation)}
          onAnnuler={() => setConfirmation(null)}
          enCours={envoi}
        />
      ) : null}
    </Screen>
  );
}
