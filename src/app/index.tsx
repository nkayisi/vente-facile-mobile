/**
 * Aiguillage de démarrage.
 *
 * Aucun appel réseau ici : `SessionProvider` a déjà résolu l'état depuis le
 * trousseau. Cet écran ne fait que router.
 */
import { Redirect } from "expo-router";
import { View } from "react-native";

import { useSession } from "@/session/provider";
import { Spinner } from "@/ui";

export default function Index() {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner size="large" />
      </View>
    );
  }

  if (status === "anonymous" || status === "needs_password") {
    return <Redirect href="/(auth)/login" />;
  }
  if (status === "needs_pin") return <Redirect href="/(auth)/pin" />;
  if (status === "locked") return <Redirect href="/(locked)/unlock" />;
  return <Redirect href="/(app)" />;
}
