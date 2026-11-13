/**
 * La surcouche d'un établissement suspendu par Vente Facile.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE DIT QUI PEUT RÉGLER LA SITUATION, ET CE QUI N'EST PAS PERDU.       │
 * │                                                                          │
 * │ Ni le caissier ni le gérant n'y peuvent rien : seul le support lève une │
 * │ suspension. La phrase est celle du serveur, mot pour mot, pour que le    │
 * │ support la reconnaisse au téléphone. Et la carte répond à la question    │
 * │ que le marchand se pose d'abord : « où sont mes ventes ».               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ **« ENVOYER » EST LÉGITIME ICI**, comme sous le voile de mise à jour : le
 * serveur tolère la poussée du journal d'un établissement suspendu, pour ne
 * perdre aucune vente déjà encaissée. Le cycle de synchronisation se réduit
 * d'ailleurs de lui-même à cette poussée (`features/sync/provider.tsx`).
 */
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { useEnLigne } from "@/data/reseau";
import { useSynchronisation } from "@/features/sync/provider";
import { carteSuspension } from "@/session/carte-en-souffrance";
import { useDeconnexion } from "@/session/deconnexion";
import { useSession } from "@/session/provider";
import { useEnSouffrance } from "@/session/use-en-souffrance";
import { Button, Card, Icon, Text, useMargesSysteme, useToast } from "@/ui";

import { etablissementSuspendu } from "./porte";

const PHRASE_SUSPENDU =
  "Cet établissement est suspendu par Vente Facile. Contactez le support.";

export function VoileSuspension({ nom }: { nom: string }) {
  // ⚠ Jamais `logout()` en direct : la séquence de déconnexion tente d'abord de
  // vider la file, et elle NOMME ce qui ne peut pas partir.
  const { demander: demanderDeconnexion } = useDeconnexion();
  const { refresh } = useSession();
  const { lancer, enCours } = useSynchronisation();
  const enLigne = useEnLigne();
  const toast = useToast();
  const marges = useMargesSysteme();
  const [relecture, setRelecture] = useState(false);

  const carte = carteSuspension(useEnSouffrance());

  const envoyer = () => {
    if (!enLigne) {
      toast.erreur("Sans réseau, rien ne peut être envoyé.");
      return;
    }
    void lancer("bandeau");
  };

  /**
   * La main qui lève le voile après une réactivation : le réveil du terminal
   * répond même sur un établissement suspendu, et c'est lui qui la rapporte.
   * Les trois issues se disent séparément, comme sous le voile de mise à jour.
   */
  const verifier = async () => {
    if (!enLigne) {
      toast.erreur("Sans réseau, l'état de l'établissement ne peut pas être relu.");
      return;
    }
    setRelecture(true);
    try {
      const relu = await refresh();
      if (!relu.frais) {
        toast.erreur("Le serveur n'a pas répondu : l'état de l'établissement n'a pas pu être relu.");
        return;
      }
      if (etablissementSuspendu(relu.snapshot?.organization)) {
        toast.info("L'établissement est toujours suspendu.");
      }
    } finally {
      setRelecture(false);
    }
  };

  return (
    <View
      className="absolute inset-0 z-50 bg-background"
      style={{ paddingTop: marges.haut, paddingBottom: marges.bas }}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} className="px-6">
        <View className="items-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <Icon name="Ban" size={32} color="destructive" />
          </View>
          <Text variant="h4" className="text-center">
            Établissement suspendu
          </Text>
          <Text variant="label" className="text-center">
            {nom}
          </Text>
          <Text variant="muted" className="text-center">
            {PHRASE_SUSPENDU}
          </Text>
        </View>

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
          {carte.envoi ? (
            <Button fullWidth leftIcon="Upload" disabled={!enLigne} loading={enCours} onPress={envoyer}>
              {carte.envoi}
            </Button>
          ) : null}
          <Button
            fullWidth
            variant={carte.envoi ? "outline" : "primary"}
            leftIcon="RefreshCw"
            loading={relecture}
            onPress={() => void verifier()}
          >
            Vérifier à nouveau
          </Button>
          <Button fullWidth variant="ghost" leftIcon="LogOut" onPress={demanderDeconnexion}>
            Se déconnecter
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
