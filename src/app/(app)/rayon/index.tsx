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
import { router, useLocalSearchParams } from "expo-router";
import { formatPrice } from "@vente-facile/core";

import { jourISO } from "@/data/dates";
import { useLecture } from "@/data/live";
import { useEnLigne } from "@/data/reseau";
import {
  ETAT_STOCK,
  niveauxDeStock,
  type EtatStock,
  type LigneNiveau,
} from "@/data/stock-niveaux";
import { entrepots } from "@/data/stock";
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
  Screen,
  SearchInput,
  Mesure,
  Text,
  useToast,
} from "@/ui";

const TABLES = ["stocks", "products", "warehouses", "categories", "units"];

/** Filtre d'arrivée admis dans l'URL. Ce qui n'est pas connu ne filtre rien. */
function etatDemande(v: string | string[] | undefined): EtatStock {
  const cle = Array.isArray(v) ? v[0] : v;
  return cle === "bas" || cle === "rupture" || cle === "ok" ? cle : "tous";
}

export default function Niveaux() {
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
  const [etat, setEtat] = useState<EtatStock>(() => etatDemande(params.etat));
  const [feuilleFormat, setFeuilleFormat] = useState(false);
  const [envoiExport, setEnvoiExport] = useState(false);

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
        valeur={<Mesure value={l.disponibleAffiche} />}
        // Le total brut n'apparaît QUE s'il diffère de la lecture affichée :
        // « 12 au total » sous « 12 pièces » est du bruit.
        sousValeur={l.facteur ? `${l.total} au total` : null}
        onPress={() => router.push(`/rayon/${l.id}`)}
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
          warehouse: entrepot ?? undefined,
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

  return (
    <Screen padded={false}>
      <AppBar
        title="Niveaux de stock"
        subtitle={
          etat === "bas"
            ? "Produits en stock bas"
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
