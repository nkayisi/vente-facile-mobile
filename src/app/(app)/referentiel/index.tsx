/**
 * Catégories, marques et unités. Miroir des trois pages du back-office,
 * réunies derrière un segment.
 *
 * **Trois listes de même nature derrière un segment plutôt qu'une navigation
 * imbriquée** : on passe de l'une à l'autre d'un geste au lieu de deux allers,
 * exactement le choix déjà fait pour Clients & Fournisseurs.
 *
 * **Une UNITÉ n'a pas de `slug`, elle a un symbole** ; une catégorie et une
 * marque en exigent un, que le serveur ne dérive pas. Il est fabriqué depuis le
 * nom (`slugifier`), comme le formulaire web le fait.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";

import { referentiel, type EntreeReferentiel } from "@/data/articles";
import { useLecture } from "@/data/live";
import {
  catalogueEnAttente,
  creerReferentiel,
} from "@/features/inventaire/actes";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, Button, DataList, DataRow, Fab, FormField, Input, Screen,
  Segmented, Sheet, Text, useToast,
} from "@/ui";

type Genre = "categories" | "marques" | "unites";

const TABLES: Record<Genre, string[]> = {
  categories: ["categories", "products"],
  marques: ["brands", "products"],
  unites: ["units", "products"],
};

const ACTE: Record<Genre, "category" | "brand" | "unit"> = {
  categories: "category",
  marques: "brand",
  unites: "unit",
};

const SINGULIER: Record<Genre, string> = {
  categories: "catégorie",
  marques: "marque",
  unites: "unité",
};

export default function Referentiels() {
  const toast = useToast();
  const { can } = useSession();
  const [genre, setGenre] = useState<Genre>("categories");
  const [feuille, setFeuille] = useState(false);
  const [nom, setNom] = useState("");
  const [symbole, setSymbole] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => referentiel(genre), [genre]);
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES[genre],
    deps: [genre],
  });
  const { donnees: attente } = useLecture(catalogueEnAttente, {
    tables: ["outbox_operations"],
  });

  const elements = donnees ?? [];

  const valider = async () => {
    if (envoi || nom.trim().length === 0) return;
    setEnvoi(true);
    try {
      await creerReferentiel(ACTE[genre], { nom, symbole });
      toast.succes(
        `${SINGULIER[genre].charAt(0).toUpperCase()}${SINGULIER[genre].slice(1)} créée. Elle partira à la prochaine synchronisation.`
      );
      setNom("");
      setSymbole("");
      setFeuille(false);
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    } finally {
      setEnvoi(false);
    }
  };

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <Segmented
        options={[
          { valeur: "categories", label: "Catégories", icon: "FolderTree" },
          { valeur: "marques", label: "Marques", icon: "Tag" },
          { valeur: "unites", label: "Unités", icon: "Ruler" },
        ]}
        valeur={genre}
        onChange={(v) => setGenre(v as Genre)}
      />
      {(attente?.referentiels ?? 0) > 0 ? (
        <Text variant="caption">
          {`${attente?.referentiels} entrée(s) attendent leur envoi et n'apparaissent pas encore ici.`}
        </Text>
      ) : null}
    </View>
  );

  const rendu = (e: EntreeReferentiel) => (
    <DataRow
      principal={e.nom}
      secondaire={e.detail}
      badge={e.actif ? undefined : <Badge tone="neutral">Inactive</Badge>}
      valeur={
        <Text variant="bodySmall" numeric className="font-sans-medium">
          {/* Le nombre de produits est la seule mesure utile ici : il dit si
              l'entrée sert, et si la supprimer casserait quelque chose. */}
          {String(e.produits)}
        </Text>
      }
      sousValeur={e.produits > 1 ? "produits" : "produit"}
      chevron={false}
    />
  );

  return (
    <Screen padded={false}>
      <AppBar title="Catégories, marques et unités" />
      <DataList
        donnees={elements}
        cle={(e) => e.id}
        rendu={rendu}
        enTete={enTete}
        chargement={chargement && elements.length === 0}
        vide={{
          icon: genre === "categories" ? "FolderTree" : genre === "marques" ? "Tag" : "Ruler",
          titre: `Aucune ${SINGULIER[genre]}`,
          message: `Créez votre première ${SINGULIER[genre]} pour organiser le catalogue.`,
        }}
      />
      {can("products.create") ? (
        <Fab icon="Plus" label="Nouvelle" onPress={() => setFeuille(true)} />
      ) : null}

      <Sheet
        ouvert={feuille}
        onFermer={() => setFeuille(false)}
        titre={`Nouvelle ${SINGULIER[genre]}`}
      >
        <FormField label="Nom" required>
          <Input value={nom} onChangeText={setNom} autoFocus />
        </FormField>
        {genre === "unites" ? (
          <FormField
            label="Symbole"
            hint="Ce qui s'imprime sur un ticket : kg, L, pce. À défaut, le nom."
          >
            <Input value={symbole} onChangeText={setSymbole} />
          </FormField>
        ) : null}
        <Button
          fullWidth
          size="lg"
          disabled={envoi || nom.trim().length === 0}
          onPress={() => void valider()}
        >
          {envoi ? "Enregistrement…" : "Créer"}
        </Button>
      </Sheet>
    </Screen>
  );
}
