/**
 * Réquisitions de produits : ce qu'il faut acheter.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE SE SAISIT AU FOND DU DÉPÔT, DEVANT LE RAYON VIDE.                  │
 * │                                                                          │
 * │ C'est l'endroit du magasin où il y a le moins de réseau, et c'est        │
 * │ pourquoi la PROPOSITION se calcule en local (`lignesProposees`) et que   │
 * │ les cinq actes passent par le journal. Le serveur a son endpoint         │
 * │ `proposer`, pour le back-office ; les deux partent du MÊME critère.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA LISTE FUSIONNE LE JOURNAL. Les tables tirées ne sont écrites que par le
 * tirage : sans cette fusion, une réquisition saisie il y a trois secondes
 * serait déclarée introuvable par sa propre liste. Corollaire systématique
 * déjà payé sur les retours, les devis et les ventes.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { libelleEnvoi } from "@/data/envoi";
import {
  STATUT_REQUISITION,
  TABLES_REQUISITIONS,
  listeRequisitions,
  type Requisition,
} from "@/data/requisitions";
import { FeuilleFiltresPerimetre } from "@/features/perimetre/feuille-perimetre";
import {
  nombreDeFiltresPerimetre,
  PERIMETRE_VIDE,
  resumeDuPerimetre,
  sansLeFiltrePerimetre,
  type FiltrePerimetre,
} from "@/features/perimetre/filtre-perimetre";
import { usePerimetre } from "@/features/perimetre/use-perimetre";
import { FeuilleNouvelleRequisition } from "@/features/stock/feuille-requisition";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, BoutonFiltres, Chip, ChipRow, DataList, DataRow, Fab,
  Screen, SearchInput, Text,
} from "@/ui";

/**
 * La taille d'un cran de fenêtre.
 *
 * Même valeur que l'historique des ventes : assez pour remplir plusieurs
 * écrans, assez peu pour qu'un terminal d'entrée de gamme ne la sente pas.
 */
const PAGE = 50;

/** Le ton de chaque statut. Celui du serveur, pas un jugement d'écran. */
const TON: Record<string, "neutral" | "warning" | "success" | "destructive"> = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "neutral",
};

export default function Requisitions() {
  const { can } = useSession();
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<string | null>(null);
  const [feuille, setFeuille] = useState(false);

  // ENTREPÔT SEUL : une réquisition a bien un auteur côté serveur, mais le
  // filtre « Utilisateur » ne borne aucune lecture ici - `requisitions` n'a
  // pas de portée par créateur. Le champ se ferme AVEC son motif plutôt que de
  // disparaître : un contrôle absent se lit comme une fonction manquante.
  const [choixPerimetre, setChoixPerimetre] = useState<FiltrePerimetre>(PERIMETRE_VIDE);
  const [feuillePerimetre, setFeuillePerimetre] = useState(false);
  const perimetre = usePerimetre(choixPerimetre, false);
  const applique = perimetre.applique;

  // ┌──────────────────────────────────────────────────────────────────────────┐
  // │ UNE FENÊTRE QUI S'AGRANDIT, ET UN TOTAL QUI DIT LA VÉRITÉ.              │
  // │                                                                          │
  // │ La liste s'arrêtait à deux cents lignes SANS RIEN DIRE : au-delà, une    │
  // │ réquisition n'était atteignable par aucun geste, et le sous-titre        │
  // │ annonçait pourtant « au total ». Le motif est celui de l'historique des  │
  // │ ventes - `limite: pages * PAGE`, un total calculé à part, et le `onFin`  │
  // │ de `DataList` qui agrandit.                                              │
  // └──────────────────────────────────────────────────────────────────────────┘
  const [pages, setPages] = useState(1);

  // Chaque changement de filtre repart de la première fenêtre : garder trois
  // pages d'un résultat qui n'en compte plus qu'une ferait défiler dans le vide.
  const refiltrer = useCallback((geste: () => void) => {
    setPages(1);
    geste();
  }, []);

  const charger = useCallback(
    () =>
      listeRequisitions({
        recherche,
        statut,
        entrepot: applique.entrepot,
        limite: pages * PAGE,
      }),
    [recherche, statut, applique, pages]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES_REQUISITIONS,
    deps: [recherche, statut, applique, pages],
  });

  const elements = donnees?.elements ?? [];
  const total = donnees?.total ?? 0;

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <SearchInput
            valeur={recherche}
            onChange={(v) => refiltrer(() => setRecherche(v))}
            placeholder="Rechercher une référence..."
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
            const retirer = () =>
              refiltrer(() =>
                setChoixPerimetre(sansLeFiltrePerimetre(choixPerimetre, puce.cle))
              );
            return (
              <Chip key={puce.cle} label={puce.label} actif onPress={retirer} onRetirer={retirer} />
            );
          })}
        </ChipRow>
      ) : null}

      <ChipRow>
        <Chip
          label="Toutes"
          actif={statut === null}
          onPress={() => refiltrer(() => setStatut(null))}
        />
        {Object.entries(STATUT_REQUISITION).map(([code, label]) => (
          <Chip
            key={code}
            label={label}
            actif={statut === code}
            onPress={() => refiltrer(() => setStatut(code))}
          />
        ))}
      </ChipRow>
    </View>
  );

  const rendu = (r: Requisition) => {
    // Le ton vient de `data/envoi`, pas d'un test d'écran : deux écrans qui
    // peignent différemment le même état font douter qu'il s'agisse du même.
    const enFile = libelleEnvoi(r.envoi);
    return (
      <DataRow
        principal={r.reference}
        secondaire={r.entrepot ?? (enFile ? enFile.court : null)}
        badge={
          // ⚠ L'ÉTAT D'ENVOI PASSE DEVANT LE STATUT : ce qui n'est pas encore
          // parti prime sur ce que le serveur en dira. Et « bloqué » n'est pas
          // « en attente » - le premier attend une DÉCISION, pas le réseau.
          enFile ? (
            <Badge tone={enFile.ton}>{enFile.court}</Badge>
          ) : (
            <Badge tone={TON[r.statut] ?? "neutral"}>{r.statutLabel}</Badge>
          )
        }
        valeur={
          <Text variant="bodySmall" numeric className="font-sans-medium">
            {`${r.nbLignes} ${r.nbLignes > 1 ? "articles" : "article"}`}
          </Text>
        }
        sousValeur={r.demandeLe ? formatDateFr(r.demandeLe) : null}
        onPress={() => router.push(`/requisition/${r.id}`)}
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar
        title="Réquisitions"
        subtitle={`Ce qu'il faut acheter (${total} au total)`}
      />
      <DataList
        donnees={elements}
        cle={(r) => r.id}
        rendu={rendu}
        enTete={enTete}
        chargement={chargement && elements.length === 0}
        onFin={
          elements.length < total ? () => setPages((p) => p + 1) : undefined
        }
        pied={
          elements.length < total ? (
            <View className="items-center px-4 py-4">
              <Text variant="caption">
                {elements.length} sur {total} - chargement de la suite...
              </Text>
            </View>
          ) : undefined
        }
        vide={{
          icon: "ShoppingBasket",
          titre: "Aucune réquisition",
          message: recherche
            ? "Aucune réquisition ne correspond à votre recherche."
            : "Créez-en une : les articles déjà sous leur seuil vous seront proposés.",
        }}
      />
      {can("requisitions.create") ? (
        <Fab icon="Plus" label="Nouvelle réquisition" onPress={() => setFeuille(true)} />
      ) : null}

      {/* Rendue CONDITIONNELLEMENT : chaque ouverture est un montage, donc un
          formulaire vierge, sans remise à zéro à tenir en phase avec les champs
          qu'on ajoutera. */}
      {feuille ? (
        <FeuilleNouvelleRequisition
          onFermer={() => setFeuille(false)}
          onCree={(id) => {
            setFeuille(false);
            router.push(`/requisition/${id}`);
          }}
        />
      ) : null}
      <FeuilleFiltresPerimetre
        ouvert={feuillePerimetre}
        onFermer={() => setFeuillePerimetre(false)}
        valeur={choixPerimetre}
        onChanger={(v) => refiltrer(() => setChoixPerimetre(v))}
        offre={perimetre}
        libelleResultats="Voir les réquisitions"
      />
    </Screen>
  );
}
