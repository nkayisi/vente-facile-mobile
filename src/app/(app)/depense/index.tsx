/**
 * Dépenses. Miroir de `app/dashboard/cashbook/expenses/page.tsx`.
 */
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr } from "@vente-facile/core";

import { STATUT_DEPENSE, listeDepenses, type DepenseResume } from "@/data/caisse";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { enAttenteCaisse } from "@/features/caisse/actes";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, DataList, DataRow, Fab, Screen, Mesure,
} from "@/ui";

const TABLES = ["expenses", "expense_categories"];

export default function Depenses() {
  const money = useMonnaie();
  const { can } = useSession();
  const { donnees, chargement } = useLecture(() => listeDepenses(100), { tables: TABLES });
  const { donnees: attente } = useLecture(enAttenteCaisse, {
    tables: ["outbox_operations"],
  });

  const depenses = donnees ?? [];

  const rendu = (d: DepenseResume) => {
    const s = STATUT_DEPENSE[d.statut];
    return (
      <DataRow
        principal={d.description || d.reference || "Dépense"}
        secondaire={[d.categorie, d.date ? formatDateFr(d.date) : null]
          .filter(Boolean)
          .join(" · ")}
        badge={s ? <Badge tone={s.ton}>{s.label}</Badge> : undefined}
        valeur={<Mesure value={money.money(d.montant, d.devise)} tone="destructive" />}
        onPress={() => router.push(`/depense/${d.id}`)}
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar title="Dépenses" subtitle="Sorties de caisse et charges" />
      <DataList
        donnees={depenses}
        cle={(d) => d.id}
        rendu={rendu}
        enTete={
          attente && attente.depenses.nombre > 0 ? (
            <View className="px-4 pt-2">
              <BandeauEnvoi
                envoi={attente.depenses.envoi}
                titre={
                  attente.depenses.nombre === 1
                    ? "Une dépense attend son envoi"
                    : `${attente.depenses.nombre} dépenses attendent leur envoi`
                }
                consequence="Elles n'apparaissent pas encore dans cette liste."
              />
            </View>
          ) : undefined
        }
        chargement={chargement && depenses.length === 0}
        vide={{
          icon: "Receipt",
          titre: "Aucune dépense",
          message: "Enregistrez vos charges pour suivre la caisse au plus juste.",
        }}
      />
      {can("cashbook.create_expense") ? (
        <Fab icon="Plus" label="Nouvelle" onPress={() => router.push("/depense/nouvelle")} />
      ) : null}
    </Screen>
  );
}
