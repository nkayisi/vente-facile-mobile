/**
 * Transferts de stock. Miroir de `app/dashboard/stock/transfers/page.tsx`.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { formatDateFr } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { FeuilleFiltresPerimetre } from "@/features/perimetre/feuille-perimetre";
import {
  afficheFiltresDePerimetre,
  nombreDeFiltresPerimetre,
  PERIMETRE_VIDE,
  resumeDuPerimetre,
  sansLeFiltrePerimetre,
  type FiltrePerimetre,
} from "@/features/perimetre/filtre-perimetre";
import { nomOuInconnu } from "@/features/perimetre/entrepots";
import { usePerimetre } from "@/features/perimetre/use-perimetre";
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
  BoutonFiltres,
  Chip,
  ChipRow,
  DataList,
  DataRow,
  Fab,
  Screen,
  SearchInput,
  Text,
  useListeFiche,
} from "@/ui";
import { FicheTransfert } from "@/features/stock/fiche-transfert";

const TABLES = ["stock_transfers", "stock_transfer_items", "warehouses"];

export default function Transferts() {
  // Sur un grand écran, la fiche s'ouvre à droite et la liste reste là.
  // Voir `ui/liste-fiche.tsx`.
  const listeFiche = useListeFiche({
    chemin: (id) => `/transfert/${id}`,
    Fiche: FicheTransfert,
    vide: {
      icon: "ArrowLeftRight",
      titre: "Choisissez un transfert",
      message: "Sa fiche s'ouvre ici, la liste reste à côté.",
    },
  });
  const { can, snapshot } = useSession();
  // L'annuaire nomme les dépôts hors de mon périmètre : un transfert reçu
  // vient presque toujours de l'un d'eux.
  const annuaire = snapshot?.warehouse_directory;
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<string | null>(null);
  const [feuille, setFeuille] = useState(false);

  // ENTREPÔT SEUL : cette donnée n'a pas d'auteur au sens du filtre.
  // `avecAuteur: false` ferme le champ « Utilisateur » AVEC son motif,
  // plutôt que de le retirer - un contrôle absent se lit comme une
  // fonction manquante, un contrôle fermé se lit comme une règle.
  const [choixPerimetre, setChoixPerimetre] = useState<FiltrePerimetre>(PERIMETRE_VIDE);
  const [feuillePerimetre, setFeuillePerimetre] = useState(false);
  const perimetre = usePerimetre(choixPerimetre, false);
  const applique = perimetre.applique;

  const charger = useCallback(
    () => listeTransferts({ recherche, statut, entrepot: applique.entrepot, entrepots: applique.entrepots, annuaire }),
    [recherche, statut, applique, annuaire]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, statut, applique, annuaire],
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
            placeholder="Rechercher une référence..."
          />
        </View>
        {afficheFiltresDePerimetre(perimetre) ? (
          <BoutonFiltres
            actifs={nombreDeFiltresPerimetre(perimetre)}
            onPress={() => setFeuillePerimetre(true)}
          />
        ) : null}
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
        secondaire={`${nomOuInconnu(t.source)} → ${nomOuInconnu(t.destination)}`}
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
        onPress={() => listeFiche.ouvrir(t.id)}
        selectionne={listeFiche.selection === t.id}
      />
    );
  };

  return listeFiche.rendre(
    <Screen padded={false}>
      <AppBar
        title="Transferts de stock"
        subtitle={`Gérez les transferts entre entrepôts (${donnees?.total ?? 0} au total)`}
      />
      <DataList
        selection={listeFiche.selection}
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
            listeFiche.ouvrir(id);
          }}
        />
      ) : null}
      <FeuilleFiltresPerimetre
        ouvert={feuillePerimetre}
        onFermer={() => setFeuillePerimetre(false)}
        valeur={choixPerimetre}
        onChanger={setChoixPerimetre}
        offre={perimetre}
        libelleResultats="Voir les transferts"
      />
    </Screen>
  );
}
