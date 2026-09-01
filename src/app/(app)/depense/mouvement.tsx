/**
 * Entrée ou sortie de caisse, hors vente.
 *
 * **Le SENS est choisi, jamais déduit d'un signe.** Un écran qui demanderait
 * un nombre signé ferait saisir des « -5000 » qui augmenteraient le tiroir une
 * fois sur deux, et l'erreur ne se verrait qu'au comptage du soir.
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { categoriesDepense, categoriesRecette } from "@/data/caisse";
import { useLecture } from "@/data/live";
import { creerMouvementCaisse } from "@/features/caisse/actes";
import { sessionOuverte } from "@/features/pos/caisse";
import { useSession } from "@/session/provider";
import {
  AppBar, Banner, Button, Card, Chip, ChipRow, FormField, Input, Screen,
  Segmented, useToast,
} from "@/ui";

type Sens = "in" | "out";

export default function MouvementCaisse() {
  const toast = useToast();
  const { snapshot } = useSession();
  const devises = snapshot?.currencies ?? [];
  const principale = devises.find((d) => d.is_primary)?.currency_code ?? "CDF";

  const [sens, setSens] = useState<Sens>("in");
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState(principale);
  const [description, setDescription] = useState("");
  const [categorie, setCategorie] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const { donnees: recettes } = useLecture(categoriesRecette, {
    tables: ["income_categories"],
  });
  const { donnees: depenses } = useLecture(categoriesDepense, {
    tables: ["expense_categories"],
  });
  const { donnees: session } = useLecture(sessionOuverte, {
    tables: ["register_sessions", "outbox_operations"],
  });

  const categories = sens === "in" ? recettes : depenses;
  const somme = Number(montant.replace(",", ".")) || 0;
  const bloque = envoi || somme <= 0 || description.trim().length === 0;

  const valider = async () => {
    if (bloque) return;
    setEnvoi(true);
    try {
      await creerMouvementCaisse({
        sens,
        montant: somme,
        devise,
        description,
        categorieRecette: sens === "in" ? categorie : null,
        categorieDepense: sens === "out" ? categorie : null,
        // La session n'est PAS envoyée : le serveur la résout depuis la session
        // ouverte de l'utilisateur, comme il le fait pour le back-office. Elle
        // rattache le mouvement à une caisse, donc à un entrepôt, donc au
        // périmètre de visibilité des magasiniers - et un client qui la
        // désignerait pourrait viser celle d'un autre. Le champ était de toute
        // façon jeté en silence : il n'est pas dans le serializer.
      });
      toast.succes("Mouvement enregistré. Il partira à la prochaine synchronisation.");
      router.back();
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "Le mouvement n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title="Mouvement de caisse" />

      <View className="gap-4 p-4">
        <Card>
          <FormField label="Sens" required>
            <Segmented
              options={[
                { valeur: "in", label: "Entrée", icon: "ArrowDownRight" },
                { valeur: "out", label: "Sortie", icon: "ArrowUpRight" },
              ]}
              valeur={sens}
              onChange={(v) => {
                setSens(v as Sens);
                setCategorie(null);
              }}
            />
          </FormField>
          <FormField label="Description" required>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder={sens === "in" ? "Apport de fonds…" : "Retrait, avance…"}
              autoFocus
            />
          </FormField>
          {devises.length > 1 ? (
            <FormField label="Devise">
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
          {(categories?.length ?? 0) > 0 ? (
            <FormField label="Catégorie">
              <ChipRow>
                {(categories ?? []).map((c) => (
                  <Chip
                    key={c.id}
                    label={c.nom}
                    actif={categorie === c.id}
                    onPress={() => setCategorie(categorie === c.id ? null : c.id)}
                  />
                ))}
              </ChipRow>
            </FormField>
          ) : null}
        </Card>

        {session ? (
          <Banner
            tone="info"
            title={`Rattaché à la session ${session.registerName}`}
            message="Le mouvement entrera dans le solde attendu à la clôture."
          />
        ) : (
          <Banner
            tone="warning"
            title="Aucune session ouverte"
            message="Le mouvement sera enregistré hors session : il ne pèsera sur aucun Z de caisse."
          />
        )}

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement…" : "Enregistrer le mouvement"}
        </Button>
      </View>
    </Screen>
  );
}
