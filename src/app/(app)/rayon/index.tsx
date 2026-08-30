/**
 * Niveaux de stock. Miroir de `app/dashboard/stock/stock-levels/page.tsx`.
 *
 * **Les filtres sont poussés dans le SQL**, jamais appliqués après coup sur une
 * page déjà tronquée. Le back-office paginait et filtrait en mémoire, si bien
 * qu'un export ne couvrait pas le même périmètre que l'écran : c'est le défaut
 * qu'il a dû corriger sur cette page précise.
 *
 * **Le total en unités reste SOUS la lecture en contenants** : le premier sert
 * au réassort, le second au comptoir.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatPrice } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import {
  ETAT_STOCK,
  niveauxDeStock,
  type EtatStock,
  type LigneNiveau,
} from "@/data/stock-niveaux";
import { entrepots } from "@/data/stock";
import {
  AppBar,
  Badge,
  Chip,
  ChipRow,
  DataList,
  DataRow,
  Screen,
  SearchInput,
  StatValue,
  Text,
} from "@/ui";

const TABLES = ["stocks", "products", "warehouses", "categories", "units"];

export default function Niveaux() {
  const [recherche, setRecherche] = useState("");
  const [entrepot, setEntrepot] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatStock>("tous");

  const charger = useCallback(
    () => niveauxDeStock({ recherche, entrepot, etat, limite: 300 }),
    [recherche, entrepot, etat]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, entrepot, etat],
  });
  const { donnees: depots } = useLecture(entrepots, { tables: ["warehouses"] });

  const lignes = donnees?.elements ?? [];

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder="Rechercher un produit..."
      />
      {(depots?.length ?? 0) > 1 ? (
        <ChipRow>
          <Chip
            label="Tous les entrepôts"
            actif={entrepot === null}
            onPress={() => setEntrepot(null)}
          />
          {(depots ?? []).map((d) => (
            <Chip
              key={d.id}
              label={d.nom}
              actif={entrepot === d.id}
              onPress={() => setEntrepot(d.id)}
            />
          ))}
        </ChipRow>
      ) : null}
      <ChipRow>
        <Chip label="Tout" actif={etat === "tous"} onPress={() => setEtat("tous")} />
        {(Object.keys(ETAT_STOCK) as (keyof typeof ETAT_STOCK)[]).map((cle) => (
          <Chip
            key={cle}
            label={ETAT_STOCK[cle].label}
            actif={etat === cle}
            onPress={() => setEtat(cle)}
          />
        ))}
      </ChipRow>
    </View>
  );

  const rendu = (l: LigneNiveau) => {
    const e = ETAT_STOCK[l.etat];
    return (
      <DataRow
        principal={l.produit}
        secondaire={[l.sku, l.entrepot].filter(Boolean).join(" · ") || null}
        badge={l.etat !== "ok" ? <Badge tone={e.ton}>{e.label}</Badge> : undefined}
        valeur={<StatValue value={l.disponibleAffiche} />}
        // Le total brut n'apparaît QUE s'il diffère de la lecture affichée :
        // « 12 au total » sous « 12 pièces » est du bruit.
        sousValeur={l.facteur ? `${l.total} au total` : null}
        onPress={() => router.push(`/rayon/${l.id}`)}
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar
        title="Niveaux de stock"
        subtitle={
          etat === "bas"
            ? "Produits en stock bas"
            : "Vue d'ensemble de tout le stock"
        }
      />
      <DataList
        donnees={lignes}
        cle={(l) => l.id}
        rendu={rendu}
        enTete={enTete}
        chargement={chargement && lignes.length === 0}
        vide={{
          icon: "Boxes",
          titre: "Aucun stock",
          message: recherche
            ? "Aucun produit ne correspond à vos critères."
            : "Aucune ligne de stock sur ce périmètre.",
        }}
      />
    </Screen>
  );
}
