/**
 * Déverrouillage.
 *
 * Aucun appel réseau : c'est le point d'entrée d'un terminal qui peut être
 * hors ligne depuis trois semaines. Tout se vérifie contre le trousseau.
 */
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  biometricSupport,
  unlockDelayRemaining,
  unlockWithBiometrics,
  verifyPin,
  type BiometricSupport,
} from "@/session/lock";
import { useDeconnexion } from "@/session/deconnexion";
import { useSession } from "@/session/provider";
import { Banner, Button, PinDots, PinPad, Screen, Text } from "@/ui";

function formatDelay(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} seconde${seconds > 1 ? "s" : ""}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

export default function Unlock() {
  const { snapshot, markUnlocked } = useSession();
  const { demander } = useDeconnexion();

  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [delayMs, setDelayMs] = useState(0);
  const [biometrics, setBiometrics] = useState<BiometricSupport | null>(null);

  useEffect(() => {
    void biometricSupport().then(setBiometrics);
    void unlockDelayRemaining().then(setDelayMs);
  }, []);

  // Décompte de la temporisation, pour que l'utilisateur voie qu'elle s'écoule
  // plutôt que de taper dans le vide.
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setInterval(() => {
      setDelayMs((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [delayMs > 0]);

  const tryBiometrics = useCallback(async () => {
    if (await unlockWithBiometrics()) markUnlocked();
  }, [markUnlocked]);

  // Proposée d'emblée quand le matériel la porte ET qu'elle est configurée :
  // le geste attendu au comptoir est de poser le doigt, pas de taper.
  useEffect(() => {
    if (biometrics?.available && biometrics.enrolled && delayMs === 0) {
      void tryBiometrics();
    }
  }, [biometrics?.available, biometrics?.enrolled]);

  const submit = useCallback(
    async (code: string) => {
      const outcome = await verifyPin(code);
      setPin("");

      switch (outcome.status) {
        case "ok":
          markUnlocked();
          return;
        case "wrong":
          setMessage(
            `Code incorrect. ${outcome.remaining} essai${outcome.remaining > 1 ? "s" : ""} avant blocage.`
          );
          return;
        case "delayed":
          setDelayMs(outcome.retryInMs);
          setMessage(null);
          return;
        case "exhausted":
          setExhausted(true);
          return;
        case "no_pin":
          markUnlocked();
      }
    },
    [markUnlocked]
  );

  const onDigit = (digit: string) => {
    if (delayMs > 0 || exhausted) return;
    const next = pin + digit;
    setPin(next);
    setMessage(null);
    if (next.length >= PIN_MIN_LENGTH) {
      // On tente dès la longueur minimale : la plupart des codes font quatre
      // chiffres, et exiger une validation ajouterait un geste par ouverture.
      void submit(next);
    }
    if (next.length >= PIN_MAX_LENGTH) setPin("");
  };

  if (exhausted) {
    return (
      <Screen>
        <View className="flex-1 justify-center">
          <Banner
            tone="destructive"
            title="Trop d'essais"
            // La promesse est devenue CONDITIONNELLE, et elle doit le dire. La
            // modale envoie d'abord ce qui attend, puis remet le terminal à
            // neuf ; ce qui ne peut pas partir - pas de réseau, un droit
            // manquant, un refus du serveur - n'est jamais effacé, elle n'offre
            // aucune issue destructrice.
            message="Reconnectez-vous avec votre mot de passe. Ce qui attend encore son envoi partira d'abord, et ce qui ne peut pas partir est conservé."
          />
          <View className="mt-6">
            <Button fullWidth size="lg" onPress={demander}>
              Se reconnecter
            </Button>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <View className="mb-10 items-center">
          <Text variant="h3">{snapshot?.organization.name ?? "Vente Facile"}</Text>
          <Text variant="muted" className="mt-1">
            {snapshot?.user.full_name}
          </Text>
        </View>

        <View className="mb-8">
          <Text variant="label" className="mb-5 text-center">
            {delayMs > 0 ? "Trop d'essais" : "Entrez votre code"}
          </Text>
          <PinDots length={PIN_MIN_LENGTH} filled={pin.length} />
        </View>

        {delayMs > 0 ? (
          <Text variant="muted" className="mb-4 text-center">
            Réessayez dans {formatDelay(delayMs)}.
          </Text>
        ) : message ? (
          <Text variant="error" className="mb-4 text-center">
            {message}
          </Text>
        ) : null}

        <PinPad
          onDigit={onDigit}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
          disabled={delayMs > 0}
        />

        {biometrics?.available && biometrics.enrolled ? (
          <View className="mt-6 items-center">
            <Button
              variant="ghost"
              leftIcon="ion:finger-print"
              onPress={tryBiometrics}
              disabled={delayMs > 0}
            >
              {biometrics.label}
            </Button>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
