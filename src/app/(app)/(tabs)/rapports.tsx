/**
 * Rapports & Statistiques. Miroir de `app/dashboard/reports/page.tsx`.
 *
 * Le back-office a HUIT onglets. En rendu étroit il les replie sur trois ou
 * quatre lignes, ce qui mange la moitié de l'écran avant le premier chiffre ;
 * `Segmented` les fait défiler horizontalement, en laissant le dernier
 * partiellement visible pour que la coupe se voie.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES RAPPORTS EXIGENT LE RÉSEAU, et c'est délibéré.                      │
 * │                                                                          │
 * │ Leurs agrégats viennent de `/reports/statistics/*`, dont les définitions │
 * │ sont subtiles : périmètre entrepôt, portée par créateur pour un          │
 * │ caissier, bornes de dates locales, conversions inter-devises. Les        │
 * │ recalculer ici donnerait deux chiffres pour le même établissement.       │
 * │                                                                          │
 * │ Un rapport est un outil d'analyse, pas un geste de comptoir. Ce qui doit │
 * │ marcher hors ligne, c'est vendre et encaisser - et cela marche.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useMonnaie } from "@/data/devises";
import { useEnLigne } from "@/data/reseau";
import {
  chargerRapport,
  type OngletRapport,
  type Rapport,
} from "@/data/rapports";
import { useSession } from "@/session/provider";
import {
  Banner, Button, CarteReleve, DataList, DataRow, Icon, PageHeader, Screen,
  Segmented, Spinner, StatValue,
} from "@/ui";

const ONGLETS: { valeur: OngletRapport; label: string }[] = [
  { valeur: "overview", label: "Vue d'ensemble" },
  { valeur: "daily-cash", label: "Rapport journalier" },
  { valeur: "sales", label: "Ventes" },
  { valeur: "products", label: "Produits" },
  { valeur: "customers", label: "Clients" },
  { valeur: "stock", label: "Stock" },
  { valeur: "profits", label: "Bénéfices" },
  { valeur: "user-activity", label: "Par utilisateur" },
];

export default function Rapports() {
  const money = useMonnaie();
  const { snapshot } = useSession();
  // L'état réseau est un HOOK, lu au rendu : l'interroger dans un `catch`
  // ferait un appel de hook conditionnel.
  const enLigne = useEnLigne();
  const [onglet, setOnglet] = useState<OngletRapport>("overview");
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const organisation = snapshot?.organization.id ?? "";
  const devisePrincipale =
    snapshot?.currencies?.find((d) => d.is_primary)?.currency_code ?? "CDF";

  const charger = useCallback(async () => {
    if (!organisation) return;
    setChargement(true);
    setErreur(null);
    try {
      setRapport(
        await chargerRapport(onglet, {
          organisation,
          money: money.money,
          devisePrincipale,
        })
      );
    } catch (e) {
      // Hors ligne, on le DIT plutôt que d'afficher un tableau vide : un
      // rapport vide se lit comme « rien à signaler », ce qui est faux.
      setErreur(
        enLigne
          ? e instanceof Error
            ? e.message
            : "Le rapport n'a pas pu être chargé."
          : "hors-ligne"
      );
      setRapport(null);
    } finally {
      setChargement(false);
    }
  }, [onglet, organisation, devisePrincipale, money.money, enLigne]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const enTete = (
    <View className="gap-4 px-4 pb-3 pt-2">
      <PageHeader
        title="Rapports & Statistiques"
        subtitle="Analysez les performances de votre entreprise"
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon="CreditCard"
            onPress={() => router.push("/creances")}
          >
            Créances
          </Button>
        }
      />
      <Segmented
        options={ONGLETS.map((o) => ({ valeur: o.valeur, label: o.label }))}
        valeur={onglet}
        onChange={(v) => setOnglet(v as OngletRapport)}
      />
      {erreur === "hors-ligne" ? (
        <Banner
          tone="warning"
          title="Les rapports demandent une connexion"
          message="Leurs chiffres viennent du serveur, pour qu'ils ne diffèrent jamais de ceux du back-office. Vendre et encaisser, eux, marchent hors ligne."
          action={{ label: "Réessayer", onPress: () => void charger() }}
        />
      ) : erreur ? (
        <Banner
          tone="destructive"
          title="Le rapport n'a pas pu être chargé"
          message={erreur}
          action={{ label: "Réessayer", onPress: () => void charger() }}
        />
      ) : null}

      {(rapport?.releves.length ?? 0) > 0 ? (
        <View className="flex-row flex-wrap gap-4">
          {rapport?.releves.map((r) => (
            <CarteReleve
              key={r.label}
              label={r.label}
              icone={
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Icon name="BarChart3" size={18} color="mutedForeground" />
                </View>
              }
            >
              <StatValue value={r.valeur} />
            </CarteReleve>
          ))}
        </View>
      ) : null}

      {chargement ? (
        <View className="items-center py-4">
          <Spinner />
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen edges={[]} padded={false}>
      <DataList
        donnees={rapport?.lignes ?? []}
        cle={(l) => l.cle}
        enTete={enTete}
        onRefresh={() => void charger()}
        refreshing={chargement}
        rendu={(l) => (
          <DataRow
            principal={l.titre}
            secondaire={l.detail}
            valeur={<StatValue value={l.valeur} />}
            sousValeur={l.sousValeur}
            chevron={false}
          />
        )}
        vide={{
          icon: "BarChart3",
          titre: chargement ? "Chargement…" : "Aucune donnée",
          message:
            erreur === "hors-ligne"
              ? "Reconnectez-vous pour consulter ce rapport."
              : "Rien à afficher sur cette période.",
        }}
      />
    </Screen>
  );
}
