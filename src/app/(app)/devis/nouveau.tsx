/**
 * Créer un devis.
 *
 * **Un devis N'ENGAGE PAS LE STOCK.** C'est ce qui le distingue d'une vente :
 * on propose un prix, la marchandise reste disponible pour quelqu'un d'autre.
 * La réservation n'a lieu qu'à la conversion, et l'écran le dit - sans quoi un
 * commerçant croirait avoir mis de côté.
 *
 * **La date de validité est OBLIGATOIRE.** Un devis sans échéance n'expire
 * jamais, et le serveur refuse d'en créer : un prix proposé il y a six mois
 * n'engage plus personne.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { chercherClients } from "@/features/pos/donnees";
import { chercherArticles } from "@/features/pos/catalogue";
import { creerDevis, type LigneDevisSaisie } from "@/features/ventes/retours-devis";
import { entrepotParDefaut } from "@/data/entrepot-defaut";
import { entrepots } from "@/data/stock";
import {
  AppBar, Banner, Button, Card, CardHeader, DataRow, Divider, FormField,
  Input, Screen, SearchInput, Sheet, Text, useToast,
} from "@/ui";

/** Trente jours, l'usage le plus courant. Le commerçant peut corriger. */
function dansTrenteJours(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export default function NouveauDevis() {
  const money = useMonnaie();
  const toast = useToast();

  const [client, setClient] = useState<{ id: string; nom: string } | null>(null);
  const [validite, setValidite] = useState(dansTrenteJours());
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<(LigneDevisSaisie & { nom: string })[]>([]);

  const [feuille, setFeuille] = useState<"client" | "article" | null>(null);
  const [recherche, setRecherche] = useState("");
  const [choisi, setChoisi] = useState<{ id: string; nom: string; prix: number } | null>(null);
  const [quantite, setQuantite] = useState("");
  const [prix, setPrix] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const { donnees: depots } = useLecture(entrepots, { tables: ["warehouses"] });
  const entrepot = entrepotParDefaut(depots);

  const chargerClients = useCallback(
    () => (feuille === "client" ? chercherClients(recherche, 12) : Promise.resolve([])),
    [feuille, recherche]
  );
  const { donnees: clients } = useLecture(chargerClients, {
    tables: ["customers"],
    deps: [feuille, recherche],
  });

  const chargerArticles = useCallback(
    () =>
      feuille === "article" && entrepot
        ? chercherArticles({ warehouseId: entrepot, terme: recherche, limite: 20 })
        : Promise.resolve([]),
    [feuille, recherche, entrepot]
  );
  const { donnees: articles } = useLecture(chargerArticles, {
    tables: ["products", "stocks"],
    deps: [feuille, recherche, entrepot],
  });

  const total = lignes.reduce((t, l) => t + l.quantite * l.prixUnitaire, 0);
  // La DATE est saisie au format ISO : le dépôt n'a pas de calendrier, et le
  // back-office emploie lui aussi un champ date natif.
  const dateValide = /^\d{4}-\d{2}-\d{2}$/.test(validite);
  const bloque = envoi || lignes.length === 0 || !dateValide;

  const ajouter = () => {
    const q = Number(quantite.replace(",", ".")) || 0;
    const p = Number(prix.replace(",", ".")) || 0;
    if (!choisi || q <= 0 || p <= 0) return;
    setLignes((l) => [
      ...l.filter((x) => x.produit !== choisi.id),
      { produit: choisi.id, nom: choisi.nom, quantite: q, prixUnitaire: p },
    ]);
    setChoisi(null);
    setQuantite("");
    setPrix("");
    setFeuille(null);
  };

  const valider = async () => {
    if (bloque) return;
    setEnvoi(true);
    try {
      const id = await creerDevis({
        client: client?.id ?? null,
        valideJusquau: validite,
        notes,
        lignes: lignes.map(({ produit, quantite, prixUnitaire }) => ({
          produit,
          quantite,
          prixUnitaire,
        })),
      });
      toast.succes("Devis créé. Il partira à la prochaine synchronisation.");
      router.replace(`/devis/${id}`);
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "Le devis n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title="Nouveau devis" />

      <View className="gap-4 p-4">
        <Card>
          <FormField label="Client" hint="Facultatif : un devis peut être anonyme.">
            <Button
              variant="outline"
              fullWidth
              onPress={() => {
                setRecherche("");
                setFeuille("client");
              }}
            >
              {client?.nom ?? "Choisir un client"}
            </Button>
          </FormField>
          <FormField
            label="Valable jusqu'au"
            required
            error={dateValide ? undefined : "Format attendu : AAAA-MM-JJ."}
            hint={
              dateValide
                ? `Soit le ${formatDateFr(new Date(validite))}.`
                : undefined
            }
          >
            <Input
              value={validite}
              onChangeText={setValidite}
              placeholder="2026-12-31"
              invalid={!dateValide}
            />
          </FormField>
          <FormField label="Notes">
            <Input value={notes} onChangeText={setNotes} />
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
                  onPress={() => {
                    setRecherche("");
                    setFeuille("article");
                  }}
                >
                  Ajouter
                </Button>
              }
            />
          </View>
          {lignes.length === 0 ? (
            <View className="px-4 pb-4">
              <Text variant="caption">Aucun article proposé.</Text>
            </View>
          ) : (
            lignes.map((l, i) => (
              <View key={l.produit}>
                {i > 0 ? <Divider /> : null}
                <DataRow
                  principal={l.nom}
                  secondaire={`${l.quantite} × ${money.money(l.prixUnitaire, money.primaryCode)}`}
                  valeur={
                    <Text variant="bodySmall" numeric className="font-sans-medium">
                      {money.money(l.quantite * l.prixUnitaire, money.primaryCode)}
                    </Text>
                  }
                  onPress={() => setLignes((x) => x.filter((y) => y.produit !== l.produit))}
                  chevron={false}
                />
              </View>
            ))
          )}
          {lignes.length > 0 ? (
            <View className="border-t border-border px-4 py-3">
              <View className="flex-row items-baseline justify-between">
                <Text variant="label">Total</Text>
                <Text variant="body" numeric className="font-sans-medium">
                  {money.money(total, money.primaryCode)}
                </Text>
              </View>
            </View>
          ) : null}
        </Card>

        <Banner
          tone="info"
          title="Un devis n'engage pas le stock"
          message="La marchandise reste disponible pour quelqu'un d'autre. Elle ne sera réservée qu'à la conversion en vente."
        />

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement…" : "Créer le devis"}
        </Button>
      </View>

      <Sheet
        ouvert={feuille !== null}
        onFermer={() => {
          setFeuille(null);
          setChoisi(null);
        }}
        titre={feuille === "client" ? "Choisir un client" : "Ajouter un article"}
      >
        {feuille === "client" ? (
          <>
            <SearchInput
              valeur={recherche}
              onChange={setRecherche}
              placeholder="Nom, code, téléphone..."
            />
            <View>
              {(clients ?? []).slice(0, 8).map((c) => (
                <DataRow
                  key={c.id}
                  principal={c.name}
                  // `ClientPos` ne porte que ce dont le comptoir a besoin pour
                  // décider d'un crédit : pas de téléphone. On montre plutôt
                  // ce qui compte ici - le client doit-il déjà de l'argent.
                  secondaire={
                    Number(c.current_balance ?? 0) > 0
                      ? `Doit ${money.money(Number(c.current_balance), money.primaryCode)}`
                      : null
                  }
                  onPress={() => {
                    setClient({ id: c.id, nom: c.name });
                    setFeuille(null);
                  }}
                />
              ))}
            </View>
          </>
        ) : choisi ? (
          <>
            <Text variant="label">{choisi.nom}</Text>
            <FormField label="Quantité" required>
              <Input
                value={quantite}
                onChangeText={setQuantite}
                keyboardType="decimal-pad"
                autoFocus
              />
            </FormField>
            <FormField
              label="Prix unitaire"
              required
              hint="Modifiable : c'est tout l'objet d'un devis."
            >
              <Input value={prix} onChangeText={setPrix} keyboardType="decimal-pad" />
            </FormField>
            <View className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={() => setChoisi(null)}>
                Changer
              </Button>
              <Button className="flex-1" onPress={ajouter}>
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
                      {money.money(Number(a.selling_price), money.primaryCode)}
                    </Text>
                  }
                  onPress={() => {
                    setChoisi({
                      id: a.id,
                      nom: a.name,
                      prix: Number(a.selling_price),
                    });
                    setPrix(String(a.selling_price));
                  }}
                />
              ))}
            </View>
          </>
        )}
      </Sheet>
    </Screen>
  );
}
