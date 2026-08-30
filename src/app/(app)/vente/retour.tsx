/**
 * Enregistrer un retour, depuis la vente concernée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN RETOUR SE CRÉE DEPUIS SA VENTE, JAMAIS D'UNE LISTE VIDE.             │
 * │                                                                          │
 * │ Il faut savoir CE QUI est rendu, et à quel prix cela avait été vendu :   │
 * │ chaque ligne de retour DÉSIGNE une ligne de facture. Sans ce lien, le    │
 * │ serveur ne saurait ni quoi remettre en stock, ni combien rembourser, et  │
 * │ il refuse l'opération.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Le retour naît en BROUILLON.** Ni le stock ni la caisse ne bougent avant
 * l'approbation, qui est un geste distinct et confirmé (`/retour/[id]`).
 *
 * **« Remettre en stock » est coché par défaut, et se décoche.** Un retour rend
 * la marchandise ; l'article cassé ou périmé est le cas particulier, pas
 * l'inverse.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { detailVente } from "@/data/vente-detail";
import { creerRetour } from "@/features/ventes/retours-devis";
import {
  AppBar, Banner, Button, Card, CardHeader, Divider, EmptyState, FormField,
  Input, Screen, Spinner, Switch, Text, useToast,
} from "@/ui";

const TABLES = ["sales", "sale_items", "products", "warehouses"];

interface LigneRendue {
  quantite: string;
  remisEnStock: boolean;
}

export default function NouveauRetour() {
  const { vente: venteId } = useLocalSearchParams<{ vente: string }>();
  const money = useMonnaie();
  const toast = useToast();

  const [rendues, setRendues] = useState<Record<string, LigneRendue>>({});
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => detailVente(venteId), [venteId]);
  const { donnees: v, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [venteId],
  });

  if (chargement && !v) {
    return (
      <Screen>
        <AppBar title="Retour" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!v) {
    return (
      <Screen padded={false}>
        <AppBar title="Retour" />
        <EmptyState
          icon="PackageX"
          title="Vente introuvable"
          message="Un retour ne s'enregistre pas sans sa facture."
          action={{ label: "Revenir", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  // Sans entrepôt, la marchandise n'a nulle part où revenir. Le serveur le
  // refuserait ; le dire ici évite une quarantaine pour rien.
  if (!v.entrepotId) {
    return (
      <Screen padded={false}>
        <AppBar title="Retour" subtitle={v.reference} />
        <EmptyState
          icon="Warehouse"
          title="Cette vente n'a pas d'entrepôt"
          message="La marchandise revient là d'où elle est partie. Sans entrepôt sur la facture, le retour ne peut pas être enregistré depuis le terminal."
          action={{ label: "Revenir", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const saisie = (id: string) => rendues[id];
  const quantiteDe = (id: string) =>
    Number((rendues[id]?.quantite ?? "").replace(",", ".")) || 0;

  const rendables = v.lignes.filter((l) => l.produitId !== null);
  const lignes = rendables
    .map((ligne) => ({
      ligne,
      quantite: quantiteDe(ligne.id),
      remisEnStock: saisie(ligne.id)?.remisEnStock !== false,
    }))
    .filter((l) => l.quantite > 0);

  const total = lignes.reduce((t, l) => t + l.quantite * l.ligne.prixUnitaire, 0);
  // Une quantité rendue ne peut pas dépasser celle vendue : le serveur le
  // refuserait, hors ligne, en quarantaine - autant le dire tout de suite.
  const tropRendu = rendables.some((l) => quantiteDe(l.id) > l.quantiteTotale);
  const bloque =
    envoi || lignes.length === 0 || motif.trim().length === 0 || tropRendu;

  const valider = async () => {
    if (bloque || !v.entrepotId) return;
    setEnvoi(true);
    try {
      await creerRetour({
        vente: v.id,
        entrepot: v.entrepotId,
        motif: motif.trim(),
        lignes: lignes.map((l) => ({
          ligneVente: l.ligne.id,
          produit: l.ligne.produitId as string,
          quantite: l.quantite,
          prixUnitaire: l.ligne.prixUnitaire,
          remisEnStock: l.remisEnStock,
        })),
      });
      toast.succes("Retour enregistré en brouillon. Il partira à la prochaine synchronisation.");
      router.replace("/retour");
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "Le retour n'a pas pu être enregistré."
      );
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title="Enregistrer un retour" subtitle={v.reference} />

      <View className="gap-4 p-4">
        <Card>
          <CardHeader
            title="Ce qui est rendu"
            subtitle="Laissez à zéro ce qui reste chez le client."
          />
          <View>
            {rendables.map((l, i) => {
              const q = quantiteDe(l.id);
              const trop = q > l.quantiteTotale;
              return (
                <View key={l.id}>
                  {i > 0 ? (
                    <View className="my-3">
                      <Divider />
                    </View>
                  ) : null}
                  <Text variant="bodySmall" className="font-sans-medium">
                    {l.produit}
                  </Text>
                  <Text variant="caption" className="mb-2">
                    {`Vendu ${l.quantiteAffichee} à ${money.money(l.prixUnitaire, v.devise)}`}
                  </Text>
                  <FormField
                    label="Quantité rendue"
                    error={trop ? `Au plus ${l.quantiteTotale}, la quantité vendue.` : undefined}
                  >
                    <Input
                      value={saisie(l.id)?.quantite ?? ""}
                      onChangeText={(t) =>
                        setRendues((r) => ({
                          ...r,
                          [l.id]: {
                            quantite: t,
                            remisEnStock: r[l.id]?.remisEnStock !== false,
                          },
                        }))
                      }
                      keyboardType="decimal-pad"
                      placeholder="0"
                      invalid={trop}
                    />
                  </FormField>
                  {q > 0 ? (
                    <Switch
                      label="Remettre en stock"
                      aide="Décochez si l'article est cassé, périmé ou invendable."
                      valeur={saisie(l.id)?.remisEnStock !== false}
                      onChange={(val) =>
                        setRendues((r) => ({
                          ...r,
                          [l.id]: { quantite: r[l.id]?.quantite ?? "", remisEnStock: val },
                        }))
                      }
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
          {rendables.length < v.lignes.length ? (
            <Text variant="caption" className="mt-3">
              Une ligne de cette facture porte un produit supprimé du catalogue :
              elle ne peut pas être rendue depuis le terminal.
            </Text>
          ) : null}
        </Card>

        <Card>
          <FormField
            label="Motif du retour"
            required
            hint="Il figure sur la pièce et dans l'historique."
          >
            <Input
              value={motif}
              onChangeText={setMotif}
              placeholder="Article défectueux, erreur de référence..."
            />
          </FormField>
          {total > 0 ? (
            <View className="mt-2 flex-row items-baseline justify-between">
              <Text variant="label">Valeur rendue</Text>
              <Text variant="body" numeric className="font-sans-medium">
                {money.money(total, v.devise)}
              </Text>
            </View>
          ) : null}
        </Card>

        <Banner
          tone="info"
          title="Rien ne bouge avant l'approbation"
          message={
            v.resteAPayer > 0
              ? "À l'approbation, le montant éteindra d'abord la dette du client sur cette facture ; seul le reliquat sortira de la caisse."
              : "À l'approbation, la marchandise reviendra en stock et le montant sortira de la caisse."
          }
        />

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement..." : "Enregistrer le retour"}
        </Button>
      </View>
    </Screen>
  );
}
