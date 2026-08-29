/**
 * Écran bloquant, faute de réseau.
 *
 * **C'est le SEUL de toute l'application**, et il n'existe que là où l'acte est
 * par nature en ligne : créer un établissement. Le serveur lui attribue son
 * identifiant, son slug unique et le code de ce terminal ; rien de cela ne peut
 * se décider hors ligne sans risquer une collision.
 *
 * Il DIT POURQUOI. Un blocage sans raison se lit comme une panne.
 *
 * Il se lève tout seul dès que le réseau revient : pas de bouton « Réessayer »,
 * qui ne ferait que relire le même état.
 */
import { View } from "react-native";

import { Button } from "./button";
import { Icon } from "./icon";
import { Text } from "./text";

export function HorsLigneBloquant({
  titre,
  message,
  actionSecondaire,
}: {
  titre: string;
  message: string;
  actionSecondaire?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Icon name="CloudDownload" size={32} color="mutedForeground" />
      </View>
      <Text variant="h4" className="text-center">
        {titre}
      </Text>
      <Text variant="muted" className="text-center">
        {message}
      </Text>
      {actionSecondaire ? (
        <Button variant="outline" onPress={actionSecondaire.onPress}>
          {actionSecondaire.label}
        </Button>
      ) : null}
    </View>
  );
}
