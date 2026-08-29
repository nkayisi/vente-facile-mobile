/**
 * Lecture de code-barres au comptoir.
 *
 * L'endpoint `GET /products/search-barcode/` existe côté serveur depuis
 * l'origine sans qu'aucun écran web ne l'appelle : le mobile est son premier
 * consommateur. Ici, on ne l'appelle pas non plus, on lit la colonne locale,
 * déjà indexée. Un scan doit répondre en moins d'une seconde, réseau ou pas.
 *
 * Un scan AJOUTE directement une unité, il n'ouvre pas le sélecteur. C'est le
 * geste du comptoir : on passe les articles un par un et on relit le panier à
 * la fin. Repasser le même article l'incrémente, comme en supermarché.
 */
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";

import { articleParCodeBarres } from "@/features/pos/catalogue";
import { sessionOuverte } from "@/features/pos/caisse";
import { usePanier } from "@/features/pos/panier";
import { Button, Icon, Pressable, Screen, Text } from "@/ui";

/** Formats du commerce de détail. En ajouter ralentit la reconnaissance. */
const FORMATS = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"] as const;

/**
 * Temps mort après une lecture réussie.
 *
 * La caméra rend le même code à chaque image : sans ce délai, poser un article
 * devant l'objectif en ajouterait trente au panier.
 */
const TEMPS_MORT_MS = 1200;

export default function Scan() {
  const panier = usePanier();
  const [permission, demanderPermission] = useCameraPermissions();
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);
  const dernierScan = useRef(0);
  const enCours = useRef(false);

  const surLecture = useCallback(
    async ({ data }: { data: string }) => {
      const maintenant = Date.now();
      if (enCours.current || maintenant - dernierScan.current < TEMPS_MORT_MS) return;
      enCours.current = true;
      dernierScan.current = maintenant;

      try {
        const session = await sessionOuverte();
        const article = await articleParCodeBarres(data, session?.warehouseId ?? null);

        if (!article) {
          setMessage({ texte: `Aucun article pour le code ${data}.`, ok: false });
          return;
        }

        const saisie = { packages: 0, loose: 1 };
        const refus = panier.verifier(article, saisie);
        if (refus) {
          setMessage({ texte: refus, ok: false });
          return;
        }

        panier.envoyer({
          type: "ajouter",
          article,
          saisie,
          prix: Number(article.selling_price) || 0,
        });
        setMessage({ texte: `${article.name} ajouté.`, ok: true });
      } finally {
        enCours.current = false;
      }
    },
    [panier]
  );

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

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...FORMATS] }}
        onBarcodeScanned={surLecture}
      />

      {/* Viseur : un cadre, pas un masque. Cacher le reste de l'image empêche
          de viser un code mal placé sur un emballage. */}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="h-32 w-72 rounded-2xl border-2 border-white/80" />
      </View>

      <View className="absolute inset-x-0 top-0 flex-row items-center gap-2 px-2 pt-14">
        <Pressable
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-full bg-black/50"
          accessibilityLabel="Fermer le scanner"
        >
          <Icon name="X" size={24} />
        </Pressable>
        <Text variant="body" className="text-white">
          Visez le code-barres
        </Text>
      </View>

      {message ? (
        <View
          className={`absolute inset-x-4 bottom-36 rounded-xl px-4 py-3 ${
            message.ok ? "bg-success" : "bg-destructive"
          }`}
        >
          <Text variant="body" className="text-white">
            {message.texte}
          </Text>
        </View>
      ) : null}

      <View className="absolute inset-x-0 bottom-0 bg-black/70 px-4 pb-10 pt-4">
        <View className="mb-3 flex-row items-baseline justify-between">
          <Text variant="body" className="text-white">
            {nbLignes} article{nbLignes > 1 ? "s" : ""} au panier
          </Text>
          <Text variant="h4" className="text-white">
            {panier.argent(panier.totaux.totalFacture)}
          </Text>
        </View>
        <Button onPress={() => router.back()} disabled={nbLignes === 0} fullWidth>
          Terminer le scan
        </Button>
      </View>
    </View>
  );
}
