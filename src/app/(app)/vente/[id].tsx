/**
 * Détail d'une vente. Miroir de `app/dashboard/sales/[id]/page.tsx`.
 *
 * Trois choses s'y jouent, et chacune porte une règle du dépôt.
 *
 * 1. **On LIT ce que le serveur a arrêté.** Totaux, remise, part fidélité,
 *    reste dû : rien n'est recalculé. La seule opération faite ici est le
 *    découpage de `discount_amount` en remise commerciale et remise fidélité,
 *    parce que le champ englobe les deux ; les afficher côte à côte sans
 *    retrancher montrerait deux fois la même somme.
 *
 * 2. **Ce qui attend dans le journal s'affiche, mais à part.** Un règlement
 *    encaissé hors ligne n'est PAS écrit dans `payments` : il vit dans le
 *    journal d'opérations tant que le serveur ne l'a pas confirmé. Sans le
 *    montrer, un caissier verrait sa facture inchangée et encaisserait une
 *    seconde fois. Il est donc rendu dans un bandeau distinct, et le reste dû
 *    affiché tient compte de lui - en le disant.
 *
 * 3. **Le ticket se réimprime toujours.** Le back-office faisait disparaître
 *    son bouton une fois `receipt_printed` posé, ce qui rendait tout duplicata
 *    impossible ; une imprimante à court de papier faisait alors perdre le
 *    reçu. Ici il reste, et la réimpression sort marquée DUPLICATA sous le
 *    MÊME numéro.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateTimeFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { detailVente, type LigneVente } from "@/data/vente-detail";
import { STATUT_VENTE } from "@/data/ventes";
import { annulerVente, enAttenteSurVente } from "@/features/ventes/actes";
import { venteEnAttenteParId, type VenteEnAttente } from "@/features/ventes/attente";
import { libelleEnvoi } from "@/data/envoi";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSynchronisation } from "@/features/sync/provider";
import { imprimerTicketVente } from "@/features/ventes/reimpression";
import { documentParNumero, imprimerDocument } from "@/printing/jobs";
import { FeuilleRetour } from "@/features/ventes/feuille-retour";
import { renduDeLaVente, resteARendre } from "@/features/ventes/rendu";
import { STATUT_RETOUR } from "@/data/retours-devis";
import { useSession } from "@/session/provider";
import {
  AlertDialog,
  AppBar,
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  DataRow,
  Divider,
  EmptyState,
  Icon,
  Mesure,
  Screen,
  Spinner,
  Text,
  useToast,
} from "@/ui";

import { FeuilleReglement } from "@/features/ventes/feuille-reglement";

const TABLES = ["sales", "sale_items", "payments", "customers", "registers", "warehouses"];
const JOURNAL = ["outbox_operations"];

/** Une ligne libellé / montant, mesurée comme sur le ticket : le libellé cède. */
function Paire({
  label,
  valeur,
  ton = "normal",
  fort = false,
}: {
  label: string;
  valeur: string;
  ton?: "normal" | "success" | "destructive" | "primary" | "muted";
  fort?: boolean;
}) {
  const couleur =
    ton === "success"
      ? "text-success"
      : ton === "destructive"
        ? "text-destructive"
        : ton === "primary"
          ? "text-primary"
          : ton === "muted"
            ? "text-muted-foreground"
            : "text-foreground";
  return (
    <View className="flex-row items-baseline justify-between gap-3 py-1">
      <Text variant="bodySmall" numberOfLines={1} className="min-w-0 flex-1 text-muted-foreground">
        {label}
      </Text>
      <Text
        variant={fort ? "body" : "bodySmall"}
        numeric
        className={`shrink-0 ${couleur} ${fort ? "font-sans-medium" : ""}`}
      >
        {valeur}
      </Text>
    </View>
  );
}

function LigneArticle({
  ligne,
  devise,
  rendu = 0,
}: {
  ligne: LigneVente;
  devise: string;
  /** Quantité déjà rendue sur cette ligne, retours en file compris. */
  rendu?: number;
}) {
  const money = useMonnaie();
  return (
    <View className="py-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="bodySmall" className="font-sans-medium">
            {ligne.produit}
          </Text>
          {ligne.sku ? <Text variant="caption">{ligne.sku}</Text> : null}
        </View>
        <Text numeric variant="bodySmall" className="shrink-0 font-sans-medium">
          {money.money(ligne.total, devise)}
        </Text>
      </View>
      <View className="mt-1 flex-row items-baseline justify-between gap-3">
        <Text variant="caption" numberOfLines={2} className="min-w-0 flex-1">
          {`${ligne.quantiteAffichee} × ${money.money(ligne.prixUnitaire, devise)}`}
          {ligne.remisePourcent > 0 ? `  ·  remise ${ligne.remisePourcent} %` : ""}
        </Text>
        {/* Le total en unités reste SOUS la lecture en contenants : le premier
            sert au réassort, le second au comptoir.
            Il n'apparaît QUE si des contenants sont facturés. Le conditionner
            à la seule présence d'un facteur écrit « 3 au total » sous
            « 3 PIECES » - vérifié à l'écran, c'est une redite qui salit une
            liste entière pour n'apporter rien. */}
        {ligne.contenants > 0 ? (
          <Text numeric variant="caption" className="shrink-0">
            {`${ligne.quantiteTotale} au total`}
          </Text>
        ) : null}
      </View>
      {/* ┌──────────────────────────────────────────────────────────────────┐
          │ CE QUI EST RENDU SE LIT SUR LA LIGNE, PAS AILLEURS.             │
          │                                                                  │
          │ La facture ne portait aucune trace de ses retours : elle         │
          │ affichait « 5 × 1 000 » sur une ligne dont trois unités étaient  │
          │ revenues et avaient été remboursées. Le commerçant qui la relit  │
          │ pour comprendre un écart de stock ou de caisse n'y trouvait rien.│
          └──────────────────────────────────────────────────────────────────┘ */}
      {rendu > 0 ? (
        <View className="mt-1.5 flex-row">
          <Badge tone={rendu >= ligne.quantiteTotale ? "warning" : "neutral"}>
            {rendu >= ligne.quantiteTotale
              ? "Entièrement rendu"
              : `${rendu} rendu${rendu > 1 ? "s" : ""} sur ${ligne.quantiteTotale}`}
          </Badge>
        </View>
      ) : null}
    </View>
  );
}

export default function DetailVenteEcran() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMonnaie();
  const toast = useToast();
  const { can, snapshot } = useSession();
  // Le bandeau des règlements en file offre son issue SUR PLACE : le caissier
  // a le client devant lui, il ne doit pas quitter la facture pour la mettre à
  // jour.
  const { enCours: enCoursSync, lancer: lancerSync } = useSynchronisation();

  const [feuilleReglement, setFeuilleReglement] = useState(false);
  const [feuilleRetour, setFeuilleRetour] = useState(false);
  const [dialogueAnnulation, setDialogueAnnulation] = useState(false);
  const [annulationEnCours, setAnnulationEnCours] = useState(false);
  const [impression, setImpression] = useState(false);

  const charger = useCallback(() => detailVente(id), [id]);
  const { donnees: vente, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [id],
  });
  // Cherchée dans le JOURNAL quand la table ne la connaît pas : une vente
  // encaissée hors ligne n'est pas dans `sales`, et sa propre liste y mène.
  const chargerEnFile = useCallback(() => venteEnAttenteParId(id), [id]);
  const { donnees: enFile } = useLecture(chargerEnFile, {
    tables: ["outbox_operations", "print_jobs"],
    deps: [id],
  });

  const chargerAttente = useCallback(() => enAttenteSurVente(id), [id]);
  const { donnees: attente } = useLecture(chargerAttente, {
    tables: JOURNAL,
    deps: [id],
  });

  // Ce qui a DÉJÀ été rendu sur cette facture, table et journal réunis.
  // Sans cette lecture, l'écran proposait de rendre une marchandise déjà
  // rendue, et le serveur l'acceptait : voir `features/ventes/rendu.ts`.
  const chargerRendu = useCallback(() => renduDeLaVente(id), [id]);
  const { donnees: rendu } = useLecture(chargerRendu, {
    tables: ["sale_returns", "sale_return_items", "outbox_operations"],
    deps: [id],
  });

  if (chargement && !vente) {
    return (
      <Screen>
        <AppBar title="Vente" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!vente) {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ « VENTE INTROUVABLE » ÉTAIT FAUX, ET C'ÉTAIT SA PROPRE LISTE QUI   │
    // │ Y MENAIT.                                                          │
    // │                                                                    │
    // │ Le hub et l'historique fusionnent le journal - c'est tout leur      │
    // │ objet - et `detailVente` ne lit que la table tirée. Une vente       │
    // │ encaissée hors ligne se listait donc et se déclarait inexistante    │
    // │ trois secondes plus tard. Le caissier tient le ticket dans une      │
    // │ main : il ne peut que conclure à une perte.                        │
    // │                                                                    │
    // │ La fiche rend ce qui EXISTE - le papier du client - et dit ce qui  │
    // │ manque. Afficher des sections d'articles et de règlements vides se  │
    // │ lirait comme une vente sans articles, ce qui est une autre         │
    // │ contrevérité.                                                      │
    // └────────────────────────────────────────────────────────────────────┘
    if (enFile) return <VenteEnFile vente={enFile} />;
    return (
      <Screen padded={false}>
        <AppBar title="Vente" />
        <EmptyState
          icon="Receipt"
          title="Vente introuvable"
          message="Cette vente n'est pas encore descendue sur ce terminal, ou elle a été supprimée."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const statut = STATUT_VENTE[vente.statut];
  const annulable = !["cancelled", "refunded"].includes(vente.statut);
  // ┌────────────────────────────────────────────────────────────────────┐
  // │ UNE FACTURE ENTIÈREMENT RENDUE N'A PLUS RIEN À RENDRE.             │
  // │                                                                    │
  // │ Le statut ne suffit pas : un retour approuvé ne fait pas passer la │
  // │ vente en `refunded` tant qu'il est partiel, et rien n'empêchait de │
  // │ rendre une seconde fois ce qui l'était déjà. Le bouton disparaît   │
  // │ donc quand chaque ligne est soldée, et la carte des retours dit    │
  // │ pourquoi - un bouton absent sans explication se lit comme un       │
  // │ droit manquant.                                                    │
  // └────────────────────────────────────────────────────────────────────┘
  const rendablesRestantes = vente.lignes.filter(
    (l) =>
      l.produitId !== null &&
      (!rendu || resteARendre(rendu, l.id, l.quantiteTotale) > 0)
  );
  // Un retour porte sur une facture ÉMISE : ni un brouillon (rien n'est parti),
  // ni une facture déjà annulée ou remboursée (il n'y a plus rien à rendre).
  const retournable =
    !["cancelled", "refunded", "draft"].includes(vente.statut) &&
    rendablesRestantes.length > 0;
  const encaissable = vente.statut === "pending" || vente.statut === "partially_paid";

  // Le restant dû tient compte de ce qui attend dans le journal, à devise
  // égale : sans cela, une facture réglée hors ligne continuerait d'appeler à
  // l'encaissement, et le caissier la réglerait deux fois.
  const enAttenteMemeDevise =
    attente?.totalParDevise.find((t) => t.devise === vente.devise)?.montant ?? 0;
  const resteReel = Math.max(0, vente.resteAPayer - enAttenteMemeDevise);

  /**
   * Le ticket reste réimprimable QUOI QU'IL ARRIVE.
   *
   * Le back-office faisait disparaître son bouton une fois `receipt_printed`
   * posé : un rouleau vide faisait alors perdre le reçu sans recours. Ici la
   * réimpression sort marquée DUPLICATA, sous le même numéro.
   */
  const imprimer = async () => {
    if (!vente || impression) return;
    setImpression(true);
    try {
      await imprimerTicketVente(vente, snapshot);
      toast.succes("Ticket envoyé à l'imprimante.");
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "Le ticket n'a pas pu être imprimé."
      );
    } finally {
      setImpression(false);
    }
  };

  const confirmerAnnulation = async () => {
    if (annulationEnCours) return;
    setAnnulationEnCours(true);
    try {
      await annulerVente(vente.id, "Annulée depuis le terminal");
      setDialogueAnnulation(false);
      toast.succes("Annulation mise en file. Elle partira à la prochaine synchronisation.");
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "L'annulation n'a pas pu être mise en file.");
    } finally {
      setAnnulationEnCours(false);
    }
  };

  const encaisser = encaissable && resteReel > 0 && can("sales.create");

  const barre = (
    <View className="gap-2">
      {/* LE RESTE DÛ EST DANS LA BARRE, pas seulement dans le récapitulatif
          quinze centimètres plus haut : c'est le montant qu'on annonce au
          client au moment d'encaisser, et il doit être sous les yeux quand on
          appuie. En orange, comme partout où le dépôt écrit un reste à payer. */}
      {encaisser ? (
        <View className="flex-row items-baseline justify-between gap-3">
          <Text variant="caption">Reste à payer</Text>
          <Text numeric variant="body" className="font-sans-semibold text-warning">
            {money.money(resteReel, vente.devise)}
          </Text>
        </View>
      ) : null}
      <View className="flex-row gap-2">
        {encaisser ? (
          <Button
            size="lg"
            leftIcon="Banknote"
            className="flex-1"
            onPress={() => setFeuilleReglement(true)}
          >
            Encaisser
          </Button>
        ) : null}
        {/* Le ticket se réimprime TOUJOURS - un rouleau vide ne doit pas faire
            perdre un reçu - donc ce bouton n'a pas de condition, et il prend
            toute la barre quand il n'y a plus rien à encaisser. */}
        <Button
          variant="outline"
          size="lg"
          leftIcon="Printer"
          className="flex-1"
          disabled={impression}
          onPress={() => void imprimer()}
        >
          {impression ? "Impression…" : vente.ticketImprime ? "Réimprimer" : "Imprimer"}
        </Button>
      </View>
    </View>
  );

  return (
    <Screen scroll padded={false} pied={barre}>
      <AppBar
        title={vente.reference}
        subtitle={formatDateTimeFr(vente.date ?? new Date())}
        right={statut ? <Badge tone={statut.ton}>{statut.label}</Badge> : undefined}
      />

      <View className="gap-4 p-4">
        <BandeauEnvoi
          envoi={attente?.annulationEnAttente}
          titre="Une annulation attend son envoi"
          consequence="La facture ne changera qu'une fois le serveur l'a acceptée."
        />

        {attente && attente.reglements.length > 0 ? (
          <Banner
            tone="info"
            title={
              attente.reglements.length > 1
                ? `${attente.reglements.length} règlements attendent leur envoi`
                : "Un règlement attend son envoi"
            }
            message={`${attente.totalParDevise
              .map((t) => money.money(t.montant, t.devise))
              .join(" · ")} déjà encaissés sur ce terminal. Le reçu est imprimé ; la facture ne sera mise à jour qu'après synchronisation.`}
            action={{
              label: enCoursSync ? "Synchronisation…" : "Synchroniser",
              loading: enCoursSync,
              onPress: () => void lancerSync("bandeau"),
            }}
          />
        ) : null}

        {/* ┌──────────────────────────────────────────────────────────────┐
            │ LES ACTIONS FRÉQUENTES EN BAS, LES RARES EN HAUT.            │
            │                                                              │
            │ Quatre boutons s'empilaient ici, en tête de page : ils        │
            │ repoussaient les articles et les règlements sous la ligne de │
            │ flottaison, et « Encaisser » - la seule raison d'ouvrir cette│
            │ fiche depuis « Règlements en attente » - remontait hors de   │
            │ portée du pouce dès qu'on descendait lire la facture.        │
            │                                                              │
            │ Encaisser et imprimer descendent donc dans une barre FIXE    │
            │ (`Screen pied`), toujours visible et dans le tiers bas de    │
            │ l'écran. Restent ici les deux gestes RARES et lourds de      │
            │ conséquence : annuler la vente, enregistrer un retour. Les   │
            │ éloigner du pouce n'est pas un oubli, c'est ce qu'on veut    │
            │ d'un geste qu'on ne fait pas deux fois par jour.             │
            └──────────────────────────────────────────────────────────────┘ */}
        {(annulable && can("sales.cancel")) ||
        (retournable && can("sale_returns.create")) ? (
          <View className="flex-row gap-2">
            {annulable && can("sales.cancel") ? (
              <Button
                variant="destructive"
                leftIcon="XCircle"
                className="flex-1"
                disabled={attente?.annulationEnAttente !== undefined}
                onPress={() => setDialogueAnnulation(true)}
              >
                Annuler la vente
              </Button>
            ) : null}
            {retournable && can("sale_returns.create") ? (
              <Button
                variant="outline"
                leftIcon="PackageX"
                className="flex-1"
                // Une FEUILLE, pas un écran : la facture reste derrière, et
                // c'est sur elle qu'on lit ce qui est rendu.
                onPress={() => setFeuilleRetour(true)}
              >
                {/* « Retour » tout court, sous une flèche de retour arrière et
                    à côté d'« Annuler », se lit comme « revenir » : le mot
                    doit dire la MARCHANDISE. */}
                Retour article
              </Button>
            ) : null}
          </View>
        ) : null}

        <Card>
          <CardHeader title="Informations" />
          <View>
            <Paire label="Référence" valeur={vente.reference} />
            <Paire label="Client" valeur={vente.client?.nom ?? "Client anonyme"} />
            {vente.client?.telephone ? (
              <Paire label="Téléphone" valeur={vente.client.telephone} />
            ) : null}
            <Paire label="Date de vente" valeur={formatDateTimeFr(vente.date ?? new Date())} />
            {vente.echeance ? (
              <Paire label="Échéance" valeur={formatDateTimeFr(vente.echeance)} />
            ) : null}
            {vente.caisse ? <Paire label="Caisse" valeur={vente.caisse} /> : null}
            {vente.entrepot ? <Paire label="Entrepôt" valeur={vente.entrepot} /> : null}
          </View>
          {vente.notes ? (
            <>
              <Divider />
              <View className="p-4">
                <Text variant="caption" className="mb-1">
                  Notes
                </Text>
                <Text variant="bodySmall">{vente.notes}</Text>
              </View>
            </>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Paiement" />
          <View>
            <Paire label="Sous-total" valeur={money.money(vente.sousTotal, vente.devise)} />
            {vente.taxes > 0 ? (
              <Paire label="Taxes" valeur={money.money(vente.taxes, vente.devise)} />
            ) : null}
            {vente.remiseCommerciale > 0 ? (
              <Paire
                label={
                  vente.remisePourcent > 0
                    ? `Remise (${vente.remisePourcent} %)`
                    : "Remise"
                }
                valeur={`-${money.money(vente.remiseCommerciale, vente.devise)}`}
                ton="primary"
              />
            ) : null}
            {vente.remiseFidelite > 0 ? (
              <Paire
                label="Remise fidélité"
                valeur={`-${money.money(vente.remiseFidelite, vente.devise)}`}
                ton="primary"
              />
            ) : null}
            <View className="my-2">
              <Divider />
            </View>
            <Paire label="Total" valeur={money.money(vente.total, vente.devise)} fort />
            <Paire
              label="Montant payé"
              valeur={money.money(vente.paye, vente.devise)}
              ton="success"
            />
            <Paire
              label="Reste à payer"
              valeur={money.money(vente.resteAPayer, vente.devise)}
              ton={vente.resteAPayer > 0 ? "destructive" : "muted"}
            />
            {vente.monnaieRendue > 0 ? (
              <Paire
                label="Monnaie rendue"
                valeur={money.money(vente.monnaieRendue, vente.devise)}
              />
            ) : null}
          </View>
        </Card>

        <Card>
          <CardHeader title={`Articles (${vente.lignes.length})`} />
          <View>
            {vente.lignes.length === 0 ? (
              <Text variant="caption">Aucun article.</Text>
            ) : (
              vente.lignes.map((l, i) => (
                <View key={l.id}>
                  {i > 0 ? <Divider /> : null}
                  <LigneArticle
                    ligne={l}
                    devise={vente.devise}
                    rendu={rendu?.parLigne.get(l.id) ?? 0}
                  />
                </View>
              ))
            )}
          </View>
        </Card>

        {/* ┌──────────────────────────────────────────────────────────────┐
            │ LA FACTURE NE DISAIT RIEN DE SES RETOURS.                    │
            │                                                              │
            │ Un retour approuvé fait revenir de la marchandise en stock   │
            │ et sortir de l'argent de la caisse, et il ne laissait aucune │
            │ trace ici : la fiche continuait d'annoncer une vente pleine, │
            │ et proposait d'en rendre le contenu une seconde fois. C'est  │
            │ la première chose à voir quand on relit une facture pour     │
            │ comprendre un écart.                                         │
            │                                                              │
            │ Les retours ENCORE EN FILE y sont, avec leur mention : ils   │
            │ comptent déjà dans ce qu'on ne peut plus rendre.             │
            └──────────────────────────────────────────────────────────────┘ */}
        {rendu && rendu.retours.length > 0 ? (
          <Card className="p-0">
            <View className="p-4 pb-0">
              <CardHeader
                title={`Retours (${rendu.retours.length})`}
                subtitle={
                  rendablesRestantes.length === 0
                    ? "Tout ce qui pouvait être rendu l'a été."
                    : "Touchez un retour pour voir sa décision."
                }
              />
            </View>
            {rendu.retours.map((r, i) => {
              const st = STATUT_RETOUR[r.statut];
              const envoiRetour = libelleEnvoi(r.envoi);
              return (
                <View key={r.id}>
                  {i > 0 ? <Divider /> : null}
                  <DataRow
                    principal={r.reference}
                    secondaire={r.date ? formatDateTimeFr(r.date) : null}
                    badge={
                      envoiRetour ? (
                        <Badge tone={envoiRetour.ton === "warning" ? "warning" : "neutral"}>
                          {envoiRetour.court}
                        </Badge>
                      ) : st ? (
                        <Badge tone={st.ton}>{st.label}</Badge>
                      ) : undefined
                    }
                    valeur={<Mesure value={money.money(r.montant, vente.devise)} />}
                    onPress={() => router.push(`/retour/${r.id}`)}
                  />
                </View>
              );
            })}
          </Card>
        ) : null}

        {vente.reglements.length > 0 ? (
          <Card>
            <CardHeader title="Règlements reçus" />
            <View>
              {vente.reglements.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <Divider /> : null}
                  <View className="flex-row items-center gap-3 py-3">
                    <Icon name="CreditCard" size={18} color="mutedForeground" />
                    <View className="min-w-0 flex-1">
                      <Text variant="bodySmall" className="font-sans-medium">
                        {p.methode}
                      </Text>
                      <Text variant="caption" numberOfLines={1}>
                        {[
                          p.numeroRecu,
                          p.date ? formatDateTimeFr(p.date) : null,
                          p.reference,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <View className="shrink-0 items-end">
                      <Text numeric variant="bodySmall" className="text-success font-sans-medium">
                        {money.money(p.montant, vente.devise)}
                      </Text>
                      {/* Le montant REMIS n'apparaît que s'il est dans une autre
                          devise : « 28 000 CDF remis » sous « 28 000 CDF » est
                          du bruit. */}
                      {p.remis != null && p.deviseRemise ? (
                        <Text numeric variant="caption">
                          {`remis ${money.money(p.remis, p.deviseRemise)}`}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}
      </View>

      <FeuilleReglement
        ouvert={feuilleReglement}
        onFermer={() => setFeuilleReglement(false)}
        vente={vente}
        resteReel={resteReel}
        deviceCode={snapshot?.device?.device_code ?? null}
      />

      {/* Rendue CONDITIONNELLEMENT : chaque ouverture est un montage, donc un
          formulaire vierge, sans effet de remise à zéro à tenir en phase avec
          les champs. Même motif que la feuille de devis. */}
      {feuilleRetour ? (
        <FeuilleRetour
          vente={vente}
          onFermer={() => setFeuilleRetour(false)}
          onCree={(retourId) => {
            setFeuilleRetour(false);
            // On mène à la FICHE du retour, pas à la liste : le geste suivant
            // est de l'approuver, et il se fait là.
            router.push(`/retour/${retourId}`);
          }}
        />
      ) : null}

      <AlertDialog
        ouvert={dialogueAnnulation}
        titre="Annuler cette vente ?"
        message={`${vente.reference} sera annulée : le stock est rendu, les points retirés et la dette effacée. Cette opération ne se défait pas.`}
        confirmer="Annuler la vente"
        annuler="Revenir"
        destructif
        enCours={annulationEnCours}
        onConfirmer={confirmerAnnulation}
        onAnnuler={() => setDialogueAnnulation(false)}
      />
    </Screen>
  );
}

/**
 * La fiche d'une vente qui n'est pas encore arrivée au serveur.
 *
 * Elle ne montre QUE ce dont elle est sûre : le ticket rangé au comptoir, dans
 * les valeurs exactes que le client a sur son papier. Les lignes et les
 * règlements vivent dans le corps de l'opération, qui n'est pas une table
 * lisible ; les inventer ou les laisser vides serait pire que les taire.
 *
 * Le ticket, lui, se réimprime : c'est le geste qu'on vient chercher ici quand
 * un rouleau s'est vidé, et il ne demande aucun réseau. Le numéro ne change
 * pas, la copie porte la pastille DUPLICATA.
 */
function VenteEnFile({ vente }: { vente: VenteEnAttente }) {
  const money = useMonnaie();
  const toast = useToast();
  const [impression, setImpression] = useState(false);

  const reimprimer = async () => {
    setImpression(true);
    try {
      const doc = await documentParNumero(vente.reference);
      if (!doc) {
        // Sans document rangé, il n'y a rien à réimprimer et rien à
        // reconstruire : le corps de l'opération ne porte pas les totaux.
        toast.erreur("Le ticket de cette vente est introuvable sur ce terminal.");
        return;
      }
      await imprimerDocument(doc.id);
      toast.succes("Duplicata imprimé");
    } catch {
      toast.erreur("Impression impossible");
    } finally {
      setImpression(false);
    }
  };

  return (
    <Screen scroll>
      <AppBar title={vente.reference} />
      <BandeauEnvoi
        envoi={vente.envoi}
        titre="Cette vente attend son envoi"
        consequence="Elle n'existe encore que sur ce terminal."
      />

      <Card>
        <CardHeader title="Ce que porte le ticket" />
        <Paire label="Client" valeur={vente.client ?? "Client anonyme"} />
        <Paire label="Encaissée le" valeur={formatDateTimeFr(vente.date)} />
        {vente.nbArticles !== null ? (
          <Paire
            label="Articles"
            valeur={`${vente.nbArticles} ${vente.nbArticles > 1 ? "lignes" : "ligne"}`}
          />
        ) : null}
        <Divider />
        {/* « Montant inconnu » et JAMAIS zéro : sans le ticket rangé, on ne
            sait pas ce que le client a payé, et un zéro se lirait comme une
            vente offerte. */}
        <Paire
          label="Total"
          fort
          valeur={
            vente.total !== null && vente.devise
              ? money.money(vente.total, vente.devise)
              : "Montant inconnu"
          }
        />
        {vente.resteAPayer > 0 && vente.devise ? (
          <Paire
            label="Reste à payer"
            ton="destructive"
            valeur={money.money(vente.resteAPayer, vente.devise)}
          />
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Ce qui manque encore" />
        <View className="gap-2 py-2">
          <Text variant="caption">
            Le détail des articles et des règlements descendra du serveur une fois
            cette vente envoyée. Le numéro et les montants, eux, sont définitifs :
            ce sont ceux du papier remis au client.
          </Text>
        </View>
      </Card>

      <Button
        variant="outline"
        leftIcon="Printer"
        onPress={reimprimer}
        loading={impression}
      >
        Réimprimer le ticket
      </Button>
    </Screen>
  );
}
