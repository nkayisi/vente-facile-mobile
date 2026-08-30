/**
 * Mouvements de stock. Miroir de `app/dashboard/stock/movements/page.tsx`.
 *
 * Le back-office masque QUATRE de ses huit colonnes à cette largeur (entrepôt,
 * auteur, stock avant/après, valeur) et compense en glissant un rappel de
 * l'entrepôt sous le nom du produit. On garde cette intention : le nom, puis
 * l'entrepôt et la date, puis la quantité signée.
 *
 * La quantité est rendue dans les termes de la SAISIE D'ORIGINE, avec le
 * facteur figé sur la ligne, jamais redécoupée au conditionnement du jour.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useLecture } from "@/data/live";
import { TYPE_MOUVEMENT_STOCK, listeMouvements } from "@/data/mouvements";
import { entrepots } from "@/data/stock";
import { useSession } from "@/session/provider";
import {
  Badge, Button, Chip, ChipRow, DataList, DataRow, Icon, PageHeader, Screen,
  SearchInput, Text,
} from "@/ui";

const TABLES = ["stock_movements", "products", "warehouses", "units"];

export default function Mouvements() {
  const { can } = useSession();
  const [recherche, setRecherche] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [sens, setSens] = useState<boolean | null>(null);

  const charger = useCallback(
    () => listeMouvements({ recherche, type, entree: sens, limite: 150 }),
    [recherche, type, sens]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, type, sens],
  });
  const mouvements = donnees ?? [];

  return (
    <Screen edges={[]} padded={false}>
      <DataList
        donnees={mouvements}
        cle={(m) => m.id}
        chargement={chargement && mouvements.length === 0}
        enTete={
          <View className="gap-3 px-4 pb-3 pt-2">
            <PageHeader
              title="Mouvements de stock"
              subtitle="Historique des entrées et sorties de stock"
              actions={
                can("stock.adjust") ? (
                  <Button
                    size="sm"
                    leftIcon="Plus"
                    onPress={() => router.push("/mouvement/nouveau")}
                  >
                    Saisir un mouvement
                  </Button>
                ) : undefined
              }
            />
            <SearchInput
              valeur={recherche}
              onChange={setRecherche}
              placeholder="Rechercher un produit..."
            />
            <ChipRow>
              <Chip label="Tout" actif={sens === null} onPress={() => setSens(null)} />
              <Chip label="Entrées" actif={sens === true} onPress={() => setSens(true)} />
              <Chip label="Sorties" actif={sens === false} onPress={() => setSens(false)} />
            </ChipRow>
            {/* Douze types : ils DÉFILENT. Repliés, ils occuperaient quatre
                lignes avant le premier mouvement. */}
            <ChipRow>
              <Chip label="Tous les types" actif={type === null} onPress={() => setType(null)} />
              {Object.entries(TYPE_MOUVEMENT_STOCK).map(([code, t]) => (
                <Chip
                  key={code}
                  label={t.label}
                  actif={type === code}
                  onPress={() => setType(code)}
                />
              ))}
            </ChipRow>
          </View>
        }
        vide={{
          icon: "ClipboardList",
          titre: "Aucun mouvement",
          message:
            recherche || type || sens !== null
              ? "Aucun mouvement ne correspond à vos critères."
              : "Les mouvements de stock apparaîtront ici.",
        }}
        rendu={(m) => (
          <DataRow
            principal={m.produit}
            secondaire={[m.entrepot, m.date ? m.date.toLocaleDateString("fr-CD") : null]
              .filter(Boolean)
              .join(" · ") || null}
            badge={<Badge tone={m.entree ? "success" : "destructive"}>{m.typeLabel}</Badge>}
            valeur={
              <View className="flex-row items-center gap-1">
                <Icon
                  name={m.entree ? "ArrowDownRight" : "ArrowUpRight"}
                  size={14}
                  color={m.entree ? "success" : "destructive"}
                />
                <Text
                  variant="bodySmall"
                  numeric
                  className={
                    m.entree
                      ? "font-sans-semibold text-success"
                      : "font-sans-semibold text-destructive"
                  }
                >
                  {m.quantiteAffichee}
                </Text>
              </View>
            }
            chevron={false}
          />
        )}
      />
    </Screen>
  );
}
