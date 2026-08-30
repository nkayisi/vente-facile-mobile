/**
 * Fiche client. Miroir de `app/dashboard/contacts/customers/[id]/page.tsx`,
 * plus les deux actes que le back-office n'a jamais câblés.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SOLDE EST VENTILÉ PAR DEVISE, et c'est la seule vérité.               │
 * │                                                                          │
 * │ `current_balance` n'est qu'un cumul converti en devise principale : il    │
 * │ sert au plafond de crédit et au tri, jamais à un règlement. Comparer un   │
 * │ montant converti à l'`amount_due` d'une facture est le défaut qui faisait │
 * │ refuser un règlement de 50 USD sur une facture de 50 USD.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Trois libellés, trois situations, jamais un zéro ambigu.** « Dette »,
 * « Avance », « À jour » : un client sans ligne de solde n'a rien à devoir, et
 * le dire vaut mieux qu'afficher « 0 » qui pourrait passer pour une donnée
 * manquante.
 *
 * **`allow_credit` et `credit_limit` sont DEUX réglages distincts.** Une limite
 * à 0 signifie « sans plafond », jamais « crédit refusé ». Les confondre est
 * une erreur que le back-office a documentée dans sa propre modale.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateFr, formatPoints } from "@vente-facile/core";

import { detailClient, type MouvementCompte } from "@/data/contact-detail";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { STATUT_VENTE } from "@/data/ventes";
import { enAttenteSurClient } from "@/features/clients/actes";
import { useSession } from "@/session/provider";
import {
  AppBar,
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  Icon,
  ListItem,
  MultiCurrencyTotal,
  Screen,
  Spinner,
  StatValue,
  Text,
} from "@/ui";

import { FeuilleAjustement } from "@/features/clients/feuille-ajustement";
import { FeuilleEncaissement } from "@/features/clients/feuille-encaissement";

const TABLES = [
  "customers",
  "customer_balances",
  "customer_transactions",
  "customer_loyalty",
  "loyalty_programs",
  "sales",
];
const JOURNAL = ["outbox_operations"];

function LigneMouvement({ m }: { m: MouvementCompte }) {
  const money = useMonnaie();
  return (
    <View className="flex-row items-center gap-3 py-3">
      <View
        className={`h-9 w-9 items-center justify-center rounded-lg ${
          m.augmente ? "bg-destructive/10" : "bg-success/10"
        }`}
      >
        <Icon
          name={m.augmente ? "ArrowUpRight" : "ArrowDownRight"}
          size={16}
          color={m.augmente ? "destructive" : "success"}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="bodySmall" className="font-sans-medium">
          {m.typeLabel}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {[m.numeroRecu, m.date ? formatDateFr(m.date) : null, m.notes || null]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <View className="shrink-0 items-end">
        <Text
          variant="bodySmall"
          numeric
          className={`font-sans-medium ${
            m.augmente ? "text-destructive" : "text-success"
          }`}
        >
          {`${m.augmente ? "+" : "-"}${money.money(Math.abs(m.montant), m.devise)}`}
        </Text>
        <Text numeric variant="caption">
          {`solde ${money.money(m.soldeApres, m.devise)}`}
        </Text>
      </View>
    </View>
  );
}

export default function FicheClient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMonnaie();
  const { can, snapshot } = useSession();

  // Le plafond et le crédit disponible sont des cumuls CONVERTIS, exprimés
  // dans la devise principale de l'établissement : ils viennent de
  // `current_balance`, pas de `customer_balances`. La nommer explicitement
  // évite de les afficher dans une devise que personne n'a choisie.
  const devisePrincipale =
    snapshot?.currencies?.find((d) => d.is_primary)?.currency_code ?? "CDF";

  const [feuilleEncaissement, setFeuilleEncaissement] = useState(false);
  const [feuilleAjustement, setFeuilleAjustement] = useState(false);

  const charger = useCallback(() => detailClient(id), [id]);
  const { donnees: c, chargement } = useLecture(charger, { tables: TABLES, deps: [id] });
  const chargerAttente = useCallback(() => enAttenteSurClient(id), [id]);
  const { donnees: attente } = useLecture(chargerAttente, { tables: JOURNAL, deps: [id] });

  if (chargement && !c) {
    return (
      <Screen>
        <AppBar title="Client" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!c) {
    return (
      <Screen padded={false}>
        <AppBar title="Client" />
        <EmptyState
          icon="Users"
          title="Client introuvable"
          message="Il n'est pas encore descendu sur ce terminal, ou il a été supprimé."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const aUneDette = c.dettes.length > 0;
  const aUneAvance = c.avances.length > 0;
  const peutEcrire = can("customers.edit");

  return (
    <Screen scroll padded={false}>
      <AppBar
        title={c.nom}
        subtitle={[c.code, c.type === "business" ? "Entreprise" : "Particulier"]
          .filter(Boolean)
          .join(" · ")}
        right={c.actif ? undefined : <Badge tone="neutral">Inactif</Badge>}
      />

      <View className="gap-4 p-4">
        {attente?.creationEnAttente ? (
          <Banner
            tone="info"
            title="Client pas encore synchronisé"
            message="Il a été créé sur ce terminal et attend d'être envoyé. Vous pouvez déjà lui vendre et l'encaisser."
          />
        ) : null}

        {attente && attente.encaissements.length > 0 ? (
          <Banner
            tone="info"
            title={
              attente.encaissements.length > 1
                ? `${attente.encaissements.length} encaissements en attente d'envoi`
                : "Un encaissement en attente d'envoi"
            }
            message="Les reçus sont imprimés. Le solde ci-dessous ne les prendra en compte qu'après synchronisation."
          />
        ) : null}

        {/*
          La situation du compte.

          DETTE ET AVANCE PEUVENT COEXISTER CHEZ LE MÊME CLIENT, et il faut
          alors montrer LES DEUX. Vérifié à l'écran : Nelly Kayisi doit
          10 157,86 $ et a versé 46 000 FC d'avance. Une carte qui ne rendait
          que la dette taisait la moitié de sa situation, et le marchand ne
          pouvait pas savoir qu'il détenait déjà de l'argent à lui.

          C'est le corollaire direct de « le solde est ventilé par devise » :
          la ventilation crée des signes opposés, et n'en montrer qu'un revient
          à sommer en cachette.
        */}
        <Card>
          {aUneDette ? (
            <>
              <Text variant="caption" className="mb-1">
                Dette du client
              </Text>
              <MultiCurrencyTotal lignes={c.dettes} money={money.money} tone="destructive" />
            </>
          ) : null}

          {aUneAvance ? (
            <View className={aUneDette ? "mt-3" : undefined}>
              <Text variant="caption" className="mb-1">
                Avance du client
              </Text>
              <MultiCurrencyTotal lignes={c.avances} money={money.money} tone="chart2" />
            </View>
          ) : null}

          {!aUneDette && !aUneAvance ? (
            <>
              <Text variant="caption" className="mb-1">
                Situation
              </Text>
              <StatValue value="Aucune dette" tone="success" />
            </>
          ) : null}

          <View className="mt-3 flex-row flex-wrap gap-x-6 gap-y-2">
            <View>
              <Text variant="caption">Achats à crédit</Text>
              <Text variant="bodySmall" className="font-sans-medium">
                {c.creditAutorise ? "Autorisés" : "Refusés"}
              </Text>
            </View>
            <View>
              <Text variant="caption">Plafond</Text>
              {/* Zéro veut dire « sans plafond », et l'écran l'écrit en toutes
                  lettres : afficher « 0 » laisserait lire « aucun crédit ». */}
              <Text variant="bodySmall" className="font-sans-medium">
                {c.plafondCredit > 0
                  ? money.money(c.plafondCredit, devisePrincipale)
                  : "Sans plafond"}
              </Text>
            </View>
            {c.creditDisponible != null ? (
              <View>
                <Text variant="caption">Encore disponible</Text>
                <Text variant="bodySmall" className="font-sans-medium">
                  {money.money(c.creditDisponible, devisePrincipale)}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>

        {peutEcrire ? (
          <View className="gap-2">
            <Button
              fullWidth
              size="lg"
              leftIcon="Banknote"
              onPress={() => setFeuilleEncaissement(true)}
            >
              Encaisser du client
            </Button>
            <Button
              variant="outline"
              fullWidth
              leftIcon="SlidersHorizontal"
              onPress={() => setFeuilleAjustement(true)}
            >
              Ajuster le solde
            </Button>
          </View>
        ) : null}

        {c.programmeActif && c.points != null ? (
          <Card>
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text variant="caption">Points de fidélité</Text>
                <StatValue value={`${formatPoints(c.points)} pts`} tone="primary" />
              </View>
              <View className="shrink-0 items-end">
                <Text variant="caption">{`Gagnés ${formatPoints(c.pointsGagnes)}`}</Text>
                <Text variant="caption">{`Utilisés ${formatPoints(c.pointsUtilises)}`}</Text>
              </View>
            </View>
          </Card>
        ) : null}

        {c.facturesOuvertes.length > 0 ? (
          <Card className="p-0">
            <View className="p-4 pb-0">
              <CardHeader title={`Factures ouvertes (${c.facturesOuvertes.length})`} />
            </View>
            {c.facturesOuvertes.map((f, i) => (
              <View key={f.id}>
                {i > 0 ? <Divider /> : null}
                <ListItem
                  title={f.reference}
                  subtitle={[
                    f.date ? formatDateFr(f.date) : null,
                    f.enRetard ? "En retard" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  value={money.money(f.resteAPayer, f.devise)}
                  valueTone={f.enRetard ? "destructive" : "default"}
                  icon="Receipt"
                  chevron
                  onPress={() => router.push(`/vente/${f.id}`)}
                />
              </View>
            ))}
          </Card>
        ) : null}

        <Card className="p-0">
          <View className="p-4 pb-0">
            <CardHeader title="Coordonnées" />
          </View>
          {c.raisonSociale ? (
            <ListItem title="Raison sociale" subtitle={c.raisonSociale} icon="Building2" />
          ) : null}
          {c.telephone ? (
            <ListItem title="Téléphone" subtitle={c.telephone} icon="Phone" />
          ) : null}
          {c.email ? <ListItem title="E-mail" subtitle={c.email} icon="Mail" /> : null}
          {c.adresse ? <ListItem title="Adresse" subtitle={c.adresse} icon="MapPin" /> : null}
          {c.numeroImpot ? (
            <ListItem title="Numéro d'impôt" subtitle={c.numeroImpot} icon="FileText" />
          ) : null}
          {c.notes ? (
            <View className="px-4 pb-4 pt-1">
              <Text variant="caption" className="mb-1">
                Notes
              </Text>
              <Text variant="bodySmall">{c.notes}</Text>
            </View>
          ) : null}
        </Card>

        {c.dernieresVentes.length > 0 ? (
          <Card className="p-0">
            <View className="p-4 pb-0">
              <CardHeader title="Dernières ventes" />
            </View>
            {c.dernieresVentes.map((v, i) => {
              const s = STATUT_VENTE[v.statut];
              return (
                <View key={v.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListItem
                    title={v.reference}
                    subtitle={[v.date ? formatDateFr(v.date) : null, s?.label]
                      .filter(Boolean)
                      .join(" · ")}
                    value={money.money(v.total, v.devise)}
                    icon="Receipt"
                    chevron
                    onPress={() => router.push(`/vente/${v.id}`)}
                  />
                </View>
              );
            })}
          </Card>
        ) : null}

        {c.mouvements.length > 0 ? (
          <Card>
            <CardHeader title="Historique des mouvements" />
            <View>
              {c.mouvements.map((m, i) => (
                <View key={m.id}>
                  {i > 0 ? <Divider /> : null}
                  <LigneMouvement m={m} />
                </View>
              ))}
            </View>
          </Card>
        ) : null}
      </View>

      <FeuilleEncaissement
        ouvert={feuilleEncaissement}
        onFermer={() => setFeuilleEncaissement(false)}
        client={c}
        deviceCode={snapshot?.device?.device_code ?? null}
      />
      <FeuilleAjustement
        ouvert={feuilleAjustement}
        onFermer={() => setFeuilleAjustement(false)}
        client={c}
        deviceCode={snapshot?.device?.device_code ?? null}
      />
    </Screen>
  );
}
