/**
 * Écran de départ.
 *
 * Il n'aiguille plus : c'est `SessionGate` qui décide, depuis la racine de
 * l'arbre, et qui continue de décider quand l'état change plus tard. Cet écran
 * ne fait qu'occuper la place le temps que le trousseau réponde, ce qui prend
 * quelques millisecondes et aucun appel réseau.
 */
import { View } from "react-native";

import { Spinner } from "@/ui";

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Spinner size="large" />
    </View>
  );
}
