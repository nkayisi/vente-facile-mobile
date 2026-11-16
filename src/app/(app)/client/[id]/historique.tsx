/**
 * L'historique d'un client : ses mouvements, sa cagnotte, son rapport.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA FICHE PORTAIT DIX SECTIONS SUR UN SEUL ÉCRAN.                        │
 * │                                                                          │
 * │ Situation, actions, cagnotte, rapport, factures ouvertes, coordonnées,   │
 * │ dernières ventes, grand livre. Ce qu'on vient chercher devant un client  │
 * │ - ce qu'il doit, et peut-il repartir à crédit - était noyé sous des      │
 * │ lectures du PASSÉ qu'on consulte rarement, et longuement.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ DEUX ONGLETS SUR TROIS SE LISENT HORS LIGNE, et c'est ce qui les met ici
 * plutôt que derrière le réseau : les écritures de compte et le registre de
 * cagnotte sont TIRÉS (`customer_transactions`, `loyalty_transactions`). Le
 * rapport, lui, exige le réseau - ses montants sont convertis par le serveur au
 * taux FIGÉ de chaque facture, et les recalculer donnerait deux chiffres pour
 * le même client. `SectionRapportClient` le DIT.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { formatDateFr } from "@vente-facile/core";

import {
  detailClient,
  mouvementsCagnotte,
  type MouvementCagnotte,
} from "@/data/contact-detail";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { LigneMouvement } from "@/features/clients/ligne-mouvement";
import { SectionRapportClient } from "@/features/clients/section-rapport";
import {
  AppBar,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  Screen,
  Segmented,
  Text,
} from "@/ui";
import { usePerimetreParDefaut } from "@/features/perimetre/use-perimetre";

type Onglet = "mouvements" | "cagnotte" | "rapport";

const ONGLETS: { valeur: Onglet; label: string }[] = [
  { valeur: "mouvements", label: "Mouvements" },
  { valeur: "cagnotte", label: "Cagnotte" },
  { valeur: "rapport", label: "Rapport" },
];

export default function HistoriqueClient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [onglet, setOnglet] = useState<Onglet>("mouvements");

  const perimetre = usePerimetreParDefaut(true);
  const lireClient = useCallback(() => detailClient(id, perimetre), [id, perimetre]);
  const { donnees: c } = useLecture(lireClient, {
    tables: ["customers", "customer_balances", "customer_transactions", "sales"],
    deps: [id, perimetre],
  });

  const lireCagnotte = useCallback(() => mouvementsCagnotte(id), [id]);
  const { donnees: cagnotte, chargement: chargeCagnotte } = useLecture(
    lireCagnotte,
    {
      tables: ["customer_loyalty", "loyalty_transactions"],
      deps: [id],
    }
  );

  return (
    <Screen scroll padded={false}>
      <AppBar title="Historique" subtitle={c?.nom} />

      <View className="gap-4 p-4">
        <Segmented
          valeur={onglet}
          options={ONGLETS}
          onChange={setOnglet}
        />

        {onglet === "mouvements" ? (
          c && c.mouvements.length > 0 ? (
            <Card>
              <CardHeader title={`Mouvements du compte (${c.mouvements.length})`} />
              <View>
                {c.mouvements.map((m, i) => (
                  <View key={m.id}>
                    {i > 0 ? <Divider /> : null}
                    <LigneMouvement m={m} />
                  </View>
                ))}
              </View>
            </Card>
          ) : (
            <Card>
              <EmptyState
                variante="carte"
                title="Aucun mouvement"
                message="Les règlements, avances et achats à crédit apparaîtront ici."
              />
            </Card>
          )
        ) : null}

        {onglet === "cagnotte" ? (
          cagnotte && cagnotte.length > 0 ? (
            <Card>
              <CardHeader title={`Mouvements de la cagnotte (${cagnotte.length})`} />
              <View>
                {cagnotte.map((m, i) => (
                  <View key={m.id}>
                    {i > 0 ? <Divider /> : null}
                    <LigneCagnotte m={m} />
                  </View>
                ))}
              </View>
            </Card>
          ) : (
            <Card>
              <EmptyState
                variante="carte"
                title={chargeCagnotte ? "Lecture…" : "Aucun mouvement de cagnotte"}
                message={
                  chargeCagnotte
                    ? "Le registre arrive."
                    : "Les gains et les emplois apparaîtront ici."
                }
              />
            </Card>
          )
        ) : null}

        {onglet === "rapport" ? <SectionRapportClient clientId={id} /> : null}
      </View>
    </Screen>
  );
}

/**
 * Une écriture de cagnotte.
 *
 * ⚠ LA CAGNOTTE EST EN DEVISE PRINCIPALE, toujours : c'est en elle que le
 * programme la calcule et que le comptoir l'emploie. Il n'y a donc rien à
 * ventiler, et le montant porte le symbole de l'établissement.
 */
function LigneCagnotte({ m }: { m: MouvementCagnotte }) {
  const money = useMonnaie();
  const gain = m.montant >= 0;
  return (
    <View className="flex-row items-center gap-3 py-3">
      <View className="min-w-0 flex-1">
        <Text variant="bodySmall" className="font-sans-medium">
          {m.typeLabel}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {[m.date ? formatDateFr(m.date) : null, m.description || null]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <View className="shrink-0 items-end">
        <Text
          variant="bodySmall"
          numeric
          className={`font-sans-medium ${gain ? "text-success" : "text-destructive"}`}
        >
          {`${gain ? "+" : "-"}${money.money(Math.abs(m.montant), money.primaryCode)}`}
        </Text>
        <Text numeric variant="caption">
          {`cagnotte ${money.money(m.soldeApres, money.primaryCode)}`}
        </Text>
      </View>
    </View>
  );
}
