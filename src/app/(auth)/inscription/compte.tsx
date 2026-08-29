/**
 * Inscription, étape 1 : « Vos informations ».
 *
 * Miroir de la première étape de `app/auth/register/page.tsx` : mêmes champs,
 * mêmes libellés, mêmes règles de validation, même ordre.
 *
 * **Aucun appel réseau ici.** L'unicité de l'e-mail n'est vérifiée qu'au POST
 * final : c'est un aller-retour de moins, et un écran qui marche dans un
 * ascenseur. Le web fait le même choix.
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { Button, FormField, Input, Pressable, Screen, Stepper, Text } from "@/ui";
import { useInscription } from "./_layout";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Compte() {
  const { saisie, poser } = useInscription();
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [voirMdp, setVoirMdp] = useState(false);

  function continuer() {
    // Mêmes règles que le web, mot pour mot.
    const e: Record<string, string> = {};
    if (saisie.first_name.trim().length < 2) e.first_name = "Le prénom est trop court";
    if (saisie.last_name.trim().length < 2) e.last_name = "Le nom est trop court";
    if (!EMAIL.test(saisie.email.trim())) e.email = "Email invalide";
    if (saisie.password.length < 8) e.password = "Au moins 8 caractères";
    if (saisie.password !== saisie.password_confirm)
      e.password_confirm = "Les mots de passe ne correspondent pas";
    setErreurs(e);
    if (Object.keys(e).length === 0) router.push("/(auth)/inscription/etablissement");
  }

  return (
    <Screen scroll>
      <View className="items-center gap-2 pt-4">
        <Text variant="h2">Créer ma boutique</Text>
        <Text variant="muted" className="text-center">
          Rejoignez Vente Facile et gérez votre commerce simplement
        </Text>
      </View>

      <View className="my-6">
        <Stepper etapes={["Vos informations", "Votre établissement"]} courante={0} />
      </View>

      <View className="gap-4">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField label="Prénom" required error={erreurs.first_name}>
              <Input
                value={saisie.first_name}
                onChangeText={(v) => poser({ first_name: v })}
                placeholder="Jean"
                invalid={Boolean(erreurs.first_name)}
                autoCapitalize="words"
              />
            </FormField>
          </View>
          <View className="flex-1">
            <FormField label="Nom" required error={erreurs.last_name}>
              <Input
                value={saisie.last_name}
                onChangeText={(v) => poser({ last_name: v })}
                placeholder="Dupont"
                invalid={Boolean(erreurs.last_name)}
                autoCapitalize="words"
              />
            </FormField>
          </View>
        </View>

        <FormField label="Email" required error={erreurs.email}>
          <Input
            value={saisie.email}
            onChangeText={(v) => poser({ email: v })}
            placeholder="exemple@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            invalid={Boolean(erreurs.email)}
          />
        </FormField>

        <FormField label="Téléphone">
          <Input
            value={saisie.phone ?? ""}
            onChangeText={(v) => poser({ phone: v })}
            placeholder="+243 XXX XXX XXX"
            keyboardType="phone-pad"
          />
        </FormField>

        <FormField label="Mot de passe" required error={erreurs.password} hint="Au moins 8 caractères">
          <Input
            value={saisie.password}
            onChangeText={(v) => poser({ password: v })}
            placeholder="••••••••"
            secureTextEntry={!voirMdp}
            autoCapitalize="none"
            invalid={Boolean(erreurs.password)}
            trailing={
              <Pressable
                onPress={() => setVoirMdp((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={voirMdp ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                hitSlop={8}
              >
                <Text variant="caption" className="text-accent-foreground">
                  {voirMdp ? "Masquer" : "Afficher"}
                </Text>
              </Pressable>
            }
          />
        </FormField>

        <FormField label="Confirmer le mot de passe" required error={erreurs.password_confirm}>
          <Input
            value={saisie.password_confirm}
            onChangeText={(v) => poser({ password_confirm: v })}
            placeholder="••••••••"
            secureTextEntry={!voirMdp}
            autoCapitalize="none"
            invalid={Boolean(erreurs.password_confirm)}
          />
        </FormField>
      </View>

      <View className="mt-6 gap-3">
        <Button fullWidth size="lg" rightIcon="ArrowRight" onPress={continuer}>
          Continuer
        </Button>
        <Pressable
          onPress={() => router.replace("/(auth)/login")}
          accessibilityRole="link"
          accessibilityLabel="J'ai déjà un compte, se connecter"
          className="items-center py-2"
        >
          <Text variant="bodySmall">
            Vous avez déjà un compte ?{" "}
            <Text variant="bodySmall" className="font-sans-medium text-accent-foreground">
              Se connecter
            </Text>
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
