/**
 * La surcouche de mise à jour obligatoire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE DIT QUOI FAIRE, ET CE QUI N'EST PAS PERDU.                         │
 * │                                                                          │
 * │ Le marchand vient d'être coupé du comptoir avec lequel il gagne sa       │
 * │ journée, pour une raison qui ne vient pas de lui. La première question   │
 * │ qu'il se pose n'est pas « quelle version », c'est « où sont mes ventes ».│
 * │ Un blocage sans raison se lit comme une perte de données.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Une icône de téléchargement, pas un cadenas.** Le voile d'abonnement porte
 * `Lock` sur fond `destructive` parce qu'il constate une dette. Ici il n'y a
 * rien à se reprocher : c'est de l'entretien, et le rouge apprendrait à ne plus
 * lire les écrans rouges.
 *
 * ⚠ **« ENVOYER » PASSE AVANT « METTRE À JOUR », et ce n'est pas une politesse.**
 * Une mise à jour par le magasin conserve le bac à sable, donc la base et le
 * journal. Un APK posé à la main dont la signature diffère de l'installé, lui,
 * force une DÉSINSTALLATION, qui détruit tout - et c'est précisément le chemin
 * des terminaux de comptoir sans magasin. Vider la file d'abord est la seule
 * mitigation de ce cas ; la carte promet donc ce qu'on peut tenir, pas plus.
 *
 * ⚠ **CE QUI EST RETENU NE FAIT PAS CÉDER « METTRE À JOUR ».** Une opération
 * bloquée ou refusée ne partira pas d'un envoi : la garder au rang d'action
 * principale poserait une condition que le marchand ne peut jamais satisfaire.
 * On la NOMME, on ne la lui oppose pas. Les quatre états de la carte vivent dans
 * `session/carte-en-souffrance.ts`, testés sans appareil.
 *
 * ⚠ **Le bouton de synchronisation est LÉGITIME ici**, alors que
 * `features/sync/bandeau.ts` interdit de le poser sur un blocage. Cette règle
 * vise le blocage d'ABONNEMENT, où le serveur refuse les écritures en 402 :
 * synchroniser n'y sert à rien. Ici le serveur n'a rien refusé, la poussée
 * fonctionne, et c'est même ce qu'il faut faire en premier.
 */
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { useEnLigne } from "@/data/reseau";
import { useSynchronisation } from "@/features/sync/provider";
import { carteMiseAJour } from "@/session/carte-en-souffrance";
import { useDeconnexion } from "@/session/deconnexion";
import { useSession } from "@/session/provider";
import type { SessionAppUpdate } from "@/session/types";
import { useEnSouffrance } from "@/session/use-en-souffrance";
import {
  Badge,
  Button,
  Card,
  Icon,
  Text,
  useMargesSysteme,
  useToast,
} from "@/ui";

import { ouvrirMagasin } from "./magasin";

const REPLI =
  "Cette version de Vente Facile n'est plus prise en charge. Installez la " +
  "nouvelle version pour continuer à encaisser.";

export function VoileMiseAJour({
  exigence,
}: {
  exigence: SessionAppUpdate | null;
}) {
  // ⚠ Jamais `logout()` en direct : la séquence de déconnexion tente D'ABORD de
  // vider la file, et elle NOMME ce qui ne peut pas partir. C'est exactement ce
  // que le marchand doit lire avant de quitter.
  const { demander: demanderDeconnexion } = useDeconnexion();
  const { refresh } = useSession();
  const { lancer, enCours } = useSynchronisation();
  const enLigne = useEnLigne();
  const toast = useToast();
  const marges = useMargesSysteme();
  const [ouverture, setOuverture] = useState(false);
  const [relecture, setRelecture] = useState(false);

  // ⚠ La lecture vit ICI, pas dans la garde : elle ne tourne donc que sur un
  // terminal réellement bloqué. Elle passe par `lireEnSouffrance`, qui compte les
  // PHOTOS (la seule copie de leur fichier) et refuse de rendre zéro sur une base
  // illisible.
  const vue = useEnSouffrance();
  const carte = carteMiseAJour(vue);

  const urls = exigence?.store_urls ?? [];
  const versionAttendue = exigence?.current_version ?? null;

  const envoyer = () => {
    if (!enLigne) {
      // ⚠ Ni « réessayez », ni « synchronisez » : hors ligne, les deux sont sans
      // effet, et les proposer envoie chercher une panne qui n'existe pas.
      toast.erreur("Sans réseau, rien ne peut être envoyé.");
      return;
    }
    void lancer("bandeau");
  };

  /**
   * ⚠ C'EST LA MAIN QUI LÈVE LA PORTE APRÈS UNE CORRECTION.
   *
   * Un seuil posé trop haut se répare en administration, en vidant le champ.
   * Sans ce bouton, le marchand devrait attendre qu'un cycle automatique parte
   * de lui-même - il est enfermé devant une porte que quelqu'un vient de
   * rouvrir, et rien à l'écran ne le lui permet.
   *
   * ⚠ **LES TROIS ISSUES SE DISENT SÉPARÉMENT.** `refresh` ne lève jamais : elle
   * rend l'instantané PRÉCÉDENT quand le serveur n'a pas répondu. Ignorer son
   * `frais` rendait donc « le serveur est injoignable » indiscernable de « le
   * seuil est toujours posé », et le marchand qu'on venait de libérer pressait un
   * bouton qui ne rapportait rien.
   */
  const verifier = async () => {
    if (!enLigne) {
      toast.erreur("Sans réseau, la version requise ne peut pas être relue.");
      return;
    }
    const seuilAvant = exigence?.minimum_version ?? null;
    setRelecture(true);
    try {
      const relu = await refresh();
      if (!relu.frais) {
        // On ne dit ni « réessayez » ni « synchronisez » : on ne sait pas si le
        // réseau est en cause, et l'un des deux enverrait chercher la mauvaise
        // panne.
        toast.erreur("Le serveur n'a pas répondu : la version requise n'a pas pu être relue.");
        return;
      }
      if ((relu.snapshot?.app_update?.minimum_version ?? null) === seuilAvant) {
        // Le seuil n'a pas bougé. Sans ce mot, le bouton paraît inerte alors
        // qu'il a parfaitement fonctionné. Quand il a bougé, le voile disparaît
        // de lui-même : il n'y a rien à annoncer.
        toast.info("La mise à jour est toujours requise.");
      }
      void lancer("bandeau");
    } finally {
      setRelecture(false);
    }
  };

  const mettreAJour = async () => {
    setOuverture(true);
    try {
      const ouvert = await ouvrirMagasin(urls);
      if (!ouvert) {
        toast.erreur("Aucun magasin d'applications n'a répondu sur ce terminal.");
      }
    } finally {
      setOuverture(false);
    }
  };

  return (
    <View
      className="absolute inset-0 z-50 bg-background"
      style={{ paddingTop: marges.haut, paddingBottom: marges.bas }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        className="px-6"
      >
        <View className="items-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Icon name="Download" size={32} color="primary" />
          </View>
          <Text variant="h4" className="text-center">
            Mise à jour requise
          </Text>
          {versionAttendue ? (
            <Badge tone="primary">{`Version ${versionAttendue} disponible`}</Badge>
          ) : null}
          <Text variant="muted" className="text-center">
            {exigence?.message ?? REPLI}
          </Text>
        </View>

        {/* Ce qui n'est PAS perdu : la question que le marchand se pose. */}
        <Card className="mt-6">
          <View className="flex-row items-start gap-3">
            <Icon
              name={carte.ton === "neutre" ? "ShieldCheck" : "ShieldAlert"}
              size={18}
              color="mutedForeground"
            />
            <View className="min-w-0 flex-1 gap-1">
              <Text variant="label">{carte.titre}</Text>
              <Text variant="bodySmall" className="text-muted-foreground">
                {carte.phrase}
              </Text>
            </View>
          </View>
        </Card>

        <View className="mt-6 gap-3">
          {/*
            L'ordre suit la phrase de la carte : tant qu'un envoi a quelque chose
            à faire partir, c'est lui l'action principale. Sinon ce bouton
            disparaît et « Mettre à jour » devient primaire tout seul - y compris
            quand il reste des opérations RETENUES, qu'un envoi ne clôt pas.
          */}
          {carte.envoi ? (
            <Button
              fullWidth
              leftIcon="Upload"
              disabled={!enLigne}
              loading={enCours}
              onPress={envoyer}
            >
              {carte.envoi}
            </Button>
          ) : null}

          {urls.length > 0 ? (
            <Button
              fullWidth
              variant={carte.envoi ? "outline" : "primary"}
              leftIcon="Download"
              loading={ouverture}
              onPress={() => void mettreAJour()}
            >
              Mettre à jour
            </Button>
          ) : null}

          <Button
            fullWidth
            variant="outline"
            leftIcon="RefreshCw"
            loading={relecture}
            onPress={() => void verifier()}
          >
            Vérifier à nouveau
          </Button>

          <Button
            fullWidth
            variant="ghost"
            leftIcon="LogOut"
            onPress={demanderDeconnexion}
          >
            Se déconnecter
          </Button>
        </View>

        {urls.length > 0 ? (
          <Text variant="caption" className="mt-3 text-center">
            La mise à jour se télécharge depuis le magasin : elle demande une
            connexion.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
