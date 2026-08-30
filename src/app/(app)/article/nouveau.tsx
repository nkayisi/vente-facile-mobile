/**
 * Créer un article.
 *
 * **Deux canaux, chacun avec son couple achat / vente.** Le canal détail est
 * TOUJOURS exprimé à l'unité de détail, qui est aussi l'unité de base du
 * stock : c'est la seule grandeur avec laquelle le coût moyen pondéré et les
 * lots FIFO savent travailler. Le canal gros porte le contenant entier.
 *
 * **Le SKU est saisi, et il est unique par établissement.** Deux terminaux
 * hors ligne peuvent en fabriquer le même ; le second sera refusé - refus
 * DÉTERMINISTE, donc quarantaine, avec le message qui va bien. C'est le prix
 * d'une création hors ligne, et il est assumé : mieux vaut un refus lisible
 * qu'un code inventé par la machine que personne ne reconnaît en rayon.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { referentiel } from "@/data/articles";
import { useLecture } from "@/data/live";
import { creerArticle } from "@/features/inventaire/actes";
import {
  AppBar, Banner, Button, Card, CardHeader, Chip, ChipRow, FormField, Input,
  Screen, Switch, Text, useToast,
} from "@/ui";

export default function NouvelArticle() {
  const toast = useToast();

  const [nom, setNom] = useState("");
  const [sku, setSku] = useState("");
  const [codeBarres, setCodeBarres] = useState("");
  const [categorie, setCategorie] = useState<string | null>(null);
  const [marque, setMarque] = useState<string | null>(null);
  const [unite, setUnite] = useState<string | null>(null);
  const [prixAchat, setPrixAchat] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [suitLeStock, setSuitLeStock] = useState(true);
  const [seuil, setSeuil] = useState("");
  const [parContenant, setParContenant] = useState("");
  const [uniteContenant, setUniteContenant] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const { donnees: cats } = useLecture(() => referentiel("categories"), {
    tables: ["categories", "products"],
  });
  const { donnees: marques } = useLecture(() => referentiel("marques"), {
    tables: ["brands", "products"],
  });
  const { donnees: unites } = useLecture(() => referentiel("unites"), {
    tables: ["units", "products"],
  });

  const vente = Number(prixVente.replace(",", ".")) || 0;
  const achat = Number(prixAchat.replace(",", ".")) || 0;
  const marge = vente > 0 && achat > 0 ? ((vente - achat) / vente) * 100 : null;
  // Vendre en dessous du coût est possible (déstockage), mais cela se voit.
  const venteSousLeCout = vente > 0 && achat > 0 && vente < achat;

  const bloque =
    envoi || nom.trim().length === 0 || sku.trim().length === 0 || vente <= 0;

  const valider = async () => {
    if (bloque) return;
    setEnvoi(true);
    try {
      const id = await creerArticle({
        nom,
        sku,
        codeBarres,
        categorie,
        marque,
        unite,
        prixVente: vente,
        prixAchat: achat,
        suitLeStock,
        seuilReassort: seuil.trim() ? Number(seuil) : undefined,
        unitesParContenant: parContenant.trim() ? Number(parContenant) : undefined,
        uniteContenant,
      });
      toast.succes("Article créé. Il partira à la prochaine synchronisation.");
      router.replace(`/article/${id}`);
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "L'article n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title="Nouvel article" />

      <View className="gap-4 p-4">
        <Card>
          <FormField label="Nom" required>
            <Input value={nom} onChangeText={setNom} placeholder="Sucre 1kg" autoFocus />
          </FormField>
          <FormField label="SKU" required hint="Unique dans l'établissement.">
            <Input value={sku} onChangeText={setSku} placeholder="SUC-1KG" autoCapitalize="characters" />
          </FormField>
          <FormField label="Code-barres">
            <Input value={codeBarres} onChangeText={setCodeBarres} keyboardType="numeric" />
          </FormField>
          {(cats?.length ?? 0) > 0 ? (
            <FormField label="Catégorie">
              <ChipRow>
                {(cats ?? []).map((c) => (
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
          {(marques?.length ?? 0) > 0 ? (
            <FormField label="Marque">
              <ChipRow>
                {(marques ?? []).map((m) => (
                  <Chip
                    key={m.id}
                    label={m.nom}
                    actif={marque === m.id}
                    onPress={() => setMarque(marque === m.id ? null : m.id)}
                  />
                ))}
              </ChipRow>
            </FormField>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Prix au détail" />
          <Text variant="caption" className="mb-3">
            Toujours exprimés à l&apos;unité de détail, qui est aussi l&apos;unité de
            base du stock.
          </Text>
          <FormField label="Prix d'achat">
            <Input
              value={prixAchat}
              onChangeText={setPrixAchat}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </FormField>
          <FormField
            label="Prix de vente"
            required
            hint={
              marge != null
                ? `Marge sur le prix de vente : ${marge.toFixed(1)} %`
                : undefined
            }
            error={venteSousLeCout ? "Vente en dessous du prix d'achat." : undefined}
          >
            <Input
              value={prixVente}
              onChangeText={setPrixVente}
              keyboardType="decimal-pad"
              placeholder="0"
              invalid={venteSousLeCout}
            />
          </FormField>
          {(unites?.length ?? 0) > 0 ? (
            <FormField label="Unité de détail">
              <ChipRow>
                {(unites ?? []).map((u) => (
                  <Chip
                    key={u.id}
                    label={u.nom}
                    actif={unite === u.id}
                    onPress={() => setUnite(unite === u.id ? null : u.id)}
                  />
                ))}
              </ChipRow>
            </FormField>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Conditionnement" />
          <Text variant="caption" className="mb-3">
            Laissez vide si l&apos;article se vend à l&apos;unité seule. Les prix de
            gros se règlent ensuite depuis le back-office.
          </Text>
          <FormField label="Unités de détail par contenant">
            <Input
              value={parContenant}
              onChangeText={setParContenant}
              keyboardType="number-pad"
              placeholder="12"
            />
          </FormField>
          {parContenant.trim() && (unites?.length ?? 0) > 0 ? (
            <FormField label="Nom du contenant">
              <ChipRow>
                {(unites ?? []).map((u) => (
                  <Chip
                    key={u.id}
                    label={u.nom}
                    actif={uniteContenant === u.id}
                    onPress={() =>
                      setUniteContenant(uniteContenant === u.id ? null : u.id)
                    }
                  />
                ))}
              </ChipRow>
            </FormField>
          ) : null}
        </Card>

        <Card>
          <View className="flex-row items-start justify-between gap-4">
            <View className="min-w-0 flex-1">
              <Text variant="bodySmall" className="font-sans-medium">
                Suivre le stock
              </Text>
              <Text variant="caption" className="mt-0.5">
                Désactivé, l&apos;article se vend sans jamais être compté : services,
                consignes, articles à la coupe.
              </Text>
            </View>
            <Switch valeur={suitLeStock} onChange={setSuitLeStock} />
          </View>
          {suitLeStock ? (
            <View className="mt-3">
              <FormField label="Seuil de réassort" hint="Déclenche l'alerte de stock bas.">
                <Input
                  value={seuil}
                  onChangeText={setSeuil}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </FormField>
            </View>
          ) : null}
        </Card>

        <Banner
          tone="info"
          title="Le SKU doit être unique"
          message="Deux terminaux hors ligne peuvent saisir le même : le second sera refusé et attendra dans « Opérations à corriger »."
        />

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement…" : "Créer l'article"}
        </Button>
      </View>
    </Screen>
  );
}
