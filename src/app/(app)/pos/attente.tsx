/**
 * Les paniers mis en attente.
 *
 * Écran séparé plutôt qu'une feuille sur la grille : reprendre un panier est
 * une décision, pas un geste. Elle remplace le panier courant, et le caissier
 * doit voir ce qu'il reprend avant de le faire.
 */
import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { formatDateTime } from "@vente-facile/core";

import {
  listerEnAttente,
  mettreEnAttente,
  reprendre,
  supprimerEnAttente,
  etiquetteParDefaut,
  type PanierEnAttente,
} from "@/features/pos/attente";
import { sessionOuverte } from "@/features/pos/caisse";
import { usePanier } from "@/features/pos/panier";
import {
  AlertDialog, Banner, Divider, EmptyState, Icon, Pressable, Screen, Spinner, Text,
} from "@/ui";

export default function Attente() {
  const panier = usePanier();
  const [paniers, setPaniers] = useState<PanierEnAttente[] | null>(null);
  const [avis, setAvis] = useState<{ ton: "info" | "warning"; texte: string } | null>(null);

  const recharger = useCallback(() => {
    listerEnAttente().then(setPaniers);
  }, []);

  useFocusEffect(recharger);

  /**
   * Reprendre remplace le panier courant. S'il porte déjà des articles, on le
   * range plutôt que de l'écraser : un panier composé qui disparaît sur un
   * appui est une vente perdue, et le caissier ne saura pas ce qu'il y avait
   * dedans.
   */
  // Trois confirmations qui passaient par `Alert.alert`. Le natif ignore le
  // theme sombre, ignore la police, et son bouton destructif n'est rouge que
  // sur iOS : au comptoir, l'ecran qui demande de perdre un panier ne peut pas
  // etre le seul a ne pas ressembler a l'application.
  const [aRanger, setARanger] = useState<PanierEnAttente | null>(null);
  const [aSupprimer, setASupprimer] = useState<PanierEnAttente | null>(null);
  const [reserves, setReserves] = useState<string | null>(null);

  const ouvrir = async (item: PanierEnAttente) => {
    if (panier.etat.lignes.length > 0) {
      setARanger(item);
      return;
    }
    await effectuerReprise(item);
  };

  const rangerPuisReprendre = async (item: PanierEnAttente) => {
    const session = await sessionOuverte();
    await mettreEnAttente({
      etat: panier.etat,
      label: etiquetteParDefaut(panier.etat),
      registerSessionId: session?.id ?? null,
      totalAmount: String(panier.totaux.totalFacture),
      totalCurrency: panier.deviseFacture,
    });
    await effectuerReprise(item);
  };

  const effectuerReprise = async (item: PanierEnAttente) => {
    const session = await sessionOuverte();
    const reprise = await reprendre(item.id, session?.warehouseId ?? null);
    if (!reprise) {
      recharger();
      return;
    }

    panier.envoyer({ type: "restaurer", etat: reprise.etat });

    // Ce que la reprise n'a pas pu honorer se dit AVANT de revenir au
    // comptoir. Un panier revenu amputé sans un mot ferait vendre moins que ce
    // que le client a demandé, et personne ne s'en apercevrait.
    const messages = [...reprise.ecartees];
    if (reprise.clientPerdu) messages.push("Le client attaché n'est plus au fichier.");
    if (reprise.prixChanges.length > 0) {
      messages.push(
        `Prix modifié au catalogue depuis la mise en attente : ${reprise.prixChanges.join(", ")}. Le panier garde le prix annoncé.`
      );
    }

    if (messages.length > 0) {
      setReserves(messages.join("\n\n"));
      return;
    }
    router.replace("/pos/panier");
  };

  const confirmerSuppression = async () => {
    if (!aSupprimer) return;
    await supprimerEnAttente(aSupprimer.id);
    setAvis({ ton: "info", texte: `« ${aSupprimer.label} » a été supprimé.` });
    setASupprimer(null);
    recharger();
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          accessibilityLabel="Retour au comptoir"
        >
          <Icon name="ArrowLeft" size={24} />
        </Pressable>
        <Text variant="h4" className="flex-1">
          Paniers en attente
        </Text>
      </View>

      {avis ? (
        <View className="mt-3">
          <Banner tone={avis.ton === "warning" ? "warning" : "info"} title={avis.texte} />
        </View>
      ) : null}

      {paniers === null ? (
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      ) : paniers.length === 0 ? (
        <EmptyState
          icon="PauseCircle"
          title="Aucun panier en attente"
          message="Depuis le panier, « Mettre en attente » range la commande en cours pour servir le client suivant."
        />
      ) : (
        <FlatList
          data={paniers}
          keyExtractor={(p) => p.id}
          contentContainerClassName="pb-8 pt-2"
          ItemSeparatorComponent={Divider}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void ouvrir(item)}
              haptic="selection"
              className="flex-row items-center px-1 py-4 active:bg-muted"
              accessibilityLabel={`Reprendre le panier ${item.label}`}
            >
              <View className="flex-1 pr-3">
                <Text variant="body" numberOfLines={1}>
                  {item.label}
                </Text>
                <Text variant="bodySmall" className="mt-0.5 text-muted-foreground">
                  {item.lineCount} article{item.lineCount > 1 ? "s" : ""} ·{" "}
                  {formatDateTime(item.createdAt.toISOString())}
                </Text>
              </View>
              <View className="items-end">
                <Text variant="body">
                  {panier.argent(Number(item.totalAmount), item.totalCurrency)}
                </Text>
                <Text variant="caption" className="text-muted-foreground">
                  au rangement
                </Text>
              </View>
              <Pressable
                onPress={() => setASupprimer(item)}
                haptic="warning"
                className="ml-2 h-11 w-11 items-center justify-center rounded-full active:bg-muted"
                accessibilityLabel={`Supprimer le panier ${item.label}`}
              >
                <Icon name="Trash2" size={18} color="mutedForeground" />
              </Pressable>
            </Pressable>
          )}
        />
      )}
          <AlertDialog
        ouvert={aRanger !== null}
        titre="Panier en cours"
        message={`Le panier courant porte ${panier.etat.lignes.length} article${
          panier.etat.lignes.length > 1 ? "s" : ""
        }. Il sera mis en attente à son tour.`}
        confirmer="Ranger et reprendre"
        onConfirmer={() => {
          const item = aRanger;
          setARanger(null);
          if (item) void rangerPuisReprendre(item);
        }}
        onAnnuler={() => setARanger(null)}
      />

      <AlertDialog
        ouvert={aSupprimer !== null}
        titre="Supprimer ce panier ?"
        message={
          aSupprimer
            ? `« ${aSupprimer.label} » sera perdu. Cette action ne peut pas être annulée.`
            : undefined
        }
        confirmer="Supprimer"
        destructif
        onConfirmer={() => void confirmerSuppression()}
        onAnnuler={() => setASupprimer(null)}
      />

      {/* Ce qui suit n'est PAS une confirmation mais un compte rendu : la
          reprise a eu lieu, et elle dit ce qu'elle n'a pas pu honorer. */}
      <AlertDialog
        ouvert={reserves !== null}
        titre="Panier repris, avec des réserves"
        message={reserves ?? undefined}
        confirmer="J'ai compris"
        annuler=""
        onConfirmer={() => {
          setReserves(null);
          router.replace("/pos/panier");
        }}
        onAnnuler={() => {
          setReserves(null);
          router.replace("/pos/panier");
        }}
      />
</Screen>
  );
}
