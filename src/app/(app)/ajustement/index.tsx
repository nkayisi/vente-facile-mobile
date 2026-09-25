/**
 * Ajustements de stock. Miroir de `app/dashboard/stock/adjustments/page.tsx`.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { FeuilleFiltresPerimetre } from "@/features/perimetre/feuille-perimetre";
import {
  nombreDeFiltresPerimetre,
  PERIMETRE_VIDE,
  resumeDuPerimetre,
  sansLeFiltrePerimetre,
  type FiltrePerimetre,
} from "@/features/perimetre/filtre-perimetre";
import { usePerimetre } from "@/features/perimetre/use-perimetre";
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
  BoutonFiltres,
} from "@/ui";

const TABLES = ["stock_adjustments", "stock_adjustment_items", "warehouses"];

export default function Ajustements() {
  const { can } = useSession();
  const [recherche, setRecherche] = useState("");
  const [feuille, setFeuille] = useState(false);
  const [statut, setStatut] = useState<string | null>(null);

  // ENTREPÔT SEUL : cette donnée n'a pas d'auteur au sens du filtre.
  // `avecAuteur: false` ferme le champ « Utilisateur » AVEC son motif,
  // plutôt que de le retirer - un contrôle absent se lit comme une
  // fonction manquante, un contrôle fermé se lit comme une règle.
  const [choixPerimetre, setChoixPerimetre] = useState<FiltrePerimetre>(PERIMETRE_VIDE);
  const [feuillePerimetre, setFeuillePerimetre] = useState(false);
  const perimetre = usePerimetre(choixPerimetre, false);
  const applique = perimetre.applique;

  const charger = useCallback(
    () => listeAjustements({ recherche, statut, entrepot: applique.entrepot }),
    [recherche, statut, applique]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, statut, applique],
  });
  const { donnees: attente } = useLecture(enAttenteSurStock, {
    tables: ["outbox_operations"],
  });

  const elements = donnees?.elements ?? [];

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <SearchInput
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Rechercher une référence ou un motif..."
          />
        </View>
        <BoutonFiltres
          actifs={nombreDeFiltresPerimetre(perimetre)}
          onPress={() => setFeuillePerimetre(true)}
        />
      </View>

      {resumeDuPerimetre(perimetre).length > 0 ? (
        <ChipRow>
          {resumeDuPerimetre(perimetre).map((puce) => {
            // Un SEUL handler pour la croix et pour le corps de la puce : ils ne
            // peuvent donc pas diverger, et l'appui que le `Pressable` imbriqué
            // fait éventuellement remonter est sans conséquence - retirer deux
            // fois le même filtre donne le même état qu'une fois.
            const retirer = () =>
            setChoixPerimetre(sansLeFiltrePerimetre(choixPerimetre, puce.cle));
            return (
              <Chip
                key={puce.cle}
                label={puce.label}
                actif
                onPress={retirer}
                onRetirer={retirer}
              />
            );
          })}
        </ChipRow>
      ) : null}
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
      <FeuilleFiltresPerimetre
        ouvert={feuillePerimetre}
        onFermer={() => setFeuillePerimetre(false)}
        valeur={choixPerimetre}
        onChanger={setChoixPerimetre}
        offre={perimetre}
        libelleResultats="Voir les ajustements"
      />
    </Screen>
  );
}
