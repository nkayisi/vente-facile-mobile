/**
 * Fiche fournisseur, en LECTURE seule.
 * Miroir de `app/dashboard/contacts/suppliers/[id]/page.tsx`.
 *
 * Rien n'est modifiable, et ce n'est pas un manque : les achats (commandes,
 * réceptions, règlements, retours) ont un backend complet et AUCUN écran, ni
 * web ni mobile. C'est le lot conditionnel 13. Une fiche qui offrirait de
 * modifier un fournisseur sans qu'aucun achat n'existe donnerait le sentiment
 * d'un module inachevé plutôt que d'un module à venir : l'écran le dit.
 */
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { detailFournisseur } from "@/data/contact-detail";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import {
  AppBar,
  Badge,
  Banner,
  Card,
  CardHeader,
  EmptyState,
  ListItem,
  Screen,
  Spinner,
  StatValue,
  Text,
} from "@/ui";

const TABLES = ["suppliers"];

export default function FicheFournisseur() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMonnaie();
  const { donnees: f, chargement } = useLecture(() => detailFournisseur(id), {
    tables: TABLES,
    deps: [id],
  });

  if (chargement && !f) {
    return (
      <Screen>
        <AppBar title="Fournisseur" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!f) {
    return (
      <Screen padded={false}>
        <AppBar title="Fournisseur" />
        <EmptyState
          icon="Truck"
          title="Fournisseur introuvable"
          message="Il n'est pas encore descendu sur ce terminal, ou il a été supprimé."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false}>
      <AppBar
        title={f.nom}
        subtitle={f.code ?? undefined}
        right={f.actif ? undefined : <Badge tone="neutral">Inactif</Badge>}
      />

      <View className="gap-4 p-4">
        {f.solde !== 0 ? (
          <Card>
            <Text variant="caption" className="mb-1">
              {f.solde > 0 ? "Dû au fournisseur" : "Avance versée"}
            </Text>
            <StatValue
              value={money.money(Math.abs(f.solde), f.devise)}
              tone={f.solde > 0 ? "destructive" : "chart2"}
            />
          </Card>
        ) : null}

        <Card className="p-0">
          <View className="p-4 pb-0">
            <CardHeader title="Coordonnées" />
          </View>
          {f.raisonSociale ? (
            <ListItem title="Raison sociale" subtitle={f.raisonSociale} icon="Building2" />
          ) : null}
          {f.contact ? (
            <ListItem title="Personne de contact" subtitle={f.contact} icon="User" />
          ) : null}
          {f.telephone ? (
            <ListItem title="Téléphone" subtitle={f.telephone} icon="Phone" />
          ) : null}
          {f.email ? <ListItem title="E-mail" subtitle={f.email} icon="Mail" /> : null}
          {f.adresse ? <ListItem title="Adresse" subtitle={f.adresse} icon="MapPin" /> : null}
          {f.numeroImpot ? (
            <ListItem title="Numéro d'impôt" subtitle={f.numeroImpot} icon="FileText" />
          ) : null}
          {f.devise ? <ListItem title="Devise" subtitle={f.devise} icon="Coins" /> : null}
          {f.banque || f.compteBancaire ? (
            <ListItem
              title="Banque"
              subtitle={[f.banque, f.compteBancaire].filter(Boolean).join(" · ")}
              icon="Wallet"
            />
          ) : null}
        </Card>

        <Banner
          tone="info"
          title="Les achats n'ont encore aucun écran"
          message="Commandes, réceptions, règlements et retours fournisseurs existent côté serveur, mais ni le back-office ni le terminal ne les affichent aujourd'hui."
        />
      </View>
    </Screen>
  );
}
