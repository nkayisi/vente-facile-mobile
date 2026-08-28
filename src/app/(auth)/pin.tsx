/**
 * Définition du code de déverrouillage.
 *
 * Exigé à l'enrôlement, pas proposé : ce terminal portera une session de
 * 30 jours et les ventes de la journée. Le code se saisit deux fois, parce
 * qu'un code mal tapé ne se découvre qu'au prochain démarrage, souvent hors
 * ligne, et coûte alors une reconnexion complète.
 */
import { useState } from "react";
import { View } from "react-native";

import { PIN_MIN_LENGTH, setPin } from "@/session/lock";
import { useSession } from "@/session/provider";
import { Banner, PinDots, PinPad, Screen, Text } from "@/ui";

export default function DefinePin() {
  const { markUnlocked, snapshot } = useSession();

  const [first, setFirst] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onDigit = async (digit: string) => {
    const next = entry + digit;
    setEntry(next);
    setError(null);

    if (next.length < PIN_MIN_LENGTH) return;

    if (first === null) {
      setFirst(next);
      setEntry("");
      return;
    }

    if (next !== first) {
      setError("Les deux codes ne correspondent pas. Recommencez.");
      setFirst(null);
      setEntry("");
      return;
    }

    await setPin(next);
    markUnlocked();
  };

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <View className="mb-10 items-center">
          <Text variant="h2" className="text-center">
            {first === null ? "Choisissez un code" : "Confirmez le code"}
          </Text>
          <Text variant="muted" className="mt-2 text-center">
            {first === null
              ? `Quatre chiffres pour ouvrir ${snapshot?.organization.name ?? "l'application"} sans réseau.`
              : "Saisissez le même code une seconde fois."}
          </Text>
        </View>

        <View className="mb-8">
          <PinDots length={PIN_MIN_LENGTH} filled={entry.length} />
        </View>

        {error ? (
          <View className="mb-4">
            <Banner tone="destructive" title={error} />
          </View>
        ) : null}

        <PinPad
          onDigit={(d) => void onDigit(d)}
          onBackspace={() => setEntry((p) => p.slice(0, -1))}
        />
      </View>
    </Screen>
  );
}
