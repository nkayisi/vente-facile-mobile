/**
 *
 * Le même corps sert la route et, sur un grand écran, le volet de droite de
 * la liste des dépenses : il lit son identifiant par `useIdDeFiche()` et en sort par
 * `useSortieDeFiche()` (voir `ui/liste-fiche.tsx`).
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
import { formatDateFr, formatDateTimeFr } from "@vente-facile/core";

import { detailDepense } from "@/data/caisse";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import {
  STATUT_DEPENSE,
  TRANSITION_DEPENSE,
  type TransitionDepense,
} from "@/data/types-caisse";
import {
  acteDuGeste,
  decisionsPossibles,
  motifPaiementImpossible,
} from "@/data/gestes-depense";
import { enAttenteCaisse, transitionDepense } from "@/features/caisse/actes";
import { sessionOuverte } from "@/features/pos/caisse";
import { moyensDePaiement } from "@/features/pos/donnees";
import { chromeDeLaSession } from "@/features/pos/ticket";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import {
  demandeDeDepense,
  papierDeLaFiche,
  recuAuPaiement,
  recuDepuisLaFiche,
} from "@/features/caisse/papiers-depense";
import {
  enregistrerEtImprimer,
  imprimerDemandeDeDepense,
  imprimerDocument,
  recuDeDepenseRange,
} from "@/printing/jobs";
import { useSession } from "@/session/provider";
import {
  AppBar,
  Badge,
  Button,
  Card,
  CardHeader,
  Chip,
  ChipRow,
  EmptyState,
  FormField,
  Grille,
  Icon,
  Input,
  Screen,
  Sheet,
  Spinner,
  StatValue,
  Text,
  useIdDeFiche,
  useSortieDeFiche,
  useToast,
} from "@/ui";

const TABLES = [
  "expenses",
  "expense_categories",
  "payment_methods",
  "cash_movements",
  "outbox_operations",
];

/** Ce qui sert à payer : les moyens, et la caisse ouverte de celui qui paie. */
async function chargerPaiement() {
  const [moyens, session] = await Promise.all([moyensDePaiement(), sessionOuverte()]);
  return {
    // Ni crédit ni points : on ne règle pas une dépense « à crédit ».
    moyens: moyens.filter((m) => m.methodType !== "credit"),
    caisseOuverte: session != null,
    // Imprimée sur le reçu d'un paiement en espèces : c'est d'elle que les
    // billets sortent.
    caisse: session?.registerName ?? null,
  };
}

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

/**
 * Le paiement a son instant réel (la sortie d'argent) ; à défaut, le JOUR de
 * paiement de la fiche, sans heure inventée. `null` quand la dépense n'est pas payée.
 */
function payeeLeLisible(d: { paiementLe: Date | null; payeeLe: Date | null }): string | null {
  if (d.paiementLe) return formatDateTimeFr(d.paiementLe);
  if (d.payeeLe) return formatDateFr(d.payeeLe);
  return null;
}

export function FicheDepense() {
  const id = useIdDeFiche();
  const sortir = useSortieDeFiche();
  const money = useMonnaie();
  const toast = useToast();
  const { snapshot, can } = useSession();
  const [impression, setImpression] = useState(false);
  const [decision, setDecision] = useState<TransitionDepense | null>(null);
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);
  /** Le moyen choisi pour payer ; `undefined` tant qu'aucun choix n'est fait. */
  const [moyenChoisi, setMoyenChoisi] = useState<string | null | undefined>(undefined);
  const [referencePaiement, setReferencePaiement] = useState("");

  const charger = useCallback(() => detailDepense(id), [id]);
  const { donnees: d, chargement } = useLecture(charger, { tables: TABLES, deps: [id] });
  const payeeLe = d ? payeeLeLisible(d) : null;
  const { donnees: attente } = useLecture(enAttenteCaisse, {
    tables: ["outbox_operations"],
  });
  const transitionEnFile = attente?.transitions.get(id);

  const { donnees: paiement } = useLecture(chargerPaiement, {
    tables: ["payment_methods", "register_sessions", "outbox_operations"],
  });

  // Le reçu rangé AU PAIEMENT, s'il existe : c'est lui qu'on réimprime, et
  // c'est lui qui dit qu'un paiement encore en file a déjà eu son papier.
  const reference = d?.reference ?? null;
  const chargerRecu = useCallback(
    () => (reference ? recuDeDepenseRange(reference) : Promise.resolve(null)),
    [reference]
  );
  const { donnees: recuRange } = useLecture(chargerRecu, {
    tables: ["print_jobs"],
    deps: [reference],
  });

  /**
   * Les droits de celui qui regarde, lus comme le serveur les lit : on
   * n'approuve jamais sa propre dépense (sauf le propriétaire), et un caissier
   * ne paie que la sienne. Voir `gestes-depense.ts`.
   */
  const moi = snapshot?.user.id ?? null;
  const proprietaire = snapshot?.membership?.role === "owner";
  const possibles = useMemo(
    () =>
      d
        ? decisionsPossibles(
            { status: d.statut, created_by: d.auteur },
            {
              peutCreer: can("cashbook.create_expense"),
              peutApprouver: can("cashbook.approve_expense"),
              peutPayer: can("cashbook.pay_expense"),
              proprietaire,
              moi,
            },
            Boolean(d.envoi)
          )
        : [],
    [d?.statut, d?.auteur, d?.envoi, can, proprietaire, moi]
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
          action={{ label: "Retour", onPress: sortir }}
        />
      </Screen>
    );
  }

  const s = STATUT_DEPENSE[d.statut];

  const papier = papierDeLaFiche(d.statut, Boolean(recuRange));

  /**
   * Réimprime le papier de la dépense : le reçu une fois payée, la demande
   * avant. La demande se régénère (elle n'est pas rangée) ; le reçu ressort
   * celui rangé au paiement, ou se refait depuis la sortie d'argent quand elle
   * a été payée ailleurs. Le numéro ne change jamais : c'est celui de la
   * dépense.
   */
  const imprimer = async () => {
    if (impression || !papier) return;
    setImpression(true);
    const chrome = chromeDeLaSession(snapshot);
    try {
      if (papier === "recu") {
        if (recuRange) {
          await imprimerDocument(recuRange.id);
        } else {
          await enregistrerEtImprimer({
            kind: "expense",
            documentNumber: d.reference,
            label: d.description || d.reference,
            donnees: { ...recuDepuisLaFiche(d, chrome), auPaiement: true },
            // Payée ailleurs : son reçu est déjà sorti là-bas.
            dejaImprime: true,
          });
        }
        toast.succes("Reçu de dépense envoyé à l'imprimante.");
      } else {
        await imprimerDemandeDeDepense(
          demandeDeDepense({
            reference: d.reference,
            chrome,
            // Une dépense encore en file a été saisie ICI.
            demandeur: d.demandeur ?? (d.envoi ? snapshot?.user.full_name : null),
            categorie: d.categorie,
            beneficiaire: d.beneficiaire,
            montant: d.montant,
            devise: d.devise,
            description: d.description,
            le: d.date ?? new Date(),
            jour: Boolean(d.date),
            duplicata: true,
          })
        );
        toast.succes("Demande de dépense envoyée à l'imprimante.");
      }
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "Le document n'a pas pu être imprimé.");
    } finally {
      setImpression(false);
    }
  };

  const payer = decision === "pay" || decision === "pay_direct";
  // Le moyen proposé d'office : celui déjà noté sur la dépense, sinon les
  // espèces - le cas ordinaire d'une petite dépense réglée au comptoir.
  const moyenParDefaut =
    paiement?.moyens.find((m) => m.id === d.methodeId)?.id ??
    paiement?.moyens.find((m) => m.methodType === "cash")?.id ??
    null;
  const moyenId = moyenChoisi === undefined ? moyenParDefaut : moyenChoisi;
  const moyen = paiement?.moyens.find((m) => m.id === moyenId) ?? null;
  const enEspeces = moyen == null || moyen.methodType === "cash";
  const paiementImpossible = payer
    ? motifPaiementImpossible(moyen, Boolean(paiement?.caisseOuverte))
    : null;

  const decider = async () => {
    if (!decision || envoi || paiementImpossible) return;
    setEnvoi(true);
    try {
      await transitionDepense(
        acteDuGeste(decision),
        d.id,
        motif,
        payer
          ? {
              methode: moyenId,
              reference: enEspeces ? undefined : referencePaiement,
              // Les billets quittent le tiroir : en espèces, et seulement si
              // l'approbation ne les a pas déjà sortis.
              sortie:
                enEspeces && !d.sortieFaite
                  ? { montant: d.montant, devise: d.devise, description: `Dépense: ${d.description}` }
                  : null,
            }
          : undefined
      );
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ LE REÇU SORT AU PAIEMENT, HORS LIGNE COMPRIS.                    │
      // │                                                                  │
      // │ C'est maintenant que les billets quittent le tiroir et que le    │
      // │ bénéficiaire peut signer. Il nomme le PAYEUR (l'utilisateur du   │
      // │ terminal), l'heure du geste et la caisse, et se range marqué au  │
      // │ paiement. Un échec d'impression ne défait pas le paiement.       │
      // └──────────────────────────────────────────────────────────────────┘
      let suite = "l'opération partira à la prochaine synchronisation.";
      if (payer) {
        try {
          await enregistrerEtImprimer({
            kind: "expense",
            documentNumber: d.reference,
            label: d.description || d.reference,
            donnees: recuAuPaiement({
              depense: d,
              chrome: chromeDeLaSession(snapshot),
              payeur: snapshot?.user.full_name,
              caisse: enEspeces ? paiement?.caisse : null,
              moyen: moyen?.name,
              referencePaiement: enEspeces ? null : referencePaiement.trim(),
              // Payer directement vaut approbation : le payeur approuve.
              approbateur: decision === "pay_direct" ? snapshot?.user.full_name : d.approbateur,
              le: new Date(),
            }),
          });
          suite = "reçu envoyé à l'imprimante ; l'opération partira à la prochaine synchronisation.";
        } catch {
          suite =
            "le reçu n'a pas pu être imprimé, réimprimez-le d'ici ; l'opération partira à la prochaine synchronisation.";
        }
      }
      toast.succes(`${TRANSITION_DEPENSE[decision].label} : ${suite}`);
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
            <Grille largeurMin={150} min={2} max={4} ecart={8}>
              {possibles.map((t) => (
                <View key={t}>
                  <Button
                    fullWidth
                    variant={TRANSITION_DEPENSE[t].destructif ? "outline" : "primary"}
                    leftIcon={TRANSITION_DEPENSE[t].icone}
                    disabled={Boolean(transitionEnFile)}
                    onPress={() => {
                      setMotif("");
                      setMoyenChoisi(undefined);
                      setReferencePaiement("");
                      setDecision(t);
                    }}
                  >
                    {TRANSITION_DEPENSE[t].label}
                  </Button>
                </View>
              ))}
            </Grille>
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
            consequence="Les décisions seront possibles une fois le serveur informé. La demande porte déjà son numéro définitif, que le reçu reprendra au paiement."
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

        {papier ? (
          <Button
            variant="outline"
            fullWidth
            leftIcon="Printer"
            loading={impression}
            onPress={() => void imprimer()}
          >
            {papier === "recu" ? "Imprimer le reçu" : "Imprimer la demande"}
          </Button>
        ) : null}

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
            {/* `date` et `payeeLe` sont des JOURS : une heure y serait inventée.
                Le paiement a son instant réel, celui de la sortie d'argent. */}
            <Paire label="Date" valeur={d.date ? formatDateFr(d.date) : "-"} />
            {payeeLe ? <Paire label="Payée le" valeur={payeeLe} /> : null}
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
                  : d.statut === "rejected"
                    ? "Cette dépense est rejetée : elle ne se paie pas. Créez-en une nouvelle si elle est due."
                    : d.statut === "pending" && d.auteur === moi && !proprietaire
                      ? "Votre dépense attend l'approbation du propriétaire ou d'un autre gérant. Vous pourrez la payer une fois approuvée."
                      : "Aucune décision ne vous est ouverte sur cette dépense. Approuver demande le droit « approuver une dépense » ; payer la dépense d'un autre aussi."}
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
            {payer ? (
              <View className="gap-2">
                <Text variant="label">Moyen de paiement</Text>
                <ChipRow>
                  {(paiement?.moyens ?? []).map((m) => (
                    <Chip
                      key={m.id}
                      label={m.name}
                      actif={m.id === moyenId}
                      onPress={() => setMoyenChoisi(m.id)}
                    />
                  ))}
                </ChipRow>
                {!enEspeces ? (
                  <FormField label="Référence (facultatif)">
                    <Input
                      value={referencePaiement}
                      onChangeText={setReferencePaiement}
                      placeholder="N° de transaction"
                    />
                  </FormField>
                ) : null}
                {/* Le refus se dit AVANT l'envoi : le serveur refuserait un
                    paiement en espèces sans caisse ouverte, et la quarantaine
                    se découvrirait loin d'ici. */}
                {paiementImpossible ? (
                  <Text variant="caption" className="text-destructive">
                    {paiementImpossible}
                  </Text>
                ) : null}
              </View>
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
                  disabled={Boolean(paiementImpossible)}
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
    "La dépense est approuvée. Rien ne sort encore du tiroir : l'argent sort quand elle est payée, de la caisse de celui qui paie.",
  reject:
    "La dépense est refusée. Ni le tiroir ni le stock ne bougent, et elle reste consultable. Elle ne pourra pas être payée.",
  pay: "La dépense est payée. En espèces, l'argent sort de VOTRE caisse, qui doit être ouverte, et figurera dans votre clôture.",
  pay_direct:
    "La dépense est approuvée et payée du même geste. En espèces, l'argent sort de VOTRE caisse, qui doit être ouverte.",
  cancel:
    "La dépense est annulée et sa sortie de caisse CONTREPASSÉE : l'argent revient au tiroir. Les deux écritures restent au rapport de caisse.",
};
