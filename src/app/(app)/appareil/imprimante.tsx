/**
 * Choisir l'imprimante du terminal.
 *
 * Un réglage par APPAREIL, pas par compte : deux caissiers qui se partagent un
 * téléphone se partagent l'imprimante posée à côté d'eux, alors qu'une boutique
 * à deux comptoirs en a deux.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE LIGNE BLUETOOTH, ET C'EST TOUT L'OBJET DE CET ÉCRAN.          │
 * │                                                                          │
 * │ Il en proposait deux, « classique » et « basse consommation ». Personne  │
 * │ ne sait de quel protocole relève l'imprimante qu'il vient d'acheter, et  │
 * │ se tromper donnait EXACTEMENT le même message que ne pas avoir           │
 * │ d'imprimante. On cherche donc des deux côtés, on présente une liste, et  │
 * │ le protocole est relevé quand le marchand désigne sa machine.            │
 * │                                                                          │
 * │ Les mots « série », « SPP », « GATT » et « BLE » n'atteignent jamais cet │
 * │ écran : ce sont des noms de protocole, pas des choses qu'on achète.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { router } from "expo-router";

import {
  activerBluetooth,
  annulerRecherche,
  appairerImprimante,
  avecImprimanteChoisie,
  capacitesImprimante,
  chercherImprimantes,
  demanderPermissionsBluetooth,
  DENSITES,
  densiteValide,
  ecrireReglage,
  ErreurImpression,
  imprimantesAppairees,
  imprimer,
  largeurPour,
  lireReglage,
  piloteCourant,
  regleDeCalibration,
  type CapacitesImprimante,
  type ImprimanteTrouvee,
  type RechercheImprimantes,
  type ReglageImprimante,
  type TransportId,
} from "@/printing";
import {
  Banner, Button, Card, Divider, Icon, ListeChoix, ListItem, Pressable, Screen, Section,
  Sheet, Spinner, Text,
} from "@/ui";

/**
 * Ce que la tête chauffe réellement, en millimètres.
 *
 * 384 points sur 58 mm et 576 sur 80, à 203 points par pouce : le reste est la
 * marge mécanique du chariot. C'est le seul nombre de cet écran qui se vérifie
 * à la règle, sur le bandeau de la calibration.
 */
const bandeImprimee = (largeur: 58 | 80) => (largeur === 80 ? 72 : 48);

/**
 * Les trois transports, et ce que la PLATEFORME en laisse.
 *
 * ⚠ LA LIGNE BLUETOOTH RESTE CHOISISSABLE SUR iOS, et c'est un changement. Elle
 * y était barrée au motif que le profil série passe par `ExternalAccessory`,
 * qui n'expose que les accessoires certifiés MFi par Apple - ce que les 58 mm
 * du marché ne sont pas. C'est toujours vrai du SÉRIE, et faux de la basse
 * consommation, qui marche très bien sur iPhone. Barrer l'option entière
 * priverait donc un marchand sous iOS d'une imprimante qu'il possède.
 *
 * Le texte le DIT plutôt que de se taire : sans cela, il chercherait une
 * imprimante série qui ne peut pas apparaître et conclurait à une panne.
 */
const TRANSPORTS: {
  id: TransportId;
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
    titre: "Imprimante Bluetooth",
    detail:
      Platform.OS === "ios"
        ? "Les modèles récents. Sur iPhone, les imprimantes plus anciennes n'apparaissent pas : Apple ne les reconnaît pas."
        : "Les imprimantes 58 mm du marché, anciennes comme récentes.",
  },
  {
    id: "pdf",
    titre: "PDF à partager",
    detail: "Sans imprimante : le reçu part en fichier, à envoyer au client.",
  },
];

/** Ce que la rangée dit de l'imprimante, sans nommer aucun protocole. */
function etatDeLigne(i: ImprimanteTrouvee, choisie: boolean): string {
  // Celle qui imprime se nomme comme telle : c'est ce que le marchand vient
  // vérifier, et cela vaut qu'elle soit allumée ou non.
  if (choisie) return "Imprimante choisie";
  if (i.appairee) return "Déjà appairée à ce terminal";
  return i.lien === "spp" ? "À appairer" : "Détectée à proximité";
}

/** Le motif d'un échec d'impression, en une phrase. */
function motifDEchec(e: unknown): string {
  if (e instanceof ErreurImpression) {
    switch (e.raison) {
      case "permission":
        return "Android n'autorise pas encore le Bluetooth. Accordez-le ci-dessus.";
      case "eteint":
        return "Le Bluetooth est éteint.";
      case "aucune_imprimante":
        return "Aucune imprimante n'est choisie.";
      default:
        return e.message;
    }
  }
  return e instanceof Error ? e.message : "L'impression d'essai a échoué.";
}

export default function Imprimante() {
  const [reglage, setReglage] = useState<ReglageImprimante | null>(null);
  const [recherche, setRecherche] = useState<RechercheImprimantes | null>(null);
  const [enRecherche, setEnRecherche] = useState(false);
  const [appairageEnCours, setAppairageEnCours] = useState<string | null>(null);
  const [avis, setAvis] = useState<{ ton: "info" | "warning"; texte: string } | null>(null);

  useEffect(() => {
    lireReglage().then(setReglage);
  }, []);

  // Une découverte laissée en cours mange la radio et la batterie.
  useEffect(() => () => void annulerRecherche(), []);

  /**
   * Les appairées, dès l'arrivée sur l'écran.
   *
   * Sans cela, un marchand qui ouvre ce réglage pour vérifier son imprimante
   * lit « Aucune imprimante » alors qu'elle est choisie et qu'elle imprime :
   * la liste ne portait que le résultat d'une recherche qui n'a pas tourné.
   * Les appairées sont immédiates, et ne sollicitent aucune radio.
   */
  const listeDemandee = useRef(false);
  useEffect(() => {
    if (!reglage || reglage.transport !== "bluetooth" || listeDemandee.current) return;
    listeDemandee.current = true;
    void imprimantesAppairees().then(setRecherche);
  }, [reglage]);

  /**
   * Enregistre un réglage, et ATTEND que la base l'ait pris.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ UNE ÉCRITURE QUI ÉCHOUE EN SILENCE EST PIRE QU'UN RÉGLAGE ABSENT.       │
   * │                                                                          │
   * │ L'écriture partait en `void`, sans `await` et sans `catch`, DEPUIS       │
   * │ l'updater de `setReglage`. Trois conséquences : l'échec ne se voyait      │
   * │ nulle part - l'écran affichait « 80 mm » pendant que la base gardait 58, │
   * │ et tout sortait en 58 sans que rien ne le dise ; un effet de bord dans   │
   * │ un updater est appelé deux fois sous StrictMode ; et l'impression        │
   * │ d'essai, qui lit la BASE, pouvait mesurer autre chose que ce que l'écran │
   * │ affichait - c'est-à-dire l'exact contraire de ce qu'une règle de         │
   * │ calibration existe pour faire.                                           │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const enregistrer = useCallback(
    async (patch: Partial<ReglageImprimante>) => {
      if (!reglage) return;
      const suivant = { ...reglage, ...patch };
      try {
        await ecrireReglage(suivant);
        setReglage(await lireReglage());
      } catch {
        setAvis({
          ton: "warning",
          texte:
            "Le réglage n'a pas pu être enregistré sur cet appareil. Il n'est pas pris en compte : réessayez.",
        });
        setReglage(await lireReglage().catch(() => reglage));
      }
    },
    [reglage]
  );

  const [panneauDensite, setPanneauDensite] = useState(false);
  const [panneauLargeur, setPanneauLargeur] = useState(false);
  /**
   * Ce que la machine dit d'elle-même.
   *
   * `null` tant qu'on n'a pas demandé, ou quand elle ne répond pas : l'écran
   * s'en tient alors au réglage, comme avant que la question se pose.
   */
  const [capacites, setCapacites] = useState<CapacitesImprimante | null>(null);

  useEffect(() => {
    void capacitesImprimante().then(setCapacites);
  }, []);

  /**
   * Les appairées d'abord, le balayage ensuite.
   *
   * Les premières sont immédiates et ce sont presque toujours celles qu'on
   * cherche : laisser un tourniquet une douzaine de secondes devant une
   * imprimante déjà connue n'apprend rien à personne.
   */
  const lister = useCallback(async () => {
    setEnRecherche(true);
    try {
      const rapide = await imprimantesAppairees();
      setRecherche(rapide);
      // Un obstacle nommé ne se lève pas en balayant : inutile d'attendre.
      if (rapide.etat === "ok") setRecherche(await chercherImprimantes());
    } finally {
      setEnRecherche(false);
    }
  }, []);

  const autoriser = useCallback(async () => {
    const etat = await demanderPermissionsBluetooth();
    if (etat.etat === "accordees" || etat.etat === "sans_objet") {
      await lister();
      return;
    }
    setRecherche({
      etat: "permission_refusee",
      definitif: etat.etat === "refusees_definitivement",
    });
  }, [lister]);

  const allumerRadio = useCallback(async () => {
    // ⚠ APRÈS l'octroi, jamais avant : `requestBluetoothEnabled` exige déjà
    // `BLUETOOTH_CONNECT` sur Android 12+, et échouerait sans un mot.
    await activerBluetooth();
    await lister();
  }, [lister]);

  const choisirTransport = async (transport: TransportId) => {
    setAvis(null);
    setRecherche(null);
    await enregistrer({ transport, adresse: undefined, nom: undefined, lien: undefined });
    if (transport !== "bluetooth") return;
    // La demande est liée au GESTE, seul endroit où une invite système a sa
    // place : jamais à l'impression, où un client attend au comptoir.
    await autoriser();
  };

  const choisirImprimante = async (imprimante: ImprimanteTrouvee) => {
    setAvis(null);
    if (!imprimante.appairee && imprimante.lien === "spp") {
      setAppairageEnCours(imprimante.adresse);
      try {
        // La boîte de dialogue du SYSTÈME porte le code PIN : on la déclenche,
        // on ne la réimplémente pas.
        const ok = await appairerImprimante(imprimante.adresse);
        if (!ok) {
          setAvis({
            ton: "warning",
            texte: `L'appairage de « ${imprimante.nom} » n'a pas abouti. Vérifiez qu'elle est allumée et à portée.`,
          });
          return;
        }
      } catch (e) {
        setAvis({ ton: "warning", texte: motifDEchec(e) });
        return;
      } finally {
        setAppairageEnCours(null);
      }
    }
    await enregistrer({
      adresse: imprimante.adresse,
      nom: imprimante.nom,
      // ⚠ LA LIGNE QUI FAIT TOUT LE LOT : le protocole est relevé ICI, quand le
      // marchand désigne sa machine, et plus rien n'est deviné à l'impression.
      lien: imprimante.lien,
    });
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
      // La largeur vient de la BASE, jamais de l'état de l'écran : c'est elle
      // que `imprimer()` consultera pour rendre le document. Les lire à deux
      // endroits ferait graduer la règle sur une largeur et l'imprimer sur une
      // autre, donc mesurer autre chose que ce qui sort.
      const enBase = await lireReglage();
      // ⚠ ET CELLE DU TRANSPORT RÉELLEMENT RETENU. Graduer la règle sur 80
      // puis l'imprimer par un transport qui retombe à 58 mesurerait exactement
      // le contraire de ce qu'une calibration existe pour établir.
      const paperWidth = largeurPour(await piloteCourant(enBase), enBase);
      const densiteEssai = densiteValide(enBase.densite, paperWidth);
      const transport = await imprimer(regleDeCalibration(paperWidth, densiteEssai), {
        nom: `calibration-${paperWidth}mm-d${densiteEssai}`,
      });
      setAvis({
        ton: transport === "pdf" && enBase.transport !== "pdf" ? "warning" : "info",
        texte:
          transport === "pdf" && enBase.transport !== "pdf"
            ? "Aucune imprimante n'a répondu : la règle est sortie en PDF. Sur papier, elle ne veut rien dire."
            : "Règle envoyée. Photographiez le ticket et comptez les colonnes.",
      });
    } catch (e) {
      setAvis({ ton: "warning", texte: motifDEchec(e) });
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

  const listable = reglage.transport === "bluetooth";
  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LE 80 mm SUR UNE IMPRIMANTE INTÉGRÉE EST PRESQUE TOUJOURS UNE FAUSSE │
  // │ MANŒUVRE, ET C'EST TOUT CE QU'ON PEUT EN DIRE.                       │
  // │                                                                      │
  // │ La largeur du papier ne se détecte pas : `setPaperWidth` est un       │
  // │ RÉGLAGE de ce qui est chargé, pas une question sur la machine, et le  │
  // │ papier chargé n'est la propriété d'aucun matériel. On ne peut donc ni │
  // │ corriger ni refuser - seulement DIRE, là où le réglage se change, et  │
  // │ offrir le chemin du retour.                                          │
  // │                                                                      │
  // │ C'est ce réglage qui a déformé le ticket : la page partait dessinée   │
  // │ pour 80 mm - mêmes corps de police étalés sur 41 colonnes au lieu de  │
  // │ 29 - rastérisée sur 576 points, sur un papier de 58.                  │
  // └──────────────────────────────────────────────────────────────────────┘
  const largeurSuspecte = reglage.transport === "embedded" && reglage.paperWidth === 80;
  const densite = densiteValide(reglage.densite, reglage.paperWidth);
  // L'imprimante CHOISIE figure toujours dans la liste, même éteinte, même
  // avant toute recherche : la voir disparaître se lit comme un réglage perdu.
  const imprimantes = avecImprimanteChoisie(
    recherche?.etat === "ok" ? recherche.imprimantes : [],
    reglage
  );

  /**
   * Ce que la recherche a donné, et ce qu'on peut y faire.
   *
   * ⚠ EXHAUSTIF PAR CONSTRUCTION. Un état nouveau fera échouer la compilation
   * plutôt que de disparaître de l'écran : c'est exactement ce qui manquait,
   * quand toute panne se rendait par une liste vide.
   */
  const bandeau = () => {
    if (!recherche || enRecherche) return null;
    switch (recherche.etat) {
      case "permission_refusee":
        return recherche.definitif ? (
          <Banner
            tone="warning"
            title="Autorisation refusée"
            message="Android ne la redemandera plus. Ouvrez les réglages de l'application pour l'accorder."
            action={{ label: "Ouvrir les réglages", onPress: () => void Linking.openSettings() }}
          />
        ) : (
          <Banner
            tone="info"
            title="Autorisation Bluetooth requise"
            message="Android demande votre accord pour chercher une imprimante et lui parler."
            action={{ label: "Autoriser", onPress: () => void autoriser() }}
          />
        );
      case "bluetooth_eteint":
        return (
          <Banner
            tone="warning"
            title="Le Bluetooth est éteint."
            message="Allumez-le pour trouver votre imprimante."
            action={
              Platform.OS === "android"
                ? { label: "Activer le Bluetooth", onPress: () => void allumerRadio() }
                : undefined
            }
          />
        );
      case "localisation_coupee":
        return (
          <Banner
            tone="warning"
            title="La localisation est coupée."
            message="Cette version d'Android l'exige pour chercher une imprimante. Allumez-la dans les réglages du téléphone, puis réessayez."
            action={{ label: "Réessayer", onPress: () => void lister() }}
          />
        );
      case "sans_bluetooth":
        return (
          <Banner
            tone="warning"
            title="Cet appareil n'a pas de Bluetooth utilisable."
            message="Employez l'imprimante du terminal, ou le PDF."
          />
        );
      case "erreur":
        return (
          <Banner
            tone="warning"
            title="La recherche a échoué."
            message={recherche.message}
            action={{ label: "Réessayer", onPress: () => void lister() }}
          />
        );
      case "ok":
        if (recherche.imprimantes.length > 0) {
          return recherche.avertissement ? (
            <Banner tone="info" title={recherche.avertissement} />
          ) : null;
        }
        if (reglage?.adresse) return null;
        return (
          <Banner
            tone="info"
            title="Aucune imprimante trouvée."
            message="Allumez-la et rapprochez-la du terminal, puis cherchez de nouveau."
            action={{ label: "Réessayer", onPress: () => void lister() }}
          />
        );
      default: {
        const jamais: never = recherche;
        return jamais;
      }
    }
  };

  const avisRecherche = bandeau();

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
                onPress={t.indisponible ? undefined : () => void choisirTransport(t.id)}
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
        <Section title="Imprimantes">
          {avisRecherche ? <View className="mb-3">{avisRecherche}</View> : null}
          <Card>
            {enRecherche ? (
              <View className="items-center py-6">
                <Spinner />
                <Text variant="bodySmall" className="mt-2 text-muted-foreground">
                  Recherche en cours…
                </Text>
              </View>
            ) : imprimantes.length === 0 ? (
              <View className="px-4 py-5">
                <Text variant="bodySmall" className="text-muted-foreground">
                  Aucune imprimante pour l&apos;instant.
                </Text>
              </View>
            ) : (
              imprimantes.map((a, i) => (
                <View key={a.adresse}>
                  {i > 0 ? <Divider /> : null}
                  <ListItem
                    title={a.nom}
                    // L'adresse reste : deux imprimantes du même modèle portent
                    // le même nom, et il faut bien les distinguer.
                    subtitle={`${etatDeLigne(a, reglage.adresse === a.adresse)} · ${a.adresse}`}
                    onPress={() => void choisirImprimante(a)}
                    trailing={
                      appairageEnCours === a.adresse ? (
                        <Spinner />
                      ) : reglage.adresse === a.adresse ? (
                        <Icon name="CheckCircle2" size={22} color="primary" />
                      ) : undefined
                    }
                  />
                </View>
              ))
            )}
          </Card>
          <View className="mt-3">
            <Button
              variant="secondary"
              onPress={() => void lister()}
              loading={enRecherche}
              fullWidth
            >
              Rechercher les imprimantes
            </Button>
          </View>
        </Section>
      ) : null}

      <Section title="Papier">
        {largeurSuspecte ? (
          <Banner
            tone="warning"
            title="Le ticket est dessiné pour 80 mm"
            message="L'imprimante d'un terminal de caisse est presque toujours une 58 mm. À 80 mm, le texte s'étale, se décale, et la colonne des montants peut sortir du papier."
            action={{ label: "Revenir à 58 mm", onPress: () => void enregistrer({ paperWidth: 58 }) }}
          />
        ) : null}
        <Card>
          {/* ┌────────────────────────────────────────────────────────────┐
              │ CE N'EST PLUS UNE BASCULE À UN APPUI.                      │
              │                                                            │
              │ Elle faisait passer de 58 à 80 sans un mot, et la règle de │
              │ calibration conseille elle-même « essayez l'autre largeur » │
              │ devant un ticket trop étroit. Un appui de trop, et la page  │
              │ partait dessinée pour 80 mm sur une tête de 58 : contenu    │
              │ centré décalé aux trois quarts de la bande, colonne des     │
              │ montants hors du papier.                                    │
              └────────────────────────────────────────────────────────────┘ */}
          <ListItem
            title="Largeur du papier"
            subtitle={`Bande imprimée de ${bandeImprimee(reglage.paperWidth)} mm. Les 5 mm de chaque bord sont mécaniques.`}
            onPress={() => setPanneauLargeur(true)}
            trailing={<Text variant="body">{reglage.paperWidth} mm</Text>}
            chevron
          />
          <Divider />
          {/* ┌──────────────────────────────────────────────────────────────┐
              │ LA DENSITÉ NE SE DEVINE PAS DEPUIS UN BUREAU.               │
              │                                                             │
              │ `setPrinterDensity` n'avait jamais eu d'appelant : chaque    │
              │ terminal imprimait à la valeur d'usine. C'est le levier le   │
              │ plus direct sur un texte fin, et le seul qui ne touche à     │
              │ aucune mise en page - mais un papier bon marché bave à       │
              │ densité trop haute et la tête s'use. Le marchand essaie,     │
              │ photographie, et garde ce qui sort net.                      │
              └──────────────────────────────────────────────────────────────┘ */}
          <ListItem
            title="Densité d'impression"
            subtitle="Plus haut = plus noir, donc plus lisible. Trop haut, un papier bon marché bave."
            onPress={() => setPanneauDensite(true)}
            trailing={<Text variant="body">{densite}</Text>}
            chevron
          />
          <Divider />
          {listable ? (
            <>
              {/* ┌──────────────────────────────────────────────────────────┐
                  │ LE TICKET PART EN IMAGE, ET C'EST CE QUI LE REND        │
                  │ IDENTIQUE D'UNE IMPRIMANTE À L'AUTRE.                    │
                  │                                                          │
                  │ Une machine très ancienne peut ne pas savoir recevoir     │
                  │ une image, et elle n'en dit rien : elle imprime du        │
                  │ charabia. On ne peut pas le détecter, le marchand le voit │
                  │ sur son papier. D'où cet interrupteur, plutôt qu'un       │
                  │ défaut deviné pour un matériel qu'on n'a jamais vu.       │
                  └──────────────────────────────────────────────────────────┘ */}
              <ListItem
                title="Texte simple"
                subtitle="Mode de secours : si votre imprimante sans fil ne sort que du charabia. Le ticket perd son bandeau et ses tailles de texte."
                onPress={() => void enregistrer({ texteSimple: !reglage.texteSimple })}
                trailing={
                  <Icon
                    name={reglage.texteSimple ? "CheckCircle2" : "ion:ellipse-outline"}
                    size={22}
                    color={reglage.texteSimple ? "primary" : "mutedForeground"}
                  />
                }
              />
              <Divider />
            </>
          ) : null}
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
        {capacites?.modele || capacites?.service ? (
          /* Ce que la machine dit d'elle-même. Cela ne décide de rien : cela
             répond à « quelle est cette imprimante », quand un ticket sort de
             travers et qu'on cherche - c'est le seul endroit où ça se lit. */
          <Text variant="caption" className="mt-2 text-center text-muted-foreground">
            Imprimante intégrée : {capacites.modele || "modèle inconnu"}
            {capacites.service ? ` · service ${capacites.service}` : ""}
          </Text>
        ) : null}
        <Text variant="caption" className="mt-2 text-center text-muted-foreground">
          Photographiez le ticket : la bande noire doit mesurer{" "}
          {bandeImprimee(reglage.paperWidth)} mm, et les trois tailles de texte
          doivent se lire.
        </Text>
      </View>

      <Sheet
        ouvert={panneauLargeur}
        onFermer={() => setPanneauLargeur(false)}
        titre="Largeur du papier"
      >
        <Text variant="bodySmall" className="mb-3 text-muted-foreground">
          C&apos;est la largeur du ROULEAU, pas celle du texte. La tête
          n&apos;imprime pas jusqu&apos;au bord : environ 5 mm de chaque côté
          restent blancs quoi qu&apos;on fasse.
        </Text>
        <ListeChoix
          options={[
            { valeur: "58", label: "58 mm", detail: "Bande imprimée de 48 mm. Mesuré sur papier." },
            {
              valeur: "80",
              label: "80 mm",
              detail:
                reglage.transport === "embedded"
                  ? "Pour une imprimante externe. L'imprimante d'un terminal de caisse est presque toujours une 58 mm."
                  : "Bande imprimée de 72 mm.",
            },
          ]}
          valeur={String(reglage.paperWidth)}
          onChoisir={(v) => {
            if (v) void enregistrer({ paperWidth: v === "80" ? 80 : 58 });
            setPanneauLargeur(false);
          }}
        />
      </Sheet>

      <Sheet
        ouvert={panneauDensite}
        onFermer={() => setPanneauDensite(false)}
        titre="Densité d'impression"
      >
        <Text variant="bodySmall" className="mb-3 text-muted-foreground">
          Imprimez la règle de calibration après chaque essai : elle porte la
          densité employée, pour que vous sachiez de quel réglage vient quel
          papier.
        </Text>
        {/* Les valeurs viennent de l'AIDL du constructeur, par largeur : 58 mm
            descend à 80, 80 mm s'arrête à 100. Une valeur hors plage est
            refusée par le service, sans que rien ne le signale. */}
        <ListeChoix
          options={DENSITES[reglage.paperWidth].map((d) => ({
            valeur: String(d),
            label: String(d),
            detail:
              d === 80
                ? "La plus claire"
                : d === 130
                  ? "La plus noire : réservez-la au papier de qualité"
                  : d === 110
                    ? "Réglage par défaut"
                    : undefined,
          }))}
          valeur={String(densite)}
          onChoisir={(v) => {
            if (v) void enregistrer({ densite: Number(v) });
            setPanneauDensite(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}
