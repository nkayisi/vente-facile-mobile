/**
 * Choisir l'imprimante du terminal.
 *
 * Un réglage par APPAREIL, pas par compte : deux caissiers qui se partagent un
 * téléphone se partagent l'imprimante posée à côté d'eux, alors qu'une boutique
 * à deux comptoirs en a deux.
 *
 * L'appairage Bluetooth reste une affaire du SYSTÈME, avec son code PIN. Le
 * refaire ici donnerait une seconde liste de périphériques à tenir, qui
 * divergerait de celle des réglages Android. On lit ce qui est déjà appairé.
 */
import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";

import {
  chercherPeripheriques,
  ecrireReglage,
  imprimer,
  lireReglage,
  peripheriquesAppaires,
  regleDeCalibration,
  type ReglageImprimante,
  type Transport,
} from "@/printing";
import {
  Banner, Button, Card, Divider, Icon, ListItem, Pressable, Screen, Section, Spinner, Text,
} from "@/ui";

/**
 * Les quatre transports, et ce que la PLATEFORME en laisse.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SUR IOS, LE BLUETOOTH CLASSIQUE NE VOIT QUE LES ACCESSOIRES MFi.        │
 * │                                                                          │
 * │ Établi en portant le projet iOS : le module passe par `ExternalAccessory`│
 * │ / `EAAccessoryManager`, qui n'expose QUE les accessoires certifiés par   │
 * │ Apple. Les imprimantes 58 mm du marché ne le sont pas, et aucune         │
 * │ configuration n'y changera rien.                                         │
 * │                                                                          │
 * │ Le dire est tout l'enjeu : sans cela, le marchand choisit « Bluetooth    │
 * │ (classique) », lit « Aucune imprimante trouvée » et conclut que son      │
 * │ imprimante est en panne. Un silence qui se lit comme un autre fait est   │
 * │ exactement ce que ce dépôt combat.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'imprimante intégrée relève du même raisonnement : aucun terminal de caisse
 * iOS n'en expose. Le repli est toujours le PDF, qui ne peut pas manquer.
 */
const TRANSPORTS: {
  id: Transport;
  titre: string;
  detail: string;
  /** Présent : ce transport n'existe pas sur cette plateforme, et dit pourquoi. */
  indisponible?: string;
}[] = [
  {
    id: "embedded",
    titre: "Imprimante du terminal",
    detail: "L'imprimante intégrée d'un terminal de caisse (NYX, Sunmi…).",
    indisponible:
      Platform.OS === "ios"
        ? "Les terminaux de caisse à imprimante intégrée sont des appareils Android."
        : undefined,
  },
  {
    id: "bluetooth",
    titre: "Bluetooth (classique)",
    detail: "La grande majorité des imprimantes 58 mm du marché.",
    indisponible:
      Platform.OS === "ios"
        ? "iOS ne voit que les accessoires certifiés MFi par Apple, ce que ces imprimantes ne sont pas. Employez le Bluetooth basse consommation, ou le PDF."
        : undefined,
  },
  {
    id: "ble",
    titre: "Bluetooth (basse consommation)",
    detail: "Les modèles récents, qui n'ont plus de profil série.",
  },
  {
    id: "pdf",
    titre: "PDF à partager",
    detail: "Sans imprimante : le reçu part en fichier, à envoyer au client.",
  },
];

export default function Imprimante() {
  const [reglage, setReglage] = useState<ReglageImprimante | null>(null);
  const [appareils, setAppareils] = useState<{ adresse: string; nom: string }[]>([]);
  const [recherche, setRecherche] = useState(false);
  const [avis, setAvis] = useState<{ ton: "info" | "warning"; texte: string } | null>(null);

  useEffect(() => {
    lireReglage().then(setReglage);
  }, []);

  const enregistrer = useCallback(async (patch: Partial<ReglageImprimante>) => {
    setReglage((actuel) => {
      if (!actuel) return actuel;
      const suivant = { ...actuel, ...patch };
      void ecrireReglage(suivant);
      return suivant;
    });
  }, []);

  const lister = async (transport: Transport) => {
    setAppareils([]);
    if (transport === "bluetooth") {
      setRecherche(true);
      const trouves = await peripheriquesAppaires();
      setAppareils(trouves);
      setRecherche(false);
      if (trouves.length === 0) {
        setAvis({
          ton: "warning",
          texte:
            "Aucune imprimante appairée. Appairez-la d'abord dans les réglages Bluetooth d'Android, puis revenez ici.",
        });
      }
      return;
    }
    if (transport === "ble") {
      setRecherche(true);
      setAppareils(await chercherPeripheriques());
      setRecherche(false);
    }
  };

  const choisirTransport = async (transport: Transport) => {
    setAvis(null);
    await enregistrer({ transport, adresse: undefined, nom: undefined });
    await lister(transport);
  };

  /**
   * Impression d'essai : la RÈGLE DE CALIBRATION, pas un « bonjour ».
   *
   * Elle vérifie le raccordement ET répond à la seule question qu'aucun calcul
   * ne tranche : combien de colonnes tiennent réellement sur ce papier. On la
   * photographie, on compte, on corrige. Elle emprunte le chemin de
   * production, sinon elle mesurerait autre chose que ce qui s'imprime.
   */
  const essai = async () => {
    if (!reglage) return;
    setAvis(null);
    try {
      const transport = await imprimer(regleDeCalibration(reglage.paperWidth), {
        nom: `calibration-${reglage.paperWidth}mm`,
      });
      setAvis({
        ton: transport === "pdf" ? "warning" : "info",
        texte:
          transport === "pdf"
            ? "Aucune imprimante n'a répondu : la règle est sortie en PDF. Sur papier, elle ne veut rien dire."
            : "Règle envoyée. Photographiez le ticket et comptez les colonnes.",
      });
    } catch (e) {
      setAvis({
        ton: "warning",
        texte: e instanceof Error ? e.message : "L'impression d'essai a échoué.",
      });
    }
  };

  if (!reglage) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  const listable = reglage.transport === "bluetooth" || reglage.transport === "ble";

  return (
    <Screen scroll>
      <View className="flex-row items-center gap-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          accessibilityLabel="Retour"
        >
          <Icon name="ArrowLeft" size={24} />
        </Pressable>
        <Text variant="h4" className="flex-1">
          Imprimante
        </Text>
      </View>

      {avis ? (
        <View className="mt-3">
          <Banner tone={avis.ton === "warning" ? "warning" : "info"} title={avis.texte} />
        </View>
      ) : null}

      <Section title="Comment imprimer">
        <Card>
          {TRANSPORTS.map((t, i) => (
            <View key={t.id}>
              {i > 0 ? <Divider /> : null}
              <ListItem
                title={t.titre}
                // La RAISON prend la place du descriptif : un transport
                // indisponible n'a pas besoin qu'on vante ce qu'il ferait.
                subtitle={t.indisponible ?? t.detail}
                onPress={
                  t.indisponible ? undefined : () => void choisirTransport(t.id)
                }
                trailing={
                  reglage.transport === t.id && !t.indisponible ? (
                    <Icon name="CheckCircle2" size={22} color="primary" />
                  ) : undefined
                }
              />
            </View>
          ))}
        </Card>
      </Section>

      {listable ? (
        <Section
          title={reglage.transport === "bluetooth" ? "Imprimantes appairées" : "Imprimantes détectées"}
        >
          <Card>
            {recherche ? (
              <View className="items-center py-6">
                <Spinner />
                <Text variant="bodySmall" className="mt-2 text-muted-foreground">
                  {reglage.transport === "ble" ? "Recherche en cours…" : "Lecture…"}
                </Text>
              </View>
            ) : appareils.length === 0 ? (
              <View className="px-4 py-5">
                <Text variant="bodySmall" className="text-muted-foreground">
                  Aucune imprimante trouvée.
                </Text>
              </View>
            ) : (
              appareils.map((a, i) => (
                <View key={a.adresse}>
                  {i > 0 ? <Divider /> : null}
                  <ListItem
                    title={a.nom}
                    subtitle={a.adresse}
                    onPress={() => void enregistrer({ adresse: a.adresse, nom: a.nom })}
                    trailing={
                      reglage.adresse === a.adresse ? (
                        <Icon name="CheckCircle2" size={22} color="primary" />
                      ) : undefined
                    }
                  />
                </View>
              ))
            )}
          </Card>
          <View className="mt-3">
            <Button variant="secondary" onPress={() => void lister(reglage.transport)} fullWidth>
              {reglage.transport === "ble" ? "Rechercher" : "Actualiser la liste"}
            </Button>
          </View>
        </Section>
      ) : null}

      <Section title="Papier">
        <Card>
          <ListItem
            title="Largeur"
            subtitle={
              reglage.paperWidth === 58
                ? "58 mm, 42 colonnes (mesuré sur papier)"
                : "80 mm, 57 colonnes (déduit, à confirmer)"
            }
            onPress={() =>
              void enregistrer({ paperWidth: reglage.paperWidth === 58 ? 80 : 58 })
            }
            trailing={<Text variant="body">{reglage.paperWidth} mm</Text>}
          />
          <Divider />
          <ListItem
            title="Couper le papier"
            subtitle="À désactiver sur une imprimante sans massicot."
            onPress={() => void enregistrer({ cut: !reglage.cut })}
            trailing={
              <Icon
                name={reglage.cut ? "CheckCircle2" : "ion:ellipse-outline"}
                size={22}
                color={reglage.cut ? "primary" : "mutedForeground"}
              />
            }
          />
        </Card>
      </Section>

      <View className="mb-10 mt-4">
        <Button variant="secondary" onPress={() => void essai()} fullWidth>
          Imprimer la règle de calibration
        </Button>
        <Text variant="caption" className="mt-2 text-center text-muted-foreground">
          Photographiez le ticket et comptez : le dernier « # » doit toucher le bord.
        </Text>
      </View>
    </Screen>
  );
}
