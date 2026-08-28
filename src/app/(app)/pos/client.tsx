/**
 * Choisir le client d'une vente.
 *
 * Lecture locale, y compris les soldes : refuser un crédit parce que le réseau
 * est absent fait perdre un client, alors que le serveur revérifiera de toute
 * façon à la poussée. Ce qui s'affiche ici est le dernier état connu, et l'écran
 * le dit quand il est vieux.
 */
import { useEffect, useRef, useState } from "react";
import { FlatList, View } from "react-native";
import { router } from "expo-router";

import { chercherClients } from "@/features/pos/donnees";
import { usePanier, type ClientPos } from "@/features/pos/panier";
import { Divider, EmptyState, Icon, Input, Pressable, Screen, Text } from "@/ui";

export default function ChoixClient() {
  const panier = usePanier();
  const [terme, setTerme] = useState("");
  const [clients, setClients] = useState<ClientPos[]>([]);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => {
      chercherClients(terme).then(setClients);
    }, 200);
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [terme]);

  const choisir = (client: ClientPos | null) => {
    panier.envoyer({ type: "client", client });
    router.back();
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          accessibilityLabel="Retour"
        >
          <Icon name="chevron-back" size={24} />
        </Pressable>
        <Text variant="h4" className="flex-1">
          Client
        </Text>
      </View>

      <View className="mt-2">
        <Input
          value={terme}
          onChangeText={setTerme}
          placeholder="Nom, téléphone ou code"
          leading={<Icon name="search-outline" size={18} color="mutedForeground" />}
          autoCorrect={false}
        />
      </View>

      <Pressable
        onPress={() => choisir(null)}
        className="mt-3 flex-row items-center gap-3 rounded-xl border border-border px-4 py-3 active:bg-muted"
      >
        <Icon name="person-outline" size={18} color="mutedForeground" />
        <Text variant="body" className="text-muted-foreground">
          Aucun client (vente au comptant)
        </Text>
      </Pressable>

      {clients.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={terme ? "Aucun client trouvé" : "Aucun client"}
          message={
            terme
              ? "Essayez le téléphone ou le code du client."
              : "Synchronisez pour recevoir la liste des clients."
          }
        />
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(c) => c.id}
          className="mt-3"
          contentContainerClassName="pb-8"
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <Divider />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => choisir(item)}
              className="flex-row items-center px-1 py-3 active:bg-muted"
            >
              <View className="flex-1 pr-3">
                <Text variant="body">{item.name}</Text>
                <Text variant="bodySmall" className="mt-0.5 text-muted-foreground">
                  {libelleSolde(item, panier.argent, panier.devises.primary)}
                </Text>
              </View>
              {item.allow_credit === false ? (
                <Icon name="ban-outline" size={16} color="destructive" />
              ) : null}
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

/**
 * Le solde d'un client, dit dans le sens du commerçant.
 *
 * « Doit 45 000 FC » se comprend d'un coup d'œil, là où « solde : 45 000 »
 * laisse ouverte la question de savoir qui doit à qui.
 */
function libelleSolde(
  client: ClientPos,
  argent: (m: number, code?: string) => string,
  principale: string
): string {
  if (client.allow_credit === false) return "Crédit non autorisé";
  const solde = Number(client.current_balance) || 0;
  if (solde > 0) return `Doit ${argent(solde, principale)}`;
  if (solde < 0) return `Avance de ${argent(-solde, principale)}`;
  return "À jour";
}
