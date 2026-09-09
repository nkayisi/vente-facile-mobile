/**
 * Ajustements de stock. Miroir de `app/dashboard/stock/adjustments/page.tsx`.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import {
  STATUT_AJUSTEMENT,
  listeAjustements,
  type AjustementResume,
} from "@/data/stock-operations";
import { enAttenteSurStock } from "@/features/stock/actes";
import { FeuilleNouvelAjustement } from "@/features/stock/feuille-ajustement";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, Chip, ChipRow, DataList, DataRow, Fab, Screen, SearchInput, Text,
} from "@/ui";

const TABLES = ["stock_adjustments", "stock_adjustment_items", "warehouses"];

export default function Ajustements() {
  const { can } = useSession();
  const [recherche, setRecherche] = useState("");
  const [feuille, setFeuille] = useState(false);
  const [statut, setStatut] = useState<string | null>(null);

  const charger = useCallback(
    () => listeAjustements({ recherche, statut }),
    [recherche, statut]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, statut],
  });
  const { donnees: attente } = useLecture(enAttenteSurStock, {
    tables: ["outbox_operations"],
  });

  const elements = donnees?.elements ?? [];

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder="Rechercher une référence ou un motif..."
      />
      <ChipRow>
        <Chip label="Tous" actif={statut === null} onPress={() => setStatut(null)} />
        {Object.entries(STATUT_AJUSTEMENT).map(([code, s]) => (
          <Chip
            key={code}
            label={s.label}
            actif={statut === code}
            onPress={() => setStatut(code)}
          />
        ))}
      </ChipRow>
    </View>
  );

  const rendu = (a: AjustementResume) => {
    const s = STATUT_AJUSTEMENT[a.statut];
    const enFile = attente?.ajustements.has(a.id) ?? false;
    return (
      <DataRow
        principal={a.reference}
        secondaire={[a.typeLabel, a.entrepot].filter(Boolean).join(" · ")}
        badge={
          enFile ? (
            <Badge tone="warning">En attente d&apos;envoi</Badge>
          ) : s ? (
            <Badge tone={s.ton}>{s.label}</Badge>
          ) : undefined
        }
        valeur={
          <Text variant="bodySmall" numeric className="font-sans-medium">
            {`${a.nbLignes} ${a.nbLignes > 1 ? "articles" : "article"}`}
          </Text>
        }
        sousValeur={a.date ? formatDateFr(a.date) : null}
        onPress={() => router.push(`/ajustement/${a.id}`)}
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar
        title="Ajustements de stock"
        subtitle="Corrections d'inventaire et pertes"
      />
      <DataList
        donnees={elements}
        cle={(a) => a.id}
        rendu={rendu}
        enTete={enTete}
        chargement={chargement && elements.length === 0}
        vide={{
          icon: "SlidersHorizontal",
          titre: "Aucun ajustement",
          message: recherche
            ? "Aucun ajustement ne correspond à votre recherche."
            : "Créez un ajustement pour corriger un écart de stock.",
        }}
      />
      {can("stock_adjustments.create") ? (
        <Fab icon="Plus" label="Nouvel ajustement" onPress={() => setFeuille(true)} />
      ) : null}

      {/* Rendue CONDITIONNELLEMENT : chaque ouverture est un montage, donc un
          formulaire vierge. Voir la docstring de la feuille. */}
      {feuille ? (
        <FeuilleNouvelAjustement
          onFermer={() => setFeuille(false)}
          onCree={(id) => {
            setFeuille(false);
            router.push(`/ajustement/${id}`);
          }}
        />
      ) : null}
    </Screen>
  );
}
