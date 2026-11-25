/**
 * Le logo de l'établissement, imprimé en tête de chaque ticket.
 *
 * Il n'existait AUCUN écran pour l'envoyer, ni ici ni au back-office : seul
 * l'admin Django le pouvait. Le serveur réécrit l'image en PNG d'au plus
 * 600 px (`apps/organizations/logo.py`) : on n'a donc ni à la recadrer, ni à
 * la convertir.
 *
 * ⚠ PAS DE RECADRAGE CARRÉ, contrairement à la photo d'un article : un logo
 * est presque toujours plus large que haut, et le rogner en carré amputerait
 * le nom du commerce.
 *
 * ⚠ EN LIGNE SEULEMENT, comme le reste de la fiche : un fichier ne voyage pas
 * par le journal (`/sync/operations/` ne transporte que du JSON).
 *
 * Après un envoi ou un retrait, la session est relue : le CHEMIN du logo
 * change (nom neuf côté serveur), et c'est ce qui fait recharger le logo des
 * tickets (`printing/assurer-logo.ts`).
 */
import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

import { api, currentOrganizationId, ensureFreshTokens } from "@/api/client";
import { API_BASE_URL } from "@/api/config";
import { pieceFichier } from "@/api/piece-fichier";
import { readableMessage } from "@/api/errors";
import { urlDuLogo } from "@/printing/load-logo";
import { Button, Icon, Text, useToast } from "@/ui";

export function ChampLogo({
  organisationId,
  chemin,
  modifiable,
  raison,
  onChange,
}: {
  organisationId: string | undefined;
  /** Le chemin du logo, tel que la session le porte (`null` : pas de logo). */
  chemin: string | null | undefined;
  modifiable: boolean;
  /** Pourquoi on ne peut pas le changer, quand on ne le peut pas. */
  raison?: string;
  /** Relire la session après un changement. */
  onChange: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [occupe, setOccupe] = useState<"envoi" | "retrait" | null>(null);
  const url = urlDuLogo(chemin);

  const choisir = async () => {
    if (!organisationId) return;
    const droit = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!droit.granted) {
      toast.erreur("L'accès aux photos a été refusé.");
      return;
    }
    let resultat: ImagePicker.ImagePickerResult;
    try {
      resultat = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsEditing: false,
      });
    } catch {
      toast.erreur("La galerie n'a pas pu s'ouvrir.");
      return;
    }
    if (resultat.canceled || resultat.assets.length === 0) return;
    const fichier = resultat.assets[0];
    const mime = fichier.mimeType ?? "image/jpeg";

    setOccupe("envoi");
    try {
      await televerserLogo(organisationId, fichier.uri, mime);
      await onChange();
      toast.succes("Logo enregistré : il sortira sur les prochains tickets.");
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "Le logo n'a pas pu être enregistré.");
    } finally {
      setOccupe(null);
    }
  };

  const retirer = async () => {
    if (!organisationId) return;
    setOccupe("retrait");
    try {
      await api.patch(`/organizations/${organisationId}/`, { logo: null });
      await onChange();
      toast.succes("Logo retiré : les tickets sortiront sans logo.");
    } catch (e) {
      toast.erreur(
        readableMessage((e as { body?: unknown })?.body, "Le logo n'a pas pu être retiré.")
      );
    } finally {
      setOccupe(null);
    }
  };

  return (
    <View className="flex-row items-start gap-4">
      <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
        {url ? (
          <Image
            source={{ uri: url }}
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
            accessibilityLabel="Logo de l'établissement"
          />
        ) : (
          <Icon name="Store" size={24} color="mutedForeground" />
        )}
      </View>

      <View className="min-w-0 flex-1 gap-2">
        <Text variant="bodySmall" className="font-sans-medium">
          Logo des tickets
        </Text>
        <Text variant="caption">
          {url
            ? "Imprimé en tête de chaque ticket, ici comme au back-office."
            : "Aucun logo : les tickets sortent sans logo. PNG, JPEG ou WEBP, 5 Mo au plus."}
        </Text>
        {modifiable && (
          <View className="flex-row flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              leftIcon="ImagePlus"
              loading={occupe === "envoi"}
              disabled={occupe !== null}
              onPress={() => void choisir()}
            >
              {url ? "Changer le logo" : "Choisir un logo"}
            </Button>
            {url ? (
              <Button
                size="sm"
                variant="ghost"
                loading={occupe === "retrait"}
                disabled={occupe !== null}
                onPress={() => void retirer()}
              >
                Retirer
              </Button>
            ) : null}
          </View>
        )}
        {!modifiable && raison ? <Text variant="caption">{raison}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Le `PATCH` multipart du logo.
 *
 * ⚠ On n'écrit PAS `Content-Type` : c'est `fetch` qui doit poser
 * `multipart/form-data; boundary=…` (même règle que la photo d'un article,
 * `features/inventaire/photos.ts`). Et le fichier passe par `pieceFichier` :
 * le `fetch` d'Expo refuse la forme `{ uri, name, type }`.
 */
async function televerserLogo(organisationId: string, uri: string, mime: string): Promise<void> {
  const jetons = await ensureFreshTokens();
  const extension = extensionDuType(mime);
  const corps = new FormData();
  corps.append("logo", pieceFichier(uri, `logo.${extension}`, mime));

  const reponse = await fetch(`${API_BASE_URL}/organizations/${organisationId}/`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${jetons.access}`,
      "X-Organization-ID": currentOrganizationId() ?? organisationId,
    },
    body: corps,
  });
  if (reponse.ok) return;

  let message = "Le logo n'a pas pu être enregistré.";
  try {
    const json = (await reponse.json()) as { logo?: unknown };
    message = readableMessage(json.logo ?? json, message);
  } catch {
    // Une page HTML (proxy, 500 de Django) n'est pas un message : on garde le repli.
  }
  throw new Error(message);
}

/** L'extension annoncée au serveur, qui relit de toute façon l'image (Pillow). */
function extensionDuType(mime: string): "png" | "webp" | "jpg" {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}
