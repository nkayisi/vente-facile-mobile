/**
 * Saisir un mouvement de stock : entrée, sortie, perte.
 *
 * **La quantité peut se saisir en CONTENANTS, en unités, ou les deux.** La
 * conversion est faite par le serveur : un `paquets × facteur + vrac` calculé
 * ici serait une seconde arithmétique du conditionnement, et elle finirait par
 * diverger. C'est la même raison qui met tous les calculs du comptoir dans
 * `@vente-facile/core`.
 *
 * Le TYPE décide du sens, et le libellé le dit : « Achat » ajoute, « Perte »
 * retire. Un écran qui demanderait un nombre signé ferait saisir des «-5» qui
 * augmentent le stock une fois sur deux.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useLecture } from "@/data/live";
import { entrepots } from "@/data/stock";
import { TYPE_MOUVEMENT_STOCK } from "@/data/mouvements";
import { chercherArticles } from "@/features/pos/catalogue";
import { creerMouvement } from "@/features/stock/actes";
import {
  AppBar, Banner, Button, Card, Chip, ChipRow, DataRow, FormField, Input,
  Screen, SearchInput, Sheet, Text, useToast,
} from "@/ui";

/** Les types qu'un terminal saisit à la main. Les autres viennent d'un acte. */
const TYPES_SAISISSABLES = [
  "purchase", "adjustment_in", "adjustment_out", "damage", "expired", "initial",
] as const;

export default function NouveauMouvement() {
  const toast = useToast();

  const [entrepot, setEntrepot] = useState<string | null>(null);
  const [type, setType] = useState<string>("purchase");
  const [article, setArticle] = useState<{
    id: string;
    nom: string;
    facteur: number | null;
    uniteContenant: string | null;
    uniteDetail: string | null;
  } | null>(null);
  const [contenants, setContenants] = useState("");
  const [vrac, setVrac] = useState("");
  const [cout, setCout] = useState("");
  const [notes, setNotes] = useState("");
  const [feuille, setFeuille] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const { donnees: depots } = useLecture(entrepots, { tables: ["warehouses"] });
  const chargerArticles = useCallback(
    () =>
      entrepot
        ? chercherArticles({ warehouseId: entrepot, terme: recherche, limite: 40 })
        : Promise.resolve([]),
    [entrepot, recherche]
  );
  const { donnees: articles } = useLecture(chargerArticles, {
    tables: ["products", "stocks"],
    deps: [entrepot, recherche],
  });

  const nContenants = Number(contenants.replace(",", ".")) || 0;
  const nVrac = Number(vrac.replace(",", ".")) || 0;
  const rienSaisi = nContenants <= 0 && nVrac <= 0;
  const bloque = envoi || !entrepot || !article || rienSaisi;

  const entree = TYPE_MOUVEMENT_STOCK[type]?.entree ?? true;

  const valider = async () => {
    if (bloque || !entrepot || !article) return;
    setEnvoi(true);
    try {
      await creerMouvement({
        produit: article.id,
        entrepot,
        type,
        // On envoie les DEUX compteurs tels que saisis, et rien d'autre : le
        // serializer fait la conversion, comme pour le back-office.
        ...(article.facteur && nContenants > 0 ? { contenants: nContenants } : {}),
        ...(nVrac > 0 || !article.facteur
          ? { vrac: article.facteur ? nVrac : undefined, quantite: article.facteur ? undefined : nVrac }
          : {}),
        ...(cout.trim() ? { coutUnitaire: Number(cout.replace(",", ".")) } : {}),
        notes,
      });
      toast.succes("Mouvement mis en file. Il partira à la prochaine synchronisation.");
      router.back();
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "Le mouvement n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title="Mouvement de stock" />

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

          <FormField
            label="Type de mouvement"
            required
            hint={entree ? "Ce type AJOUTE du stock." : "Ce type RETIRE du stock."}
          >
            <ChipRow>
              {TYPES_SAISISSABLES.map((t) => (
                <Chip
                  key={t}
                  label={TYPE_MOUVEMENT_STOCK[t]?.label ?? t}
                  actif={type === t}
                  onPress={() => setType(t)}
                />
              ))}
            </ChipRow>
          </FormField>

          <FormField label="Article" required>
            <Button
              variant="outline"
              fullWidth
              disabled={!entrepot}
              onPress={() => setFeuille(true)}
            >
              {article?.nom ?? "Choisir un article"}
            </Button>
          </FormField>

          {article ? (
            <>
              {article.facteur ? (
                <FormField
                  label={`Contenants (${article.uniteContenant ?? "carton"})`}
                  hint={`Chacun vaut ${article.facteur} ${article.uniteDetail ?? "unités"}.`}
                >
                  <Input
                    value={contenants}
                    onChangeText={setContenants}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </FormField>
              ) : null}
              <FormField
                label={
                  article.facteur
                    ? `Unités isolées (${article.uniteDetail ?? "unité"})`
                    : `Quantité (${article.uniteDetail ?? "unité"})`
                }
                required={!article.facteur}
              >
                <Input
                  value={vrac}
                  onChangeText={setVrac}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
              </FormField>
              {entree ? (
                <FormField
                  label="Coût unitaire"
                  hint="Facultatif. Il met à jour le coût moyen pondéré."
                >
                  <Input
                    value={cout}
                    onChangeText={setCout}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </FormField>
              ) : null}
            </>
          ) : null}

          <FormField label="Notes">
            <Input value={notes} onChangeText={setNotes} placeholder="Fournisseur, motif…" />
          </FormField>
        </Card>

        {!entree ? (
          <Banner
            tone="warning"
            title="Ce mouvement retire du stock"
            message="Il sera appliqué à la synchronisation, et se corrige ensuite par un mouvement inverse."
          />
        ) : null}

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement…" : "Enregistrer le mouvement"}
        </Button>
      </View>

      <Sheet ouvert={feuille} onFermer={() => setFeuille(false)} titre="Choisir un article">
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
              onPress={() => {
                setArticle({
                  id: a.id,
                  nom: a.name,
                  facteur: a.units_per_package && a.units_per_package > 1 ? a.units_per_package : null,
                  uniteContenant: a.packaging_unit_name,
                  uniteDetail: a.unit_name,
                });
                setFeuille(false);
              }}
            />
          ))}
          {(articles ?? []).length === 0 ? (
            <Text variant="caption">Aucun produit trouvé.</Text>
          ) : null}
        </View>
      </Sheet>
    </Screen>
  );
}
