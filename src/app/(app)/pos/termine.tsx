/**
 * Vente enregistrée.
 *
 * Cet écran existe pour UNE information : la monnaie à rendre. Le caissier a
 * une main sur le tiroir et un client en face ; il ne doit pas avoir à revenir
 * en arrière pour relire un chiffre.
 *
 * La vente est en file, pas envoyée. On le dit sans dramatiser : c'est le
 * fonctionnement normal de l'application, pas une panne.
 */
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Button, Icon, Screen, Text } from "@/ui";
import { usePanier } from "@/features/pos/panier";

export default function Termine() {
  const { reference, monnaie, devise, credit } = useLocalSearchParams<{
    reference: string;
    monnaie: string;
    devise: string;
    credit: string;
  }>();
  const { argent } = usePanier();
  const aRendre = Number(monnaie) || 0;

  return (
    <Screen>
      <View className="flex-1 items-center justify-center px-4">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-success/15">
          <Icon name="checkmark" size={40} color="success" />
        </View>

        <Text variant="h2" className="mt-6 text-center">
          {credit ? "Vente à crédit enregistrée" : "Vente enregistrée"}
        </Text>
        <Text variant="muted" className="mt-1 text-center">
          {reference}
        </Text>

        {aRendre > 0 ? (
          <View className="mt-8 w-full items-center rounded-2xl bg-primary/10 py-8">
            <Text variant="body" className="text-muted-foreground">
              Monnaie à rendre
            </Text>
            <Text variant="h1" className="mt-2 text-primary">
              {argent(aRendre, devise)}
            </Text>
          </View>
        ) : null}

        <Text variant="bodySmall" className="mt-8 text-center text-muted-foreground">
          Elle part au prochain passage du réseau. Rien n'est perdu si vous
          fermez l'application.
        </Text>
      </View>

      <View className="mb-8 gap-3">
        <Button onPress={() => router.replace("/pos")} fullWidth>
          Nouvelle vente
        </Button>
        <Button variant="ghost" onPress={() => router.replace("/")} fullWidth>
          Quitter le comptoir
        </Button>
      </View>
    </Screen>
  );
}
