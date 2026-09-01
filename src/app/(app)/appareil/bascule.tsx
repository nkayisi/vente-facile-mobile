/**
 * Ce que l'ancienne application a laissé sur ce terminal.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON NE REJOUE PAS CES ENREGISTREMENTS, ET C'EST DÉLIBÉRÉ.                │
 * │                                                                          │
 * │ Leur schéma n'est pas le nôtre, leurs numéros de document ont été       │
 * │ fabriqués autrement, et migrer des écritures comptables en silence est  │
 * │ précisément ce qu'un marchand ne peut pas vérifier.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ANCIENNE VOIE DE SYNCHRONISATION N'EXISTE PLUS.                        │
 * │                                                                          │
 * │ Cet écran renvoyait vers l'ancienne application « qui sait les           │
 * │ synchroniser ». Elle le savait par `POST /api/v1/sync/`, retiré du       │
 * │ serveur avec elle. Réinstaller l'ancienne app ne remonterait donc plus   │
 * │ rien, et le conseil aurait envoyé un marchand perdre une soirée à        │
 * │ regarder une synchronisation échouer.                                    │
 * │                                                                          │
 * │ Le comptage, lui, garde tout son sens, et c'est même le seul endroit qui │
 * │ le dise : ces écritures n'existent QUE dans ce fichier. La reprise est   │
 * │ désormais manuelle, et l'écran l'annonce au lieu de promettre un bouton. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useLecture } from "@/data/live";
import { NOM_TABLE, resteDeLAncienneApp } from "@/session/bascule";
import {
  AppBar, Banner, Button, Card, CardHeader, Divider, EmptyState, Screen,
  Spinner, Text,
} from "@/ui";

export default function Bascule() {
  const charger = useCallback(() => resteDeLAncienneApp(), []);
  // Aucune table locale ne change ce résultat : c'est un fichier hérité, figé.
  const { donnees: reste, chargement } = useLecture(charger, { tables: [] });

  if (chargement && !reste) {
    return (
      <Screen>
        <AppBar title="Ancienne application" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!reste) {
    return (
      <Screen padded={false}>
        <AppBar title="Ancienne application" />
        <EmptyState
          icon="CheckCircle2"
          title="Rien à reprendre"
          message="Aucune donnée de l'ancienne application n'attend sur ce terminal. La bascule est terminée."
          action={{ label: "Revenir", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false}>
      <AppBar title="Ancienne application" subtitle="Données non synchronisées" />

      <View className="gap-4 p-4">
        <Banner
          tone="destructive"
          title={
            reste.total < 0
              ? "Un fichier de l'ancienne application est illisible"
              : reste.total > 1
                ? `${reste.total} enregistrements n'ont jamais atteint le serveur`
                : "Un enregistrement n'a jamais atteint le serveur"
          }
          message={
            reste.total < 0
              ? "Il est présent sur ce terminal mais ne s'ouvre pas. Ne réinstallez rien : faites-le examiner avant."
              : "Ces écritures ont été faites dans l'ancienne application et n'ont pas été envoyées. Elles ne sont PAS reprises ici : cette application ne lit pas leur format."
          }
        />

        {reste.parTable.length > 0 ? (
          <Card>
            <CardHeader title="Ce qui attend" />
            <View>
              {reste.parTable.map((l, i) => (
                <View key={l.table}>
                  {i > 0 ? (
                    <View className="my-2">
                      <Divider />
                    </View>
                  ) : null}
                  <View className="flex-row items-baseline justify-between gap-3">
                    <Text variant="bodySmall" className="text-muted-foreground">
                      {NOM_TABLE[l.table] ?? l.table}
                    </Text>
                    <Text variant="bodySmall" numeric className="font-sans-medium">
                      {String(l.nombre)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Que faire" />
          <View className="gap-2">
            <Text variant="bodySmall">
              1. Ne désinstallez rien et ne réinitialisez pas ce terminal : le
              fichier ci-dessous est le seul endroit où ces écritures existent.
            </Text>
            <Text variant="bodySmall">
              2. Signalez-le à votre support avant toute intervention. La voie
              de synchronisation de l&apos;ancienne application a été retirée du
              serveur : la réinstaller ne remonterait plus rien.
            </Text>
            <Text variant="bodySmall">
              3. Ressaisissez ces opérations ici, d&apos;après les tickets
              imprimés, une fois le fichier mis à l&apos;abri. C&apos;est plus
              long, et c&apos;est le seul chemin dont le résultat se contrôle.
            </Text>
          </View>
          <Text variant="caption" className="mt-3">
            {`Fichier concerné : ${reste.chemin}`}
          </Text>
        </Card>

        <Banner
          tone="warning"
          title="Ne désinstallez pas cette application"
          message="La désinstallation effacerait ce fichier avec le reste. Tant que cet écran affiche un décompte, ces écritures n'existent nulle part ailleurs."
        />

        <Button variant="outline" fullWidth onPress={() => router.back()}>
          Revenir
        </Button>
      </View>
    </Screen>
  );
}
