/**
 * Déverrouillage, par le verrou de l'APPAREIL.
 *
 * Aucun appel réseau : c'est le point d'entrée d'un terminal qui peut être
 * hors ligne depuis trois semaines. C'est le système qui vérifie l'identité, et
 * il choisit lui-même par quoi - code, schéma, mot de passe, empreinte, visage.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ISSUE DE SECOURS EST PERMANENTE, ET C'EST LA PIÈCE MAÎTRESSE.         │
 * │                                                                          │
 * │ Elle ne vivait que dans la branche « trop d'essais » de l'ancien code    │
 * │ PIN. Cette branche n'existe plus : le compteur appartient à l'OS, et     │
 * │ `expo-local-authentication` ne distingue même pas un blocage temporaire  │
 * │ d'un blocage définitif - les deux natifs rendent `lockout` (voir         │
 * │ `session/lock.ts`). On ne peut donc plus savoir QUAND offrir une sortie. │
 * │                                                                          │
 * │ Elle est donc offerte TOUT LE TEMPS. C'est la seule chose entre un       │
 * │ marchand qui a oublié le code de son TÉLÉPHONE et une caisse qu'il ne    │
 * │ peut plus ouvrir. Elle n'efface rien : `useDeconnexion` envoie d'abord   │
 * │ ce qui attend, nomme ce qui ne peut pas partir, et laisse toujours       │
 * │ « se déconnecter sans effacer ».                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useDeconnexion } from "@/session/deconnexion";
import { deverrouiller, libelleBiometrie } from "@/session/lock";
import { useSession } from "@/session/provider";
import { Banner, Button, Icon, Screen, Text } from "@/ui";

export default function Unlock() {
  const { snapshot, markUnlocked } = useSession();
  const { demander } = useDeconnexion();

  const [message, setMessage] = useState<string | null>(null);
  const [temporise, setTemporise] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [biometrie, setBiometrie] = useState<string | null>(null);

  const tenter = useCallback(async () => {
    setEnCours(true);
    const verdict = await deverrouiller();
    setEnCours(false);

    switch (verdict.statut) {
      case "ok":
        markUnlocked();
        return;
      case "sans_verrou":
        // ⚠ ON ENTRE, ET C'EST LE FILET ANTI-ENFERMEMENT. Le marchand a retiré
        // le verrou de son téléphone pendant que l'application était fermée :
        // il n'y a plus rien à vérifier, et refuser l'entrée fermerait la
        // caisse pour de bon. `provider.tsx` fait la même lecture au premier
        // plan, souvent avant même qu'on arrive ici.
        markUnlocked();
        return;
      case "annule":
        setTemporise(false);
        setMessage(null);
        return;
      case "temporise":
        setTemporise(true);
        setMessage(null);
        return;
      case "indisponible":
        setTemporise(false);
        setMessage("Le déverrouillage n'a pas abouti. Réessayez.");
    }
  }, [markUnlocked]);

  /**
   * ⚠ UNE SEULE INVITATION AUTOMATIQUE PAR MONTAGE, ET LE VERROU EST UN `ref`.
   *
   * Sur iOS, l'invitation système rend l'application `inactive` : un effet qui
   * se relancerait sur un état modifié par la tentative rouvrirait le prompt
   * aussitôt fermé, et le marchand ne pourrait plus l'annuler. C'est la boucle
   * annulation → ré-invitation classique, et elle ne se voit pas en relisant.
   */
  const dejaTente = useRef(false);
  useEffect(() => {
    void libelleBiometrie().then(setBiometrie);
    if (dejaTente.current) return;
    dejaTente.current = true;
    void tenter();
  }, [tenter]);

  return (
    // ⚠ LE RYTHME VIENT D'UN `gap`, PAS DE MARGES VERTICALES. Sous `centre`,
    // une marge de tête décale le bloc SOUS l'axe au lieu de l'espacer, et
    // c'est la première chose qu'on remet par réflexe - un garde-fou de
    // doctrine la refuse.
    <Screen centre>
      <View className="gap-8">
        <View className="items-center">
          <Text variant="h3">{snapshot?.organization.name ?? "Vente Facile"}</Text>
          <Text variant="muted" className="mt-1">
            {snapshot?.user.full_name}
          </Text>
        </View>

        <View className="items-center gap-4">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-accent">
            <Icon name="Lock" size={32} color="accentForeground" />
          </View>
          <Text variant="body" className="text-center text-muted-foreground">
            {biometrie
              ? `Déverrouillez avec ${biometrie.toLowerCase()} ou le code de l'appareil.`
              : "Déverrouillez avec le code de l'appareil."}
          </Text>
        </View>

        {temporise ? (
          <Banner
            tone="warning"
            title="Trop de tentatives"
            // ⚠ AUCUN COMPTE À REBOURS. Le minuteur appartient au système, on ne
            // peut ni le lire ni le prévoir : annoncer « réessayez dans trente
            // secondes » serait une durée inventée. Et comme `lockout` recouvre
            // aussi le blocage définitif, la seconde phrase est la vraie issue.
            message="Le système a suspendu le déverrouillage. Réessayez dans un moment, ou reconnectez-vous avec votre mot de passe."
          />
        ) : message ? (
          <Banner tone="destructive" title="Déverrouillage impossible" message={message} />
        ) : null}

        <View className="gap-3">
          <Button fullWidth size="lg" onPress={tenter} loading={enCours}>
            Déverrouiller
          </Button>
          {/* Voir l'encadré de tête : offerte dans TOUS les états, sans condition. */}
          <Button fullWidth variant="ghost" onPress={demander}>
            Se reconnecter avec le mot de passe
          </Button>
        </View>
      </View>
    </Screen>
  );
}
