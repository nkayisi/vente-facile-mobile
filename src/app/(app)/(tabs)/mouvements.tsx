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
import { View } from "react-native";

import { useLecture } from "@/data/live";
import { listeMouvements } from "@/data/mouvements";
import { Badge, DataList, DataRow, Icon, PageHeader, Screen, Text } from "@/ui";

const TABLES = ["stock_movements", "products", "warehouses", "units"];

export default function Mouvements() {
  const { donnees, chargement } = useLecture(() => listeMouvements(100), { tables: TABLES });
  const mouvements = donnees ?? [];

  return (
    <Screen edges={[]} padded={false}>
      <DataList
        donnees={mouvements}
        cle={(m) => m.id}
        chargement={chargement && mouvements.length === 0}
        enTete={
          <View className="gap-2 px-4 pb-3 pt-2">
            <PageHeader
              title="Mouvements de stock"
              subtitle="Historique des entrées et sorties de stock"
            />
            <Text variant="caption">
              La saisie d'un mouvement et les filtres arrivent au lot 7.
            </Text>
          </View>
        }
        vide={{
          icon: "ClipboardList",
          titre: "Aucun mouvement",
          message: "Les mouvements de stock apparaîtront ici.",
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
