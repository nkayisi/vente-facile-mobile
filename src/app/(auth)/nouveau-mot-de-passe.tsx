/**
 * Le changement OBLIGATOIRE d'un mot de passe posé par l'administration.
 *
 * Le support l'a dicté au téléphone : il le connaît. Le serveur refuse donc
 * tout le reste, enrôlement du terminal compris, tant que le titulaire ne l'a
 * pas remplacé. On arrive ici juste après la connexion, avant le choix de
 * l'établissement, et on en repart par la MÊME suite que la connexion
 * (`etapeApresConnexion`).
 *
 * ⚠ Le « mot de passe actuel » est exigé, alors que la session vient de naître
 * avec lui : c'est ce qui empêche un jeton resté ouvert ailleurs de choisir le
 * mot de passe à la place du titulaire.
 */
import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ApiError } from "@/api/errors";
import {
  PHRASE_AUCUN_ETABLISSEMENT,
  erreursDuServeur,
  etapeApresConnexion,
  verifierSaisie,
  type ErreursChangement,
  type SaisieChangement,
} from "@/session/apres-connexion";
import { messageEchecConnexion } from "@/session/echec-connexion";
import { useSession } from "@/session/provider";
import { changerMotDePasse, type OrganizationChoice } from "@/session/session";
import { Banner, Button, FormField, Input, Screen, Text } from "@/ui";

export default function NouveauMotDePasse() {
  const { chooseOrganization } = useSession();
  const params = useLocalSearchParams<{ organizations?: string }>();

  const [saisie, setSaisie] = useState<SaisieChangement>({ actuel: "", nouveau: "", confirmation: "" });
  const [secret, setSecret] = useState(true);
  const [erreurs, setErreurs] = useState<ErreursChangement>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Le mot de passe est déjà remplacé : seul l'établissement reste à ouvrir. */
  const [change, setChange] = useState(false);

  let organizations: OrganizationChoice[] = [];
  try {
    organizations = JSON.parse(params.organizations ?? "[]");
  } catch {
    organizations = [];
  }

  const poser = (champ: keyof SaisieChangement) => (v: string) => {
    setSaisie((p) => ({ ...p, [champ]: v }));
    setErreurs((p) => ({ ...p, [champ]: undefined }));
  };

  const enregistrer = async () => {
    if (busy) return;
    setErreur(null);
    if (!change) {
      const locales = verifierSaisie(saisie);
      setErreurs(locales);
      if (Object.keys(locales).length > 0) return;
    }

    setBusy(true);
    // ⚠ UN CHANGEMENT DÉJÀ FAIT NE SE REFAIT PAS. Quand c'est l'établissement qui
    // échoue ensuite (réseau, enrôlement refusé), réappuyer renverrait le mot de
    // passe communiqué comme « actuel », que le serveur ne connaît plus : le
    // titulaire lirait « mot de passe actuel incorrect » sur un mot de passe
    // juste, et ne saurait plus lequel taper.
    if (!change) {
      try {
        await changerMotDePasse(saisie.actuel, saisie.nouveau, saisie.confirmation);
        setChange(true);
      } catch (e) {
        const duServeur = e instanceof ApiError ? erreursDuServeur(e.body) : {};
        if (Object.keys(duServeur).length > 0) setErreurs(duServeur);
        else setErreur(messageEchecConnexion(e));
        setBusy(false);
        return;
      }
    }

    // Le mot de passe est changé : la même suite que la connexion.
    try {
      const etape = etapeApresConnexion({ organizations, mustChangePassword: false });
      if (etape.type === "aucun_etablissement") {
        setErreur(PHRASE_AUCUN_ETABLISSEMENT);
      } else if (etape.type === "choisir_d_office") {
        await chooseOrganization(etape.organizationId);
      } else {
        router.replace({
          pathname: "/(auth)/organization",
          params: { organizations: JSON.stringify(organizations) },
        });
      }
    } catch (e) {
      setErreur(messageEchecConnexion(e));
    } finally {
      setBusy(false);
    }
  };

  const champ = (
    cle: keyof SaisieChangement,
    label: string,
    textContentType: "password" | "newPassword",
    dernier = false
  ) => (
    <FormField label={label} required error={erreurs[cle]}>
      <Input
        value={saisie[cle]}
        onChangeText={poser(cle)}
        secureTextEntry={secret}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={textContentType}
        editable={!busy && !change}
        returnKeyType={dernier ? "go" : "next"}
        onSubmitEditing={dernier ? enregistrer : undefined}
      />
    </FormField>
  );

  return (
    <Screen scroll centre>
      <View className="mb-6 gap-1">
        <Text variant="h2">Choisissez votre mot de passe</Text>
        <Text variant="muted">
          Le mot de passe de ce compte a été réinitialisé par le support. Remplacez-le par le vôtre
          pour continuer : personne d&apos;autre ne doit le connaître.
        </Text>
      </View>

      {champ("actuel", "Mot de passe communiqué", "password")}
      {champ("nouveau", "Nouveau mot de passe", "newPassword")}
      {champ("confirmation", "Confirmation", "newPassword", true)}

      <Text
        variant="caption"
        className="mb-4 text-primary"
        onPress={() => setSecret((v) => !v)}
        accessibilityRole="button"
      >
        {secret ? "Afficher les mots de passe" : "Masquer les mots de passe"}
      </Text>

      {erreur ? (
        <View className="mb-4">
          <Banner tone="destructive" title={erreur} />
        </View>
      ) : null}

      <Button fullWidth size="lg" loading={busy} onPress={enregistrer}>
        {change ? "Continuer" : "Enregistrer et continuer"}
      </Button>
      <Button
        fullWidth
        variant="ghost"
        className="mt-2"
        disabled={busy}
        // ⚠ Pas de `logout()` : aucun terminal n'est encore enrôlé, et la
        // déconnexion passe par un seul chemin (`useDeconnexion`, garde-fou de
        // doctrine). La connexion suivante réécrit les jetons.
        onPress={() => router.replace("/(auth)/login")}
      >
        Revenir à la connexion
      </Button>
    </Screen>
  );
}
