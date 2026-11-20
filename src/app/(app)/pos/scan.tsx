/**
 * Lecture de code-barres ou de QR au comptoir.
 *
 * On lit la colonne locale, déjà indexée, plutôt que `search-barcode/` du
 * serveur : un scan doit répondre en moins d'une seconde, réseau ou pas. La
 * règle est la même des deux côtés : code-barres, puis SKU.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SCAN OUVRE LA SAISIE DE QUANTITÉ, IL N'AJOUTE PLUS UNE UNITÉ D'OFFICE.│
 * │                                                                          │
 * │ Une unité d'office ne servait que l'article vendu à la pièce : un carton │
 * │ scanné, un article pesé ou trois bouteilles demandaient de rouvrir la    │
 * │ ligne au panier. Le scan ouvre donc le MÊME sélecteur que la grille, et  │
 * │ la caméra se TAIT tant qu'il est ouvert : sinon elle relirait le code    │
 * │ posé devant elle et rouvrirait la saisie sous le doigt du caissier.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";

import { articleParCodeBarres, type ArticlePos } from "@/features/pos/catalogue";
import { sessionOuverte } from "@/features/pos/caisse";
import { usePanier } from "@/features/pos/panier";
import { SelecteurDuComptoir } from "@/features/pos/selecteur-du-comptoir";
import {
  phraseDejaEnFile,
  usePropositionCreation,
} from "@/features/inventaire/use-proposition-creation";
import { Button, Icon, Pressable, Screen, Text } from "@/ui";

/**
 * Formats du commerce de détail, plus le QR (souvent le SKU, imprimé par le
 * marchand). En ajouter d'autres ralentit la reconnaissance.
 */
const FORMATS = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] as const;

/**
 * Temps mort après une lecture réussie.
 *
 * La caméra rend le même code à chaque image : sans ce délai, poser un article
 * devant l'objectif en ajouterait trente au panier.
 */
const TEMPS_MORT_MS = 1200;

/**
 * Le MÊME code relu juste après la saisie : ignoré plus longtemps. L'article
 * est encore devant l'objectif quand on referme le sélecteur, et le rouvrir
 * aussitôt ferait croire que la validation n'a rien fait.
 */
const MEME_CODE_MS = 3000;

export default function Scan() {
  // Le scan trouve ce que la grille trouve : TOUT le catalogue vendable. Un
  // lecteur qui refuserait ce que la recherche montre ferait chercher à la
  // main l'article qu'on vient de scanner.
  const panier = usePanier();
  const [permission, demanderPermission] = useCameraPermissions();
  const [message, setMessage] = useState<{
    texte: string;
    /** `alerte` : ajouté, mais l'encaissement se fermera - ni vert, ni rouge. */
    ton: "ok" | "alerte" | "refus";
  } | null>(null);
  const [scanne, setScanne] = useState<ArticlePos | null>(null);
  /** Le code que rien ne porte : il propose la création de l'article. */
  const [introuvable, setIntrouvable] = useState<string | null>(null);
  const proposer = usePropositionCreation();
  // La pile garde cet écran monté pendant la création d'un article : la
  // caméra doit s'y taire, sinon elle relirait le code en arrière-plan.
  const [auPremierPlan, setAuPremierPlan] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setAuPremierPlan(true);
      return () => setAuPremierPlan(false);
    }, [])
  );
  const dernierScan = useRef(0);
  const dernierCode = useRef<string | null>(null);
  const enCours = useRef(false);

  const surLecture = useCallback(async ({ data }: { data: string }) => {
    const maintenant = Date.now();
    if (enCours.current || maintenant - dernierScan.current < TEMPS_MORT_MS) return;
    if (data === dernierCode.current && maintenant - dernierScan.current < MEME_CODE_MS) return;
    enCours.current = true;
    dernierScan.current = maintenant;
    dernierCode.current = data;

    try {
      const session = await sessionOuverte();
      const article = await articleParCodeBarres(data, session?.warehouseId ?? null);
      if (!article) {
        setIntrouvable(data);
        setMessage({ texte: `Aucun article pour le code ${data}.`, ton: "refus" });
        return;
      }
      setIntrouvable(null);
      setMessage(null);
      setScanne(article);
    } finally {
      enCours.current = false;
    }
  }, []);

  /** La saisie refermée : le temps mort repart de MAINTENANT, pas du scan. */
  const fermerSaisie = useCallback(() => {
    dernierScan.current = Date.now();
    setScanne(null);
  }, []);

  // Permission encore en cours de lecture : un écran vide plutôt qu'un
  // clignotement de la demande d'autorisation, qui se refermerait aussitôt.
  if (!permission) {
    return (
      <Screen>
        <View className="flex-1" />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Icon name="ion:camera-outline" size={48} color="mutedForeground" />
          <Text variant="h3" className="text-center">
            Autoriser la caméra
          </Text>
          <Text variant="muted" className="text-center">
            Elle sert uniquement à lire les codes-barres des articles. Aucune
            image n'est enregistrée ni envoyée.
          </Text>
          <Button onPress={demanderPermission}>Autoriser</Button>
          <Button variant="ghost" onPress={() => router.back()}>
            Retour
          </Button>
        </View>
      </Screen>
    );
  }

  const nbLignes = panier.etat.lignes.length;

  /**
   * La barre du bas vit dans le `pied` de `Screen`, et c'est tout l'objet.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ ELLE RÉSERVAIT QUARANTE POINTS EN DUR (`pb-10`), ET C'ÉTAIT TROP PEU.   │
   * │                                                                          │
   * │ Quarante suffit par accident face à une poignée gestuelle (24 dp). Face  │
   * │ à une barre à trois boutons (48 dp), il manque huit points - et ce sont  │
   * │ ceux du bas de « Terminer le scan ». C'était le seul écran de            │
   * │ l'application à vivre hors de `Screen`, donc le seul dont le bas ne      │
   * │ dépendait d'aucune marge système.                                        │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const barreDuBas = (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between">
        <Text variant="body">
          {nbLignes} article{nbLignes > 1 ? "s" : ""} au panier
        </Text>
        <Text variant="h4" numeric>
          {panier.argent(panier.totaux.totalFacture)}
        </Text>
      </View>
      <Button onPress={() => router.back()} disabled={nbLignes === 0} fullWidth>
        Terminer le scan
      </Button>
    </View>
  );

  return (
    <Screen padded={false} pied={barreDuBas}>
      {/* La caméra EST le corps : le viseur, l'en-tête et le bandeau de message
          se posent dessus, dans ce corps, donc au-dessus de la marge du haut
          que `Screen` a déjà réservée. `pt-14` en dur n'a plus lieu d'être. */}
      <View className="flex-1 bg-black">
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...FORMATS] }}
          // La caméra se tait pendant la saisie de quantité.
          onBarcodeScanned={scanne || !auPremierPlan ? undefined : surLecture}
        />

        {/* Viseur : un cadre, pas un masque. Cacher le reste de l'image empêche
            de viser un code mal placé sur un emballage. */}
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View className="h-32 w-72 rounded-2xl border-2 border-white/80" />
        </View>

        <View className="absolute inset-x-0 top-0 flex-row items-center gap-2 px-2 pt-2">
          <Pressable
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-full bg-black/50"
            accessibilityLabel="Fermer le scanner"
          >
            <Icon name="X" size={24} />
          </Pressable>
          <Text variant="body" className="text-white">
            Visez le code-barres ou le QR
          </Text>
        </View>

        {message ? (
          <View
            className={`absolute inset-x-4 bottom-4 rounded-xl px-4 py-3 ${
              message.ton === "ok"
                ? "bg-success"
                : message.ton === "alerte"
                  ? "bg-warning"
                  : "bg-destructive"
            }`}
          >
            <Text variant="body" className="text-white">
              {message.texte}
            </Text>
            {introuvable ? (
              <CreationDuCode code={introuvable} proposer={proposer} />
            ) : null}
          </View>
        ) : null}
      </View>

      <SelecteurDuComptoir
        article={scanne}
        onFermer={fermerSaisie}
        // Ce qui fermera l'encaissement se DIT au scan, sans refuser l'ajout :
        // le caissier qui scanne en série doit l'apprendre maintenant, pas en
        // rendant la monnaie.
        onAjoute={(article, alerte) =>
          setMessage(
            alerte
              ? { texte: `${article.name} ajouté. ${alerte}`, ton: "alerte" }
              : { texte: `${article.name} ajouté.`, ton: "ok" }
          )
        }
      />
    </Screen>
  );
}

/**
 * « Créer l'article de ce code », sous le refus d'un scan. Pas d'ajout au
 * panier : le vendeur revient scanner l'article une fois créé.
 */
function CreationDuCode({
  code,
  proposer,
}: {
  code: string;
  proposer: ReturnType<typeof usePropositionCreation>;
}) {
  const { action, dejaEnFile } = proposer(code, { scanne: true });
  if (dejaEnFile) {
    return (
      <Text variant="caption" className="mt-1 text-white">
        {phraseDejaEnFile(dejaEnFile)}
      </Text>
    );
  }
  if (!action) return null;
  return (
    <View className="mt-2 flex-row">
      <Button size="sm" variant="secondary" onPress={action.onPress}>
        {action.label}
      </Button>
    </View>
  );
}
