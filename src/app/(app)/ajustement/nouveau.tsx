/**
 * Créer un ajustement de stock.
 *
 * **L'attendu est RELEVÉ, pas saisi.** Il vient de la base locale au moment de
 * l'ajout de la ligne, comme le serveur le relève à la création : c'est le
 * stock théorique, et le laisser saisir permettrait d'écrire un écart qui
 * n'existe pas. Le back-office s'est fait prendre par la variante de ce défaut,
 * en redécoupant l'attendu au conditionnement du jour pour le comparer à un
 * comptage réel.
 *
 * **L'ajustement est créé en BROUILLON.** Le stock ne bouge qu'à l'approbation,
 * un geste distinct et confirmé.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useLecture } from "@/data/live";
import { niveauxDeStock } from "@/data/stock-niveaux";
import { entrepots } from "@/data/stock";
import { TYPE_AJUSTEMENT } from "@/data/stock-operations";
import { creerAjustement } from "@/features/stock/actes";
import {
  AppBar, Banner, Button, Card, CardHeader, Chip, ChipRow, DataRow, Divider,
  FormField, Input, Screen, SearchInput, Sheet, Text, useToast,
} from "@/ui";

interface LigneComptage {
  produit: string;
  nom: string;
  attendu: number;
  compte: number;
}

export default function NouvelAjustement() {
  const toast = useToast();

  const [entrepot, setEntrepot] = useState<string | null>(null);
  const [type, setType] = useState("count");
  const [motif, setMotif] = useState("");
  const [lignes, setLignes] = useState<LigneComptage[]>([]);

  const [feuille, setFeuille] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [choisi, setChoisi] = useState<{ id: string; nom: string; attendu: number; affiche: string } | null>(null);
  const [compte, setCompte] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const { donnees: depots } = useLecture(entrepots, { tables: ["warehouses"] });

  const chargerLignes = useCallback(
    () =>
      entrepot
        ? niveauxDeStock({ entrepot, recherche, limite: 40 })
        : Promise.resolve({ elements: [], total: 0 }),
    [entrepot, recherche]
  );
  const { donnees: niveaux } = useLecture(chargerLignes, {
    tables: ["stocks", "products"],
    deps: [entrepot, recherche],
  });

  const bloque =
    envoi || !entrepot || motif.trim().length === 0 || lignes.length === 0;

  const ajouter = () => {
    const n = Number(compte.replace(",", ".")) || 0;
    if (!choisi || compte.trim() === "") return;
    setLignes((l) => [
      ...l.filter((x) => x.produit !== choisi.id),
      { produit: choisi.id, nom: choisi.nom, attendu: choisi.attendu, compte: n },
    ]);
    setChoisi(null);
    setCompte("");
    setFeuille(false);
  };

  const valider = async () => {
    if (bloque || !entrepot) return;
    setEnvoi(true);
    try {
      const id = await creerAjustement({
        entrepot,
        type,
        motif: motif.trim(),
        lignes: lignes.map(({ produit, attendu, compte }) => ({ produit, attendu, compte })),
      });
      toast.succes("Ajustement créé en brouillon. Il partira à la prochaine synchronisation.");
      router.replace(`/ajustement/${id}`);
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "L'ajustement n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title="Nouvel ajustement" />

      <View className="gap-4 p-4">
        <Card>
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
          <FormField label="Motif de l'ajustement" required>
            <ChipRow>
              {Object.entries(TYPE_AJUSTEMENT).map(([code, label]) => (
                <Chip
                  key={code}
                  label={label}
                  actif={type === code}
                  onPress={() => setType(code)}
                />
              ))}
            </ChipRow>
          </FormField>
          <FormField
            label="Explication"
            required
            hint="Elle figure sur la pièce et dans l'historique."
          >
            <Input
              value={motif}
              onChangeText={setMotif}
              placeholder="Comptage du 30/08, casse en réserve…"
            />
          </FormField>
        </Card>

        <Card className="p-0">
          <View className="p-4 pb-0">
            <CardHeader
              title={`Comptage (${lignes.length})`}
              right={
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon="Plus"
                  disabled={!entrepot}
                  onPress={() => setFeuille(true)}
                >
                  Ajouter
                </Button>
              }
            />
          </View>
          {lignes.length === 0 ? (
            <View className="px-4 pb-4">
              <Text variant="caption">
                {entrepot ? "Aucune ligne comptée." : "Choisissez d'abord l'entrepôt."}
              </Text>
            </View>
          ) : (
            lignes.map((l, i) => {
              const ecart = l.compte - l.attendu;
              return (
                <View key={l.produit}>
                  {i > 0 ? <Divider /> : null}
                  <DataRow
                    principal={l.nom}
                    secondaire={`Théorique ${l.attendu} · Compté ${l.compte}`}
                    valeur={
                      <Text
                        variant="bodySmall"
                        numeric
                        className={`font-sans-medium ${
                          ecart < 0 ? "text-destructive" : ecart > 0 ? "text-success" : ""
                        }`}
                      >
                        {`${ecart > 0 ? "+" : ""}${ecart}`}
                      </Text>
                    }
                    onPress={() => setLignes((x) => x.filter((y) => y.produit !== l.produit))}
                    chevron={false}
                  />
                </View>
              );
            })
          )}
        </Card>

        <Banner
          tone="info"
          title="Le stock ne bouge pas encore"
          message="L'ajustement est créé en brouillon. Les écarts s'appliqueront à l'approbation, depuis sa fiche."
        />

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement…" : "Créer l'ajustement"}
        </Button>
      </View>

      <Sheet ouvert={feuille} onFermer={() => setFeuille(false)} titre="Compter un article">
        {choisi ? (
          <>
            <Text variant="label">{choisi.nom}</Text>
            {/* Le théorique est RELEVÉ, jamais saisi : le laisser modifiable
                permettrait d'écrire un écart qui n'existe pas. */}
            <Text variant="caption">{`Théorique : ${choisi.affiche}`}</Text>
            <FormField label="Quantité comptée (unités)" required>
              <Input
                value={compte}
                onChangeText={setCompte}
                keyboardType="decimal-pad"
                autoFocus
              />
            </FormField>
            <View className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={() => setChoisi(null)}>
                Changer
              </Button>
              <Button className="flex-1" disabled={compte.trim() === ""} onPress={ajouter}>
                Ajouter
              </Button>
            </View>
          </>
        ) : (
          <>
            <SearchInput
              valeur={recherche}
              onChange={setRecherche}
              placeholder="Rechercher un produit..."
            />
            <View>
              {(niveaux?.elements ?? []).slice(0, 8).map((n) => (
                <DataRow
                  key={n.id}
                  principal={n.produit}
                  secondaire={n.sku}
                  valeur={
                    <Text variant="caption" numeric>
                      {n.quantiteAffichee}
                    </Text>
                  }
                  onPress={() =>
                    setChoisi({
                      id: n.produitId,
                      nom: n.produit,
                      attendu: n.total,
                      affiche: n.quantiteAffichee,
                    })
                  }
                />
              ))}
              {(niveaux?.elements ?? []).length === 0 ? (
                <Text variant="caption">Aucun produit trouvé dans cet entrepôt.</Text>
              ) : null}
            </View>
          </>
        )}
      </Sheet>
    </Screen>
  );
}
