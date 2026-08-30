/**
 * Créer une session d'inventaire.
 *
 * **La session naît en BROUILLON et sa feuille n'existe pas encore.** Elle est
 * engendrée au démarrage, avec le stock théorique du MOMENT : c'est cet
 * instantané qui sert de référence à l'écart. Engendrer la feuille à la
 * création ferait mesurer, au moment du comptage, les ventes survenues
 * entre-temps plutôt que le manquant réel.
 */
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useLecture } from "@/data/live";
import { entrepotParDefaut } from "@/data/entrepot-defaut";
import { entrepots } from "@/data/stock";
import { PERIMETRE_INVENTAIRE } from "@/data/inventaire";
import { creerSession } from "@/features/inventaire/actes";
import {
  AppBar, Banner, Button, Card, Chip, ChipRow, FormField, Input, Screen, useToast,
} from "@/ui";

export default function NouvelleSession() {
  const toast = useToast();
  const [nom, setNom] = useState("");
  const [entrepot, setEntrepot] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const { donnees: depots } = useLecture(entrepots, { tables: ["warehouses"] });

  // Un choix unique n'est pas un choix : l'entrepôt principal (ou l'unique) est
  // proposé d'emblée. La règle vit dans `entrepotParDefaut`, avec son test.
  useEffect(() => {
    if (entrepot === null) setEntrepot(entrepotParDefaut(depots));
  }, [depots, entrepot]);

  const bloque = envoi || nom.trim().length === 0 || !entrepot;

  const valider = async () => {
    if (bloque || !entrepot) return;
    setEnvoi(true);
    try {
      const id = await creerSession({
        nom: nom.trim(),
        entrepot,
        // Le périmètre par CATÉGORIE ou par PRODUIT demande un sélecteur
        // d'arbre et un panier de produits : ils arrivent avec le catalogue.
        // Proposer un choix qu'on ne sait pas remplir serait pire que de n'en
        // proposer qu'un.
        perimetre: "full",
        notes,
      });
      toast.succes("Session créée. Elle partira à la prochaine synchronisation.");
      router.replace(`/comptage/${id}`);
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "La session n'a pas pu être enregistrée.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title="Nouvelle session d'inventaire" />
      <View className="gap-4 p-4">
        <Card>
          <FormField label="Nom de la session" required>
            <Input
              value={nom}
              onChangeText={setNom}
              placeholder="Inventaire du 30 août"
              autoFocus
            />
          </FormField>
          <FormField label="Entrepôt" required>
            <ChipRow>
              {(depots ?? []).map((d) => (
                <Chip
                  key={d.id}
                  label={d.nom}
                  actif={entrepot === d.id}
                  onPress={() => setEntrepot(d.id)}
                />
              ))}
            </ChipRow>
          </FormField>
          <FormField
            label="Périmètre"
            hint="Le comptage par catégorie ou par produit arrive avec le catalogue, au lot 8."
          >
            <ChipRow>
              <Chip label={PERIMETRE_INVENTAIRE.full} actif onPress={() => {}} />
            </ChipRow>
          </FormField>
          <FormField label="Notes">
            <Input value={notes} onChangeText={setNotes} placeholder="Équipe, allée…" />
          </FormField>
        </Card>

        <Banner
          tone="info"
          title="La feuille est engendrée au démarrage"
          message="Elle fige alors le stock théorique. C'est cet instantané qui sert de référence à l'écart, et non le stock d'aujourd'hui."
        />

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement…" : "Créer la session"}
        </Button>
      </View>
    </Screen>
  );
}
