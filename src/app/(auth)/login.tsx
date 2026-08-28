/**
 * Connexion par mot de passe.
 *
 * Deux entrées mènent ici : un terminal neuf, et un terminal dont le serveur a
 * refusé l'identité. Le second cas se dit explicitement, parce que
 * l'utilisateur a des ventes en attente sur l'appareil et doit savoir qu'elles
 * ne sont pas perdues.
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { ApiError } from "@/api/errors";
import { useSession } from "@/session/provider";
import { Banner, Button, FormField, Input, Screen, Text } from "@/ui";

export default function Login() {
  const { login, chooseOrganization, status, lostReason } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setError(null);

    if (!email.trim() || !password) {
      setError("Renseignez votre adresse et votre mot de passe.");
      return;
    }

    setBusy(true);
    try {
      const organizations = await login(email.trim().toLowerCase(), password);

      if (organizations.length === 0) {
        setError("Aucun établissement n'est rattaché à ce compte.");
        return;
      }
      // Une seule boutique : rien à demander. Au-delà, on demande, toujours.
      if (organizations.length === 1) {
        await chooseOrganization(organizations[0]!.id);
        return;
      }
      router.push({
        pathname: "/(auth)/organization",
        params: { organizations: JSON.stringify(organizations) },
      });
    } catch (e) {
      setError(
        e instanceof ApiError && e.kind === "network"
          ? "Impossible de joindre le serveur. Vérifiez votre connexion."
          : e instanceof ApiError && e.kind === "auth"
            ? "Adresse ou mot de passe incorrect."
            : e instanceof Error
              ? e.message
              : "La connexion a échoué."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View className="mb-8 mt-10">
        <Text variant="h1">Vente Facile</Text>
        <Text variant="muted">Connectez-vous pour ouvrir votre caisse.</Text>
      </View>

      {status === "needs_password" ? (
        <View className="mb-5">
          <Banner
            tone="warning"
            title="Session expirée"
            message={
              lostReason === "no_device"
                ? "Ce terminal doit être enrôlé à nouveau. Vos données restent sur l'appareil."
                : "L'accès de ce terminal a été révoqué ou a expiré. Vos ventes en attente sont conservées et repartiront après reconnexion."
            }
          />
        </View>
      ) : null}

      <FormField label="Adresse e-mail" required>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="vous@boutique.cd"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!busy}
        />
      </FormField>

      <FormField label="Mot de passe" required>
        <Input
          value={password}
          onChangeText={setPassword}
          // Des points en indication se lisent comme un mot de passe deja
          // saisi : sur la capture, le champ semblait rempli alors qu il etait vide.
          placeholder="Votre mot de passe"
          secureTextEntry={secret}
          autoCapitalize="none"
          textContentType="password"
          editable={!busy}
          onSubmitEditing={submit}
          returnKeyType="go"
          trailing={
            <Text
              variant="caption"
              className="text-primary"
              onPress={() => setSecret((v) => !v)}
            >
              {secret ? "Afficher" : "Masquer"}
            </Text>
          }
        />
      </FormField>

      {error ? (
        <View className="mb-4">
          <Banner tone="destructive" title={error} />
        </View>
      ) : null}

      <Button fullWidth size="lg" loading={busy} onPress={submit}>
        Se connecter
      </Button>
    </Screen>
  );
}
