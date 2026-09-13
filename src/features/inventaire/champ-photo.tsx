/**
 * La photo d'un article : appareil photo ou galerie.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE PHOTO NE PEUT PAS VOYAGER PAR LE JOURNAL, ET C'EST STRUCTUREL.      │
 * │                                                                          │
 * │ `/sync/operations/` transporte du JSON ; `Product.image` est un          │
 * │ `ImageField`, qui exige du multipart. La photo est donc RANGÉE sur le    │
 * │ terminal et envoyée séparément, une fois que le serveur a l'article -    │
 * │ voir `features/inventaire/photos.ts`. L'écran le DIT plutôt que de       │
 * │ laisser croire qu'elle part avec le reste.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ On COMPRESSE et on redimensionne à la prise. Une photo de téléphone pèse
 * volontiers cinq mégaoctets ; sur la 2G d'un marché, un envoi pareil échoue,
 * repart, et bloque la file derrière lui. La vignette du comptoir n'a besoin
 * que de reconnaître un article d'un coup d'œil.
 */
import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

import { Button, Card, Icon, Pressable, Text, useToast } from "@/ui";

/**
 * ⚠ `quality` compresse, il ne REDIMENSIONNE pas : une photo de douze
 * mégapixels reste douze mégapixels. Le recadrage carré imposé (`aspect`) et
 * cette qualité ramènent le fichier à quelques centaines de kilooctets, ce qui
 * suffit à une vignette de comptoir. Un vrai plafond de dimensions demanderait
 * `expo-image-manipulator`, donc une dépendance NATIVE de plus et un
 * reconstruction : à faire si les envois se révèlent trop lourds sur le
 * terrain, pas avant de l'avoir mesuré.
 */
const QUALITE = 0.7;

export interface PhotoChoisie {
  uri: string;
  /** Le nom sous lequel le fichier partira ; l'API le range tel quel. */
  nom: string;
  mime: string;
}

export function ChampPhoto({
  photo,
  onChange,
}: {
  photo: PhotoChoisie | null;
  onChange: (p: PhotoChoisie | null) => void;
}) {
  const toast = useToast();
  const [occupe, setOccupe] = useState(false);

  const retenir = (resultat: ImagePicker.ImagePickerResult) => {
    if (resultat.canceled || resultat.assets.length === 0) return;
    const a = resultat.assets[0];
    const extension = (a.mimeType ?? "image/jpeg").includes("png") ? "png" : "jpg";
    onChange({
      uri: a.uri,
      nom: `article-${Date.now()}.${extension}`,
      mime: a.mimeType ?? "image/jpeg",
    });
  };

  /**
   * ⚠ Un refus de permission N'EST PAS une panne, et le taire en serait une.
   * Sans message, le marchand appuie, rien ne s'ouvre, et il conclut que
   * l'application est cassée.
   */
  const prendre = async () => {
    setOccupe(true);
    try {
      const droit = await ImagePicker.requestCameraPermissionsAsync();
      if (!droit.granted) {
        toast.erreur("L'accès à l'appareil photo a été refusé.");
        return;
      }
      retenir(
        await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: QUALITE,
          allowsEditing: true,
          aspect: [1, 1],
        })
      );
    } catch {
      toast.erreur("L'appareil photo n'a pas pu s'ouvrir.");
    } finally {
      setOccupe(false);
    }
  };

  const choisir = async () => {
    setOccupe(true);
    try {
      const droit = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!droit.granted) {
        toast.erreur("L'accès aux photos a été refusé.");
        return;
      }
      retenir(
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: QUALITE,
          allowsEditing: true,
          aspect: [1, 1],
        })
      );
    } catch {
      toast.erreur("La galerie n'a pas pu s'ouvrir.");
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Card>
      <View className="flex-row items-start gap-4">
        <Pressable
          onPress={() => void choisir()}
          accessibilityLabel={photo ? "Remplacer la photo" : "Choisir une photo"}
          className="h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted"
        >
          {photo ? (
            <Apercu uri={photo.uri} />
          ) : (
            <View className="items-center gap-1">
              <Icon name="ImagePlus" size={22} color="mutedForeground" />
              <Text variant="caption">Photo</Text>
            </View>
          )}
        </Pressable>

        <View className="min-w-0 flex-1 gap-2">
          <Text variant="bodySmall" className="font-sans-medium">
            Photo du produit
          </Text>
          <Text variant="caption">
            Facultative. Elle aide le caissier à retrouver l&apos;article dans une
            grille de plusieurs centaines.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={occupe} onPress={() => void prendre()}>
              Prendre une photo
            </Button>
            <Button size="sm" variant="outline" disabled={occupe} onPress={() => void choisir()}>
              Galerie
            </Button>
            {photo ? (
              <Button size="sm" variant="ghost" onPress={() => onChange(null)}>
                Retirer
              </Button>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

/**
 * `expo-image` plutôt que le `Image` de React Native : il est déjà une
 * dépendance, il met en cache, et il ne bloque pas le fil principal sur le
 * décodage d'une photo de plusieurs mégapixels.
 */
function Apercu({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />;
}
