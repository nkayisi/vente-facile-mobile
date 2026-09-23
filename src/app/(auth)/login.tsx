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
import { MOTIF_DEMARRAGE, useSession } from "@/session/provider";
import { Banner, Button, FormField, Input, Logo, Pressable, Screen, Text } from "@/ui";

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
        // Ce n'était qu'un message : le compte existait, mais l'écran ne
        // proposait rien. On nomme la sortie.
        setError(
          "Aucun établissement n'est rattaché à ce compte. Créez votre boutique pour commencer."
        );
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
    <Screen scroll centre>
      {/* Le mot-symbole est DANS le logo, et le titre le répète : à cette
          taille il n'y est qu'une texture de quelques points, illisible, et
          c'est déjà le parti pris du tiroir. Retirer le titre emporterait la
          hiérarchie de titres que lit un lecteur d'écran. */}
      <View className="mb-8 items-center gap-3">
        <Logo hauteur={104} nomAilleurs />
        <View className="items-center gap-1">
          <Text variant="h1">Vente Facile</Text>
          <Text variant="muted">Connectez-vous pour ouvrir votre caisse.</Text>
        </View>
      </View>

      {/* ⚠ La condition ne peut PAS se réduire au statut : un démarrage à froid
      qui a levé retombe sur `anonymous`, pas sur `needs_password`. Sans la
      seconde branche, le caissier arriverait ici sans un mot et croirait sa
      journée perdue. */}
      {status === "needs_password" || lostReason === MOTIF_DEMARRAGE ? (
        <View className="mb-5">
          <Banner
            tone="warning"
            title={
              lostReason === MOTIF_DEMARRAGE
                ? "Le terminal n'a pas pu ouvrir sa session"
                : "Session expirée"
            }
            message={
              lostReason === MOTIF_DEMARRAGE
                ? // La phrase qui compte est « rien n'a été effacé » : c'est la
                  // seule question que se pose celui qui lit ce bandeau.
                  "La lecture des données locales a échoué au démarrage. Rien n'a été effacé : vos ventes et vos opérations en attente sont toujours sur l'appareil. Reconnectez-vous pour reprendre."
                : lostReason === "no_device"
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

      {/* Le lien reste VISIBLE hors ligne : masquer enseigne mal. C'est l'écran
          d'inscription qui explique pourquoi il faut du réseau, et il le dit. */}
      <Pressable
        onPress={() => router.push("/(auth)/inscription/compte")}
        accessibilityRole="link"
        accessibilityLabel="Créer ma boutique"
        className="mt-4 items-center py-2"
      >
        <Text variant="bodySmall">
          Pas encore de compte ?{" "}
          <Text variant="bodySmall" className="font-sans-medium text-accent-foreground">
            Créer ma boutique
          </Text>
        </Text>
      </Pressable>
    </Screen>
  );
}
