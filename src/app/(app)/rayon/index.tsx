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
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { formatPrice } from "@vente-facile/core";

import { jourISO } from "@/data/dates";
import { useLecture } from "@/data/live";
import { usePerimetre } from "@/features/perimetre/use-perimetre";
import { useEnLigne } from "@/data/reseau";
import {
  ETAT_STOCK,
  niveauxDeStock,
  type FiltreEtatStock,
  type LigneNiveau,
} from "@/data/stock-niveaux";
import { ApiError } from "@/api/errors";
import { FeuilleFormat } from "@/features/export/feuille-format";
import {
  telechargerDocument,
  type FormatExport,
} from "@/features/export/telecharger";
import { statutServeur } from "@/features/stock/statut-stock";
import { useSession } from "@/session/provider";
import {
  AppBar,
  Badge,
  Chip,
  ChipRow,
  DataList,
  DataRow,
  IconButton,
  Mesure,
  Screen,
  SearchInput,
  Text,
  useListeFiche,
  useToast,
} from "@/ui";
import { FicheRayon } from "@/features/stock/fiche-rayon";

const TABLES = ["stocks", "products", "warehouses", "categories", "units"];

/** Filtre d'arrivée admis dans l'URL. Ce qui n'est pas connu ne filtre rien. */
function etatDemande(v: string | string[] | undefined): FiltreEtatStock {
  const cle = Array.isArray(v) ? v[0] : v;
  return cle === "bas" || cle === "rupture" || cle === "ok" || cle === "alerte" ? cle : "tous";
}

export default function Niveaux() {
  // Sur un grand écran, la fiche s'ouvre à droite et la liste reste là.
  // Voir `ui/liste-fiche.tsx`.
  const listeFiche = useListeFiche({
    chemin: (id) => `/rayon/${id}`,
    Fiche: FicheRayon,
    vide: {
      icon: "Boxes",
      titre: "Choisissez un rayon",
      message: "Sa fiche s'ouvre ici, la liste reste à côté.",
    },
  });
  // Le relevé « Stock bas » du tableau de bord ouvre cette page DÉJÀ filtrée.
  // Un chiffre d'alerte qui débarque sur la liste entière oblige le magasinier
  // à refaire le tri à la main, et il ne retrouve pas forcément les mêmes
  // produits : c'est la règle « chaque alerte mène quelque part ».
  const params = useLocalSearchParams<{ etat?: string }>();
  const { can } = useSession();
  const toast = useToast();
  const enLigne = useEnLigne();
  const [recherche, setRecherche] = useState("");
  const [entrepot, setEntrepot] = useState<string | null>(null);
  const [etat, setEtat] = useState<FiltreEtatStock>(() => etatDemande(params.etat));
  const [feuilleFormat, setFeuilleFormat] = useState(false);
  const [envoiExport, setEnvoiExport] = useState(false);

  // ⚠ LES OPTIONS VIENNENT DU RÔLE, PLUS DE LA TABLE. `entrepots()` rend tous
  // les dépôts descendus sur ce terminal ; un magasinier n'a le droit de viser
  // que les siens, et le tirage ne borne pas `warehouses`.
  const choixPerimetre = useMemo(
    () => ({ entrepot, utilisateur: null }),
    [entrepot]
  );
  const perimetre = usePerimetre(choixPerimetre, false);
  const depots = perimetre.entrepots;
  const applique = perimetre.applique;

  const charger = useCallback(
    () =>
      niveauxDeStock({
        recherche,
        entrepot: applique.entrepot, entrepots: applique.entrepots,
        etat,
        limite: 300,
      }),
    [recherche, applique, etat]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, applique, etat],
  });

  const lignes = donnees?.elements ?? [];

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder="Rechercher un produit..."
      />
      {depots.length > 1 ? (
        <ChipRow>
          <Chip
            label="Tous les entrepôts"
            actif={entrepot === null}
            onPress={() => setEntrepot(null)}
          />
          {depots.map((d) => (
            <Chip
              key={d.valeur}
              label={d.label}
              actif={entrepot === d.valeur}
              onPress={() => setEntrepot(d.valeur)}
            />
          ))}
        </ChipRow>
      ) : null}
      <ChipRow>
        <Chip label="Tout" actif={etat === "tous"} onPress={() => setEtat("tous")} />
        {/* Le filtre d'ALERTE n'a de puce que tant qu'il est actif : on y
            arrive depuis la tuile du tableau de bord, et un filtre posé doit
            se voir - et se retirer. */}
        {etat === "alerte" ? (
          <Chip label="À réapprovisionner" actif onPress={() => setEtat("tous")} onRetirer={() => setEtat("tous")} />
        ) : null}
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
        valeur={<Mesure value={l.disponibleAffiche} />}
        // Le total brut n'apparaît QUE s'il diffère de la lecture affichée :
        // « 12 au total » sous « 12 pièces » est du bruit.
        sousValeur={l.facteur ? `${l.total} au total` : null}
        onPress={() => listeFiche.ouvrir(l.id)}
        selectionne={listeFiche.selection === l.id}
      />
    );
  };

  // Le serveur garde cette lecture derrière `stock.view`, et NON
  // `stock_movements.view` : fermer le bouton sur le mauvais droit ferait
  // répondre 403 après le choix du format, ce qu'on lirait comme une panne.
  const peutVoir = can("stock.view");
  const raisonExport = !enLigne
    ? "L'export est fabriqué par le serveur : il demande une connexion."
    : envoiExport
      ? "Export en cours…"
      : lignes.length === 0
        ? "Aucun rayon à exporter."
        : undefined;

  /**
   * La situation de stock, fabriquée par le SERVEUR comme tous les documents.
   *
   * ⚠ `statutServeur` ET NON une correspondance écrite ici : `low` du serveur
   * contient les ruptures et `available` les stocks bas, quand les trois états
   * de cet écran s'excluent. Une traduction naïve rendrait un document plus
   * large que la liste qui l'a déclenché, sans que rien ne le signale.
   */
  const exporter = async (format: FormatExport) => {
    setFeuilleFormat(false);
    setEnvoiExport(true);
    try {
      await telechargerDocument(
        "/stocks/export/",
        {
          search: recherche || undefined,
          // Le document couvre EXACTEMENT ce que la liste montre : donc le
          // périmètre appliqué, comme la lecture.
          warehouse: applique.entrepot ?? undefined,
          status: statutServeur(etat),
          // Le défaut du back-office : les sous-totaux par catégorie sont ce
          // qu'on vient chercher dans une situation de stock.
          group_by: "category",
        },
        format,
        `Niveaux de stock ${jourISO(new Date())}`
      );
    } catch (erreur) {
      toast.erreur(
        erreur instanceof ApiError
          ? erreur.message
          : "L'export n'a pas pu être produit."
      );
    } finally {
      setEnvoiExport(false);
    }
  };

  return listeFiche.rendre(
    <Screen padded={false}>
      <AppBar
        title="Niveaux de stock"
        subtitle={
          etat === "bas"
            ? "Produits en stock bas"
            : etat === "alerte"
              ? "Produits à réapprovisionner, ruptures comprises"
              : "Vue d'ensemble de tout le stock"
        }
        right={
          peutVoir ? (
            <IconButton
              name="Download"
              label="Exporter les niveaux de stock"
              variant="ghost"
              onPress={() => setFeuilleFormat(true)}
              disabled={Boolean(raisonExport)}
            />
          ) : undefined
        }
      />
      <DataList
        selection={listeFiche.selection}
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

      <FeuilleFormat
        ouvert={feuilleFormat}
        onFermer={() => setFeuilleFormat(false)}
        onChoisir={(f) => void exporter(f)}
        titre="Exporter les niveaux de stock"
        envoi={envoiExport}
      />
    </Screen>
  );
}
