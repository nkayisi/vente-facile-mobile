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
import { formatDateFr } from "@vente-facile/core";

import { detailClient } from "@/data/contact-detail";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { STATUT_VENTE } from "@/data/ventes";
import { enAttenteSurClient } from "@/features/clients/actes";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSynchronisation } from "@/features/sync/provider";
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

export default function FicheClient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMonnaie();
  const { can, snapshot } = useSession();
  const { enCours: enCoursSync, lancer: lancerSync } = useSynchronisation();

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
        <BandeauEnvoi
          envoi={attente?.creationEnAttente}
          titre="Ce client attend son envoi"
          consequence="Il n'existe encore que sur ce terminal ; vous pouvez déjà lui vendre et l'encaisser."
        />

        {attente && attente.encaissements.length > 0 ? (
          <Banner
            tone="info"
            title={
              attente.encaissements.length > 1
                ? `${attente.encaissements.length} encaissements attendent leur envoi`
                : "Un encaissement attend son envoi"
            }
            message="Les reçus sont imprimés. Le solde ci-dessous ne les prendra en compte qu'après synchronisation."
            action={{
              label: enCoursSync ? "Synchronisation…" : "Synchroniser",
              loading: enCoursSync,
              onPress: () => void lancerSync("bandeau"),
            }}
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

        {/* ⚠ LA CAGNOTTE EST DE L'ARGENT, en devise PRINCIPALE. Elle s'affichait
        en points, et personne ne savait ce qu'un point valait. */}
        {c.programmeActif && c.cagnotte != null ? (
          <Card>
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text variant="caption">Cagnotte de fidélité</Text>
                <StatValue
                  value={money.money(c.cagnotte, devisePrincipale)}
                  tone="primary"
                />
              </View>
              <View className="shrink-0 items-end">
                <Text variant="caption">
                  {`Gagnée ${money.money(c.cagnotteGagnee, devisePrincipale)}`}
                </Text>
                <Text variant="caption">
                  {`Utilisée ${money.money(c.cagnotteUtilisee, devisePrincipale)}`}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* ┌──────────────────────────────────────────────────────────────┐
            │ LES TROIS LECTURES DU PASSÉ VIVENT DANS UNE SOUS-PAGE.       │
            │                                                              │
            │ Le grand livre, le registre de cagnotte et le rapport par    │
            │ période occupaient trois sections de plus sous une fiche qui │
            │ en portait déjà sept. Ce qu'on vient y chercher devant un    │
            │ client - ce qu'il doit, et peut-il repartir à crédit - s'y   │
            │ perdait. On les consulte rarement, et longuement.            │
            └──────────────────────────────────────────────────────────────┘ */}
        <Card className="p-0">
          <ListItem
            title="Historique"
            subtitle="Mouvements du compte, cagnotte et rapport"
            // ⚠ `Clock` ET NON `History`, le glyphe du back-office : le
            //   générateur du registre le REFUSE, « history » étant absent du
            //   paquet lucide mobile. Déclarer la divergence sans avoir
            //   comparé les deux tracés est ce que son message interdit.
            icon="Clock"
            chevron
            onPress={() => router.push(`/client/${id}/historique`)}
          />
        </Card>

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
