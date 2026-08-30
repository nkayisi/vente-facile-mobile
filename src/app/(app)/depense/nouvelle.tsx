/**
 * Enregistrer une dépense.
 *
 * **Une dépense SORT de la caisse.** Le montant est saisi positif et le sens
 * est porté par l'acte lui-même : demander un nombre signé ferait saisir des
 * « -5000 » qui augmenteraient le tiroir une fois sur deux.
 *
 * La DEVISE est celle des billets sortis, jamais une devise de référence : le
 * tiroir contient des liasses distinctes, et convertir avant d'enregistrer
 * ferait diverger le comptage du soir.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { categoriesDepense } from "@/data/caisse";
import { useLecture } from "@/data/live";
import { creerDepense } from "@/features/caisse/actes";
import { moyensDePaiement } from "@/features/pos/donnees";
import { useSession } from "@/session/provider";
import {
  AppBar, Banner, Button, Card, Chip, ChipRow, FormField, Input, Screen,
  useToast,
} from "@/ui";

export default function NouvelleDepense() {
  const toast = useToast();
  const { snapshot } = useSession();
  const devises = snapshot?.currencies ?? [];
  const principale = devises.find((d) => d.is_primary)?.currency_code ?? "CDF";

  const [categorie, setCategorie] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState(principale);
  const [beneficiaire, setBeneficiaire] = useState("");
  const [methode, setMethode] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const { donnees: categories } = useLecture(categoriesDepense, {
    tables: ["expense_categories"],
  });
  const { donnees: moyens } = useLecture(moyensDePaiement, {
    tables: ["payment_methods"],
  });

  // Une catégorie unique n'est pas un choix : elle se propose d'elle-même.
  useEffect(() => {
    if (categorie === null && categories?.length === 1) setCategorie(categories[0].id);
  }, [categories, categorie]);

  const somme = Number(montant.replace(",", ".")) || 0;
  const bloque =
    envoi || !categorie || description.trim().length === 0 || somme <= 0;

  const valider = async () => {
    if (bloque || !categorie) return;
    setEnvoi(true);
    try {
      await creerDepense({
        categorie,
        description,
        montant: somme,
        devise,
        beneficiaire,
        methode,
        notes,
      });
      toast.succes("Dépense enregistrée. Elle partira à la prochaine synchronisation.");
      router.back();
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "La dépense n'a pas pu être enregistrée.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title="Nouvelle dépense" />

      <View className="gap-4 p-4">
        <Card>
          <FormField label="Catégorie" required>
            <ChipRow>
              {(categories ?? []).map((c) => (
                <Chip
                  key={c.id}
                  label={c.nom}
                  actif={categorie === c.id}
                  onPress={() => setCategorie(c.id)}
                />
              ))}
            </ChipRow>
          </FormField>
          <FormField label="Description" required>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder="Transport, électricité, fournitures…"
              autoFocus
            />
          </FormField>
          {devises.length > 1 ? (
            <FormField
              label="Devise"
              hint="Celle des billets sortis. Le tiroir contient des liasses distinctes."
            >
              <ChipRow>
                {devises.map((d) => (
                  <Chip
                    key={d.currency_code}
                    label={d.currency_code}
                    actif={devise === d.currency_code}
                    onPress={() => setDevise(d.currency_code)}
                  />
                ))}
              </ChipRow>
            </FormField>
          ) : null}
          <FormField label={`Montant (${devise})`} required>
            <Input
              value={montant}
              onChangeText={setMontant}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </FormField>
          <FormField label="Bénéficiaire">
            <Input value={beneficiaire} onChangeText={setBeneficiaire} />
          </FormField>
          {(moyens?.length ?? 0) > 1 ? (
            <FormField label="Moyen de paiement">
              <ChipRow>
                {(moyens ?? []).map((m) => (
                  <Chip
                    key={m.id}
                    label={m.name}
                    actif={methode === m.id}
                    onPress={() => setMethode(methode === m.id ? null : m.id)}
                  />
                ))}
              </ChipRow>
            </FormField>
          ) : null}
          <FormField label="Notes">
            <Input value={notes} onChangeText={setNotes} />
          </FormField>
        </Card>

        <Banner
          tone="warning"
          title="Cette dépense sort de la caisse"
          message="Elle se retrouvera dans le rapport de caisse et dans le solde attendu à la clôture."
        />

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement…" : "Enregistrer la dépense"}
        </Button>
      </View>
    </Screen>
  );
}
