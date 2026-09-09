/**
 * Détail d'un retour, et sa décision.
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
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA DÉCISION VIT DANS UNE BARRE FIXE, PAS AU MILIEU DE LA PAGE.          │
 * │                                                                          │
 * │ Les deux boutons étaient posés entre la carte des montants et celle des  │
 * │ articles : ils défilaient hors de l'écran au moment précis où l'on       │
 * │ descend LIRE ce qu'on approuve. Le gérant regardait la liste des         │
 * │ articles, puis devait remonter pour décider - et décider, ici, engage    │
 * │ du stock et de la caisse.                                                │
 * │                                                                          │
 * │ Ils descendent dans le `pied` de `Screen`, avec au-dessus d'eux le       │
 * │ montant que la décision engage : c'est le chiffre qu'on annonce au       │
 * │ client, il doit être sous les yeux quand on appuie. Même grammaire que   │
 * │ la fiche de vente, qui porte son reste dû au-dessus d'« Encaisser ».     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « REJETER » N'EST PAS L'ACTION DESTRUCTRICE, ET LE ROUGE MENTAIT.       │
 * │                                                                          │
 * │ Rejeter ne bouge NI le stock NI la caisse : c'est le refus d'un          │
 * │ changement, l'état le plus prudent des deux. C'est APPROUVER qui fait    │
 * │ revenir de la marchandise en rayon et sortir de l'argent du tiroir, et   │
 * │ qui ne se défait pas. Peindre le refus en rouge et l'engagement en       │
 * │ orange dit exactement l'inverse du risque ; à force, le rouge ne veut    │
 * │ plus rien dire là où il compte. Le poids de l'acte est porté par le      │
 * │ dialogue de confirmation, qui nomme ses conséquences.                    │
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
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import {
  AlertDialog, AppBar, Badge, Banner, Button, Card, CardHeader, Divider,
  EmptyState, Icon, Mesure, Screen, Skeleton, StatStrip, StatStripItem, Text,
  useToast,
} from "@/ui";

const TABLES = ["sale_returns", "sale_return_items", "sales", "sale_items", "products", "customers", "users"];

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
      client: null,
      clientId: null,
      statut: "draft",
      montant: attente.montant,
      rembourse: attente.montant,
      devise: money.primaryCode,
      motif: attente.motif,
      date: attente.date,
      creePar: null,
      approuvePar: null,
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
    // `primaryCode` n'est qu'un repli d'affichage pour une vente qui n'est
    // pas descendue : il ne déclenche aucune relecture, `useLecture` ne
    // dépendant que de l'identifiant.
  }, [id, money.primaryCode]);
  const { donnees: r, chargement, recharger } = useLecture(charger, {
    tables: [...TABLES, "outbox_operations"],
    deps: [id],
  });
  const { donnees: attente } = useLecture(enAttenteRetoursDevis, {
    tables: ["outbox_operations"],
  });

  if (chargement && !r) {
    return (
      <Screen scroll padded={false}>
        <AppBar title="Retour" />
        {/* Un squelette à la FORME de la fiche : un tourniquet centré ne dit
            pas ce qui arrive, et l'écran se réorganise ensuite sous les yeux. */}
        <View className="gap-4 p-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
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
          action={{ label: "Revenir", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const s = STATUT_RETOUR[r.statut];
  // La devise de la facture d'origine. Vide quand la vente n'est pas descendue
  // sur ce terminal : on se replie sur la principale plutôt que d'écrire un
  // montant SANS SYMBOLE, qui ne dirait pas dans quoi le client est remboursé.
  const devise = r.devise || money.primaryCode;
  const envoiEnFile = attente?.retours.get(r.id);
  const envoiCreation = attente?.creations.get(r.id);
  const enFile = envoiEnFile !== undefined;
  const aCreer = envoiCreation !== undefined;
  const decidable = r.statut === "draft" && can("sale_returns.approve") && !enFile;

  // Ce que la décision engage, dit avant qu'on appuie. Sur un brouillon, le
  // serveur n'a encore rien arrêté : `refund_amount` vaut le montant rendu, et
  // l'imputation sur la dette se fera À l'approbation.
  const remisEnRayon = r.lignes.filter((l) => l.remisEnStock).length;

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
    <Screen
      scroll
      padded={false}
      onRefresh={recharger}
      refreshing={chargement && r !== null}
      pied={
        decidable ? (
          <View className="gap-2.5">
            {/* Le MONTANT au-dessus des boutons : c'est ce qu'on annonce au
                client au moment de décider, il ne doit pas être quinze
                centimètres plus haut. */}
            <View className="flex-row items-baseline justify-between gap-3">
              <Text variant="bodySmall" className="text-muted-foreground">
                Marchandise rendue
              </Text>
              <Mesure value={money.money(r.montant, devise)} />
            </View>
            <View className="flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1"
                leftIcon="XCircle"
                onPress={() => setConfirmation("reject")}
              >
                Rejeter
              </Button>
              <Button
                className="flex-1"
                leftIcon="Check"
                onPress={() => setConfirmation("approve")}
              >
                Approuver
              </Button>
            </View>
          </View>
        ) : undefined
      }
    >
      <AppBar
        title={r.reference}
        subtitle={r.venteReference ? `Sur ${r.venteReference}` : undefined}
        right={s ? <Badge tone={s.ton}>{s.label}</Badge> : undefined}
      />

      <View className="gap-4 p-4">
        {aCreer ? (
          <BandeauEnvoi
            envoi={envoiCreation}
            titre="Ce retour attend son envoi"
            consequence="Il n'existe encore que sur ce terminal ; sa référence définitive et son approbation viendront après."
          />
        ) : (
          <BandeauEnvoi
            envoi={envoiEnFile}
            titre="Une décision attend son envoi"
            consequence="Le statut ne changera qu'après."
          />
        )}

        {/* CE QUI EST DÉJÀ ARRIVÉ, dit une fois pour toutes en tête : sans
            cela, un retour approuvé ressemble à un retour en attente auquel
            manqueraient ses boutons. */}
        {r.statut === "approved" ? (
          <Banner
            tone="success"
            title="Retour approuvé"
            message={[
              r.approuveLe ? `Le ${formatDateTimeFr(r.approuveLe)}` : null,
              r.approuvePar ? `par ${r.approuvePar}` : null,
            ]
              .filter(Boolean)
              .join(" ")
              .concat(
                remisEnRayon > 0
                  ? `. ${remisEnRayon} article${remisEnRayon > 1 ? "s sont revenus" : " est revenu"} en stock.`
                  : ". Aucun article n'est revenu en stock."
              )}
          />
        ) : r.statut === "rejected" ? (
          <Banner
            tone="info"
            title="Retour rejeté"
            message="Ni le stock ni la caisse n'ont bougé. La marchandise reste au nom du client sur sa facture."
          />
        ) : null}

        {/* LE CADRAN : deux lectures, et deux seulement. Ce qui est rendu, et
            ce qui sort de la caisse. Deux `StatValue` empilés dans une même
            carte donnaient deux titres de même poids sans dire lequel
            répondait à quoi. */}
        <StatStrip>
          <StatStripItem
            label="Marchandise rendue"
            icon="PackageX"
            value={money.money(r.montant, devise)}
          />
          <StatStripItem
            label={r.statut === "approved" ? "Remboursé en espèces" : "À rembourser"}
            icon="Banknote"
            // Le remboursement n'est pas une alerte : c'est le montant normal
            // d'un retour. Il ne se colore que s'il diffère de la marchandise
            // rendue, là où il y a quelque chose à comprendre.
            tone={r.rembourse !== r.montant ? "warn" : "neutral"}
            value={money.money(r.rembourse, devise)}
          />
        </StatStrip>

        {r.rembourse !== r.montant ? (
          // La différence a éteint de la dette : c'est la règle de l'ordre
          // d'imputation, et la dire évite de croire à une erreur de calcul.
          <Text variant="caption" className="-mt-2">
            {`La différence, ${money.money(r.montant - r.rembourse, devise)}, a éteint la dette du client sur cette facture : elle n'est pas sortie de la caisse.`}
          </Text>
        ) : null}

        <Card className="p-0">
          <View className="p-4 pb-0">
            <CardHeader
              title={`Articles rendus (${r.lignes.length})`}
              subtitle={
                remisEnRayon === r.lignes.length
                  ? "Tous reviennent en stock."
                  : remisEnRayon === 0
                    ? "Aucun ne revient en stock."
                    : `${remisEnRayon} sur ${r.lignes.length} reviennent en stock.`
              }
            />
          </View>
          {r.lignes.map((l, i) => (
            <View key={l.id}>
              {i > 0 ? <Divider /> : null}
              <View className="flex-row items-start justify-between gap-3 px-4 py-3">
                <View className="min-w-0 flex-1">
                  <Text variant="bodySmall" className="font-sans-medium">
                    {l.produit}
                  </Text>
                  <Text variant="caption">
                    {`${l.quantite} × ${money.money(l.prixUnitaire, devise)}`}
                  </Text>
                  {/* ┌──────────────────────────────────────────────────────┐
                      │ « NON REMIS EN STOCK » ÉTAIT UNE INCISE DE LÉGENDE.  │
                      │                                                      │
                      │ Il se lisait « 2 × 12 500 $  ·  non remis en stock », │
                      │ à la même graisse et à la même couleur que la        │
                      │ quantité. C'est pourtant la seule ligne qui décide   │
                      │ si de la marchandise revient en rayon ou part à la   │
                      │ casse : elle a droit à sa pastille.                  │
                      └──────────────────────────────────────────────────────┘ */}
                  {!l.remisEnStock ? (
                    <View className="mt-1.5 flex-row">
                      <Badge tone="warning">Ne revient pas en stock</Badge>
                    </View>
                  ) : null}
                </View>
                <Mesure value={money.money(l.total, devise)} />
              </View>
            </View>
          ))}
        </Card>

        <Card>
          <CardHeader title="Informations" />
          <View>
            {r.client ? <Paire label="Client" valeur={r.client} /> : null}
            <Paire
              label="Enregistré le"
              valeur={r.date ? formatDateTimeFr(r.date) : "—"}
            />
            {r.creePar ? <Paire label="Par" valeur={r.creePar} /> : null}
            {r.approuveLe ? (
              <Paire
                label={r.statut === "rejected" ? "Décidé le" : "Approuvé le"}
                valeur={formatDateTimeFr(r.approuveLe)}
              />
            ) : null}
            {r.approuvePar ? <Paire label="Décidé par" valeur={r.approuvePar} /> : null}
          </View>

          {r.motif ? (
            <View className="mt-3">
              <Text variant="caption" className="mb-1">
                Motif du retour
              </Text>
              <Text variant="bodySmall">{r.motif}</Text>
            </View>
          ) : null}

          {r.venteId ? (
            <View className="mt-4">
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

        {/* La raison pour laquelle il n'y a PAS de boutons, quand il n'y en a
            pas : un écran qui se tait laisse chercher où l'on approuve. */}
        {!decidable && r.statut === "draft" ? (
          <View className="flex-row items-start gap-2 px-1">
            <Icon name="Info" size={16} color="mutedForeground" />
            <Text variant="caption" className="min-w-0 flex-1">
              {enFile || aCreer
                ? "La décision sera possible une fois ce retour arrivé au serveur."
                : "Approuver ou rejeter un retour demande une permission que votre compte n'a pas. Demandez-le au gérant."}
            </Text>
          </View>
        ) : null}
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
        // Le poids est sur l'ACTE IRRÉVERSIBLE, pas sur le refus : approuver
        // fait revenir de la marchandise et sortir de l'argent, rejeter ne
        // touche à rien.
        destructif={confirmation === "approve"}
        enCours={envoi}
        onConfirmer={() => confirmation && void executer(confirmation)}
        onAnnuler={() => setConfirmation(null)}
      />
    </Screen>
  );
}
