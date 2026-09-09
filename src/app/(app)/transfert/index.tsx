/**
 * Transferts de stock. Miroir de `app/dashboard/stock/transfers/page.tsx`.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import {
  STATUT_TRANSFERT,
  listeTransferts,
  type TransfertResume,
} from "@/data/stock-operations";
import { enAttenteSurStock } from "@/features/stock/actes";
import { FeuilleNouveauTransfert } from "@/features/stock/feuille-transfert";
import { useSession } from "@/session/provider";
import {
  AppBar,
  Badge,
  Chip,
  ChipRow,
  DataList,
  DataRow,
  Fab,
  Screen,
  SearchInput,
  Text,
} from "@/ui";

const TABLES = ["stock_transfers", "stock_transfer_items", "warehouses"];

export default function Transferts() {
  const { can } = useSession();
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<string | null>(null);
  const [feuille, setFeuille] = useState(false);

  const charger = useCallback(
    () => listeTransferts({ recherche, statut }),
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
        placeholder="Rechercher une référence..."
      />
      <ChipRow>
        <Chip label="Tous" actif={statut === null} onPress={() => setStatut(null)} />
        {Object.entries(STATUT_TRANSFERT).map(([code, s]) => (
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

  const rendu = (t: TransfertResume) => {
    const s = STATUT_TRANSFERT[t.statut];
    const enFile = attente?.transferts.has(t.id) ?? false;
    return (
      <DataRow
        principal={t.reference}
        secondaire={`${t.source ?? "?"} → ${t.destination ?? "?"}`}
        badge={
          enFile ? (
            <Badge tone="warning">En attente d&apos;envoi</Badge>
          ) : s ? (
            <Badge tone={s.ton}>{s.label}</Badge>
          ) : undefined
        }
        valeur={
          <Text variant="bodySmall" numeric className="font-sans-medium">
            {`${t.nbLignes} ${t.nbLignes > 1 ? "articles" : "article"}`}
          </Text>
        }
        sousValeur={t.date ? formatDateFr(t.date) : null}
        onPress={() => router.push(`/transfert/${t.id}`)}
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar
        title="Transferts de stock"
        subtitle={`Gérez les transferts entre entrepôts (${donnees?.total ?? 0} au total)`}
      />
      <DataList
        donnees={elements}
        cle={(t) => t.id}
        rendu={rendu}
        enTete={enTete}
        chargement={chargement && elements.length === 0}
        vide={{
          icon: "ArrowLeftRight",
          titre: "Aucun transfert",
          message: recherche
            ? "Aucun transfert ne correspond à votre recherche."
            : "Créez un transfert pour déplacer du stock entre entrepôts.",
        }}
      />
      {can("stock_transfers.create") ? (
        <Fab icon="Plus" label="Nouveau transfert" onPress={() => setFeuille(true)} />
      ) : null}

      {/* Rendue CONDITIONNELLEMENT : chaque ouverture est un montage, donc un
          formulaire vierge. Voir la docstring de la feuille. */}
      {feuille ? (
        <FeuilleNouveauTransfert
          onFermer={() => setFeuille(false)}
          onCree={(id) => {
            setFeuille(false);
            router.push(`/transfert/${id}`);
          }}
        />
      ) : null}
    </Screen>
  );
}
