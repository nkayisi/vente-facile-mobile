/**
 * Clients & Fournisseurs. Miroir de `app/dashboard/contacts/page.tsx`.
 *
 * Le back-office a un concentrateur puis deux pages. Sur un téléphone, deux
 * listes de même nature derrière un segment valent mieux qu'une navigation
 * imbriquée : on passe de l'une à l'autre d'un geste au lieu de deux allers.
 * Le CONTENU reste celui du web - relevés, puis la liste.
 *
 * **Le solde d'un client est ventilé par devise.** Le back-office masque cette
 * colonne en rendu étroit (`hidden sm:block`) ; c'est précisément l'information
 * qu'un commerçant cherche, et on la garde en la rendant lisible : le montant à
 * droite, avec son qualificatif dessous.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { formatPrice } from "@vente-facile/core";

import { listeClients, listeFournisseurs, relevesContacts } from "@/data/contacts";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import {
  Badge,
  Button,
  CarteReleve,
  DataList,
  DataRow,
  Icon,
  MultiCurrencyTotal,
  PageHeader,
  Screen,
  SearchInput,
  Segmented,
  StatValue,
  Text,
} from "@/ui";

const TABLES = ["customers", "customer_balances", "suppliers"];
type Onglet = "clients" | "fournisseurs";

export default function Contacts() {
  const money = useMonnaie();
  const [onglet, setOnglet] = useState<Onglet>("clients");
  const [recherche, setRecherche] = useState("");

  const { donnees: r } = useLecture(relevesContacts, { tables: TABLES });
  const chargerC = useCallback(() => listeClients({ recherche }), [recherche]);
  const chargerF = useCallback(() => listeFournisseurs({ recherche }), [recherche]);
  const { donnees: clients, chargement: chC } = useLecture(chargerC, {
    tables: TABLES,
    deps: [recherche],
  });
  const { donnees: fournisseurs, chargement: chF } = useLecture(chargerF, {
    tables: TABLES,
    deps: [recherche],
  });

  const enTete = (
    <View className="gap-4 px-4 pb-3 pt-2">
      <PageHeader
        title="Clients & Fournisseurs"
        subtitle="Gérez vos clients, fournisseurs et leurs informations"
        actions={
          <Button size="sm" leftIcon="UserPlus" disabled onPress={() => {}}>
            Nouveau
          </Button>
        }
      />
      <Text variant="caption">
        La création, les règlements, avances et ajustements de solde arrivent au lot 6.
      </Text>

      {/* Quatre relevés, deux colonnes, dans l'ordre du web. */}
      <View className="flex-row flex-wrap gap-4">
        <CarteReleve
          label="Clients"
          icone={
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-chart-2/15">
              <Icon name="Users" size={18} color="chart2" />
            </View>
          }
        >
          <StatValue value={String(r?.clients ?? 0)} />
        </CarteReleve>
        <CarteReleve
          label="Fournisseurs"
          icone={
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-chart-5/15">
              <Icon name="Truck" size={18} color="chart5" />
            </View>
          }
        >
          <StatValue value={String(r?.fournisseurs ?? 0)} />
        </CarteReleve>
        <CarteReleve
          label="Clients avec un solde"
          icone={
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Icon name="CreditCard" size={18} color="primary" />
            </View>
          }
        >
          <StatValue value={String(r?.clientsAvecSolde ?? 0)} tone="primary" />
        </CarteReleve>
        <CarteReleve
          label="Créances totales"
          icone={
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-success/15">
              <Icon name="TrendingUp" size={18} color="success" />
            </View>
          }
        >
          <MultiCurrencyTotal
            lignes={r?.creances ?? []}
            money={money.money}
            vide={formatPrice(0)}
          />
        </CarteReleve>
      </View>

      <Segmented
        options={[
          { valeur: "clients", label: "Clients", icon: "Users" },
          { valeur: "fournisseurs", label: "Fournisseurs", icon: "Truck" },
        ]}
        valeur={onglet}
        onChange={(v) => setOnglet(v as Onglet)}
      />

      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder={
          onglet === "clients"
            ? "Rechercher par nom, code, téléphone..."
            : "Rechercher par nom, code, contact..."
        }
      />
    </View>
  );

  if (onglet === "clients") {
    return (
      <Screen edges={[]} padded={false}>
        <DataList
          donnees={clients?.elements ?? []}
          cle={(c) => c.id}
          enTete={enTete}
          chargement={chC && !clients}
          vide={{
            icon: "Users",
            titre: recherche ? "Aucun client trouvé" : "Aucun client",
            message: recherche
              ? "Essayez de modifier votre recherche."
              : "Les clients enregistrés au comptoir apparaîtront ici.",
          }}
          rendu={(c) => (
            <DataRow
              principal={c.nom}
              secondaire={[c.code, c.telephone].filter(Boolean).join(" · ") || null}
              icon={c.entreprise ? "Building2" : "User"}
              badge={
                !c.creditAutorise ? (
                  <Badge tone="destructive">Crédit refusé</Badge>
                ) : !c.actif ? (
                  <Badge tone="neutral">Inactif</Badge>
                ) : undefined
              }
              valeur={
                c.soldes.length > 0 ? (
                  <MultiCurrencyTotal
                    lignes={c.soldes}
                    money={money.money}
                    tone={c.soldePrincipal > 0 ? "destructive" : "chart2"}
                  />
                ) : undefined
              }
              // Libellés du back-office, mot pour mot.
              sousValeur={
                c.soldes.length === 0
                  ? "À jour"
                  : c.soldePrincipal > 0
                    ? "Dette"
                    : "Avance"
              }
              chevron={false}
            />
          )}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={[]} padded={false}>
      <DataList
        donnees={fournisseurs?.elements ?? []}
        cle={(f) => f.id}
        enTete={enTete}
        chargement={chF && !fournisseurs}
        vide={{
          icon: "Truck",
          titre: recherche ? "Aucun fournisseur trouvé" : "Aucun fournisseur",
          message: recherche
            ? "Essayez de modifier votre recherche."
            : "Créez votre premier fournisseur pour commencer.",
        }}
        rendu={(f) => (
          <DataRow
            principal={f.nom}
            secondaire={[f.code, f.contact, f.telephone].filter(Boolean).join(" · ") || null}
            icon="Truck"
            badge={
              !f.actif ? <Badge tone="neutral">Inactif</Badge> : f.devise ? (
                <Badge tone="neutral">{f.devise}</Badge>
              ) : undefined
            }
            valeur={
              f.solde !== 0 ? (
                <StatValue value={money.money(f.solde, f.devise ?? "")} tone="primary" />
              ) : undefined
            }
            sousValeur={f.solde !== 0 ? "Solde" : null}
            chevron={false}
          />
        )}
      />
    </Screen>
  );
}
