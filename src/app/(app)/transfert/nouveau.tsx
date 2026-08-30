/**
 * Créer un transfert de stock.
 *
 * **Le transfert est créé en BROUILLON, il n'expédie rien.** C'est le
 * comportement du back-office, et il est protecteur : le stock ne quitte
 * l'entrepôt qu'à l'expédition, un geste distinct et confirmé. Créer et
 * expédier d'un même bouton ferait sortir du stock sur une faute de frappe.
 *
 * Le disponible affiché est celui de l'entrepôt SOURCE, réservations imputées
 * comme au comptoir : ce que l'écran montre est ce que le serveur acceptera.
 */
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useLecture } from "@/data/live";
import { entrepotParDefaut } from "@/data/entrepot-defaut";
import { entrepots } from "@/data/stock";
import { chercherArticles } from "@/features/pos/catalogue";
import { creerTransfert, type LigneSaisie } from "@/features/stock/actes";
import {
  AppBar,
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  Chip,
  ChipRow,
  DataRow,
  Divider,
  FormField,
  Input,
  Screen,
  SearchInput,
  Sheet,
  Text,
  useToast,
} from "@/ui";

export default function NouveauTransfert() {
  const toast = useToast();

  const [source, setSource] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<(LigneSaisie & { nom: string })[]>([]);

  const [feuille, setFeuille] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [choisi, setChoisi] = useState<{ id: string; nom: string; dispo: string } | null>(null);
  const [quantite, setQuantite] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const { donnees: depots } = useLecture(entrepots, { tables: ["warehouses"] });

  // Seule la SOURCE est proposée : la destination est le choix qui compte, et
  // la deviner ferait expédier ailleurs qu'on ne voulait.
  useEffect(() => {
    if (source === null) setSource(entrepotParDefaut(depots));
  }, [depots, source]);

  const chargerArticles = useCallback(
    () =>
      source
        ? chercherArticles({ warehouseId: source, terme: recherche, limite: 40 })
        : Promise.resolve([]),
    [source, recherche]
  );
  const { donnees: articles } = useLecture(chargerArticles, {
    tables: ["products", "stocks"],
    deps: [source, recherche],
  });

  // Les deux entrepôts doivent DIFFÉRER : un transfert sur place ne veut rien
  // dire, et le serveur le refuserait après coup, hors ligne, en quarantaine.
  const memeEntrepot = Boolean(source && destination && source === destination);
  const bloque =
    envoi || !source || !destination || memeEntrepot || lignes.length === 0;

  const ajouter = () => {
    const n = Number(quantite.replace(",", ".")) || 0;
    if (!choisi || n <= 0) return;
    setLignes((l) => [
      ...l.filter((x) => x.produit !== choisi.id),
      { produit: choisi.id, nom: choisi.nom, quantite: n },
    ]);
    setChoisi(null);
    setQuantite("");
    setFeuille(false);
  };

  const valider = async () => {
    if (bloque || !source || !destination) return;
    setEnvoi(true);
    try {
      const id = await creerTransfert({
        source,
        destination,
        notes,
        lignes: lignes.map(({ produit, quantite }) => ({ produit, quantite })),
      });
      toast.succes("Transfert créé en brouillon. Il partira à la prochaine synchronisation.");
      router.replace(`/transfert/${id}`);
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "Le transfert n'a pas pu être enregistré."
      );
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title="Nouveau transfert" />

      <View className="gap-4 p-4">
        <Card>
          <FormField label="Entrepôt source" required>
            <ChipRow>
              {(depots ?? []).map((d) => (
                <Chip
                  key={d.id}
                  label={d.nom}
                  actif={source === d.id}
                  onPress={() => setSource(d.id)}
                />
              ))}
            </ChipRow>
          </FormField>
          <FormField
            label="Entrepôt de destination"
            required
            error={memeEntrepot ? "Choisissez deux entrepôts différents." : undefined}
          >
            <ChipRow>
              {(depots ?? []).map((d) => (
                <Chip
                  key={d.id}
                  label={d.nom}
                  actif={destination === d.id}
                  onPress={() => setDestination(d.id)}
                />
              ))}
            </ChipRow>
          </FormField>
          <FormField label="Notes">
            <Input value={notes} onChangeText={setNotes} placeholder="Motif, transporteur…" />
          </FormField>
        </Card>

        <Card className="p-0">
          <View className="p-4 pb-0">
            <CardHeader
              title={`Articles (${lignes.length})`}
              right={
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon="Plus"
                  disabled={!source}
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
                {source
                  ? "Aucun article. Ajoutez ce qui doit partir."
                  : "Choisissez d'abord l'entrepôt source."}
              </Text>
            </View>
          ) : (
            lignes.map((l, i) => (
              <View key={l.produit}>
                {i > 0 ? <Divider /> : null}
                <DataRow
                  principal={l.nom}
                  valeur={
                    <Text variant="bodySmall" numeric className="font-sans-medium">
                      {String(l.quantite)}
                    </Text>
                  }
                  onPress={() =>
                    setLignes((x) => x.filter((y) => y.produit !== l.produit))
                  }
                  chevron={false}
                />
              </View>
            ))
          )}
        </Card>

        <Banner
          tone="info"
          title="Le stock ne bouge pas encore"
          message="Le transfert est créé en brouillon. Il quittera l'entrepôt source à l'expédition, depuis sa fiche."
        />

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement…" : "Créer le transfert"}
        </Button>
      </View>

      <Sheet ouvert={feuille} onFermer={() => setFeuille(false)} titre="Ajouter un article">
        {choisi ? (
          <>
            <Text variant="label">{choisi.nom}</Text>
            <Text variant="caption">{`Disponible : ${choisi.dispo}`}</Text>
            <FormField label="Quantité à transférer (unités)" required>
              <Input
                value={quantite}
                onChangeText={setQuantite}
                keyboardType="decimal-pad"
                autoFocus
              />
            </FormField>
            <View className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={() => setChoisi(null)}>
                Changer
              </Button>
              <Button
                className="flex-1"
                disabled={(Number(quantite) || 0) <= 0}
                onPress={ajouter}
              >
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
              {(articles ?? []).slice(0, 8).map((a) => (
                <DataRow
                  key={a.id}
                  principal={a.name}
                  secondaire={a.sku}
                  valeur={
                    <Text variant="caption" numeric>
                      {/* `null` n'est PAS zéro : un produit non suivi affiche
                          « Non suivi », jamais « 0 » qui crierait la rupture. */}
                      {a.stock_quantity == null ? "Non suivi" : String(a.stock_quantity)}
                    </Text>
                  }
                  onPress={() =>
                    setChoisi({
                      id: a.id,
                      nom: a.name,
                      dispo:
                        a.stock_quantity == null
                          ? "Stock non suivi"
                          : `${a.stock_quantity} en rayon`,
                    })
                  }
                />
              ))}
              {(articles ?? []).length === 0 ? (
                <Text variant="caption">Aucun produit trouvé dans cet entrepôt.</Text>
              ) : null}
            </View>
          </>
        )}
      </Sheet>
    </Screen>
  );
}
