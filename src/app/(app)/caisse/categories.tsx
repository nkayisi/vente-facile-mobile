/**
 * Types d'entrée et catégories de dépense. Deux familles derrière un segment.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE BACK-OFFICE NE SAIT QUE CRÉER, ET C'EST LUI QUI EST EN RETARD.       │
 * │                                                                          │
 * │ Sa boîte « Catégorie » crée et rien d'autre ; ses quatre server actions  │
 * │ `update*Category` / `delete*Category` n'ont jamais eu le moindre         │
 * │ appelant. Une rubrique mal orthographiée y restait donc fausse pour      │
 * │ toujours, sur tous les écrans et dans tous les rapports. Cet écran la    │
 * │ corrige, et la page web est alignée dessus dans le même lot.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON DÉSACTIVE, ON NE SUPPRIME PAS.                                       │
 * │                                                                          │
 * │ Trois raisons qui se cumulent : `ExpenseCategory` est                    │
 * │ `PROTECT`-référencée (supprimer une rubrique employée lève               │
 * │ `ProtectedError`, et toute rubrique qui vaut la peine d'être gérée est   │
 * │ employée) ; `IncomeCategory` est `SET_NULL` et orphelinerait             │
 * │ l'historique EN SILENCE ; et aucune des deux tables n'émet de pierre     │
 * │ tombale au tirage, si bien qu'une suppression côté serveur n'atteindrait │
 * │ jamais ce terminal - la rubrique y resterait proposée à la saisie, pour  │
 * │ toujours. `is_active` fait ce qu'on attend sans les dégâts, et l'écran   │
 * │ le DIT.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { toutesCategoriesCaisse } from "@/data/caisse";
import { libelleEnvoi, pireEnvoi } from "@/data/envoi";
import { useLecture } from "@/data/live";
import {
  FeuilleCategorieCaisse,
  type CibleCategorie,
} from "@/features/caisse/feuille-categorie";
import { type CategorieFusionnee, type GenreCategorie } from "@/features/caisse/categorie";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, DataList, DataRow, Fab, Pastille, Screen, SearchInput,
  Segmented,
} from "@/ui";

const TABLES: Record<GenreCategorie, string[]> = {
  recette: ["income_categories", "outbox_operations"],
  depense: ["expense_categories", "outbox_operations"],
};

const SINGULIER: Record<GenreCategorie, string> = {
  recette: "type d'entrée",
  depense: "catégorie de dépense",
};

const PLURIEL: Record<GenreCategorie, string> = {
  recette: "types d'entrée",
  depense: "catégories de dépense",
};

export default function CategoriesDeCaisse() {
  const { can } = useSession();
  const [genre, setGenre] = useState<GenreCategorie>("depense");
  const [recherche, setRecherche] = useState("");
  const [cible, setCible] = useState<CibleCategorie | null>(null);

  const charger = useCallback(() => toutesCategoriesCaisse(genre), [genre]);
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES[genre],
    deps: [genre],
  });

  /**
   * Le droit, en LITTÉRAL. `session/permissions.test.ts` balaie les appels de
   * garde en TEXTE : un code lu dans une table sortirait cet écran de sa
   * surveillance sans rien dire. Les deux familles relèvent du MÊME code -
   * il n'existe ni `income_categories.*` ni `expense_categories.*`.
   */
  const peutGerer = can("cashbook.manage_categories");

  const { elements, enFile } = useMemo(() => {
    const tout = donnees ?? [];
    const etats = tout.map((c) => c.envoi).filter((e) => e !== null);
    const terme = recherche.trim().toLowerCase();
    const filtrees = terme
      ? tout.filter(
          (c) =>
            c.nom.toLowerCase().includes(terme) ||
            c.description.toLowerCase().includes(terme)
        )
      : tout;
    return { elements: filtrees, enFile: etats };
  }, [donnees, recherche]);

  const rendu = (c: CategorieFusionnee) => {
    const envoi = libelleEnvoi(c.envoi ?? undefined);
    return (
      <DataRow
        principal={c.nom}
        // `vignette` occupe la case de l'icône, donc les textes ne se décalent
        // pas d'une rangée à l'autre. La pastille est ce qui permet de
        // retrouver « Carburant » d'un coup d'oeil dans une liste de vingt.
        vignette={
          <View className="h-9 w-9 items-center justify-center">
            <Pastille couleur={c.couleur} taille={12} />
          </View>
        }
        secondaire={c.description.trim() || null}
        badge={
          envoi || !c.actif ? (
            <View className="flex-row gap-1">
              {/* L'ENVOI D'ABORD : il dit si le serveur connaît la ligne. */}
              {envoi ? (
                <Badge tone={envoi.ton === "warning" ? "warning" : "neutral"}>
                  {envoi.court}
                </Badge>
              ) : null}
              {c.actif ? null : <Badge tone="neutral">Inactive</Badge>}
            </View>
          ) : undefined
        }
        onPress={
          peutGerer ? () => setCible({ mode: "edition", genre, fiche: c }) : undefined
        }
        chevron={false}
      />
    );
  };

  const cherche = recherche.trim().length > 0;

  return (
    <Screen padded={false}>
      <AppBar title="Rubriques de caisse" subtitle="Entrées et dépenses" />
      <DataList
        donnees={elements}
        cle={(c) => c.id}
        rendu={rendu}
        chargement={chargement && elements.length === 0}
        enTete={
          <View className="gap-3 px-4 pb-3 pt-2">
            <Segmented
              options={[
                { valeur: "depense", label: "Dépenses", icon: "Receipt" },
                { valeur: "recette", label: "Entrées", icon: "ArrowDownRight" },
              ]}
              valeur={genre}
              onChange={(v) => {
                setGenre(v as GenreCategorie);
                setRecherche("");
              }}
            />
            <SearchInput
              valeur={recherche}
              onChange={setRecherche}
              placeholder={`Rechercher un ${SINGULIER[genre]}...`}
            />
            {enFile.length > 0 ? (
              <BandeauEnvoi
                envoi={pireEnvoi(enFile)}
                titre={
                  enFile.length === 1
                    ? "Une rubrique attend son envoi"
                    : `${enFile.length} rubriques attendent leur envoi`
                }
                consequence="Elles sont déjà utilisables ici, dans les dépenses comme dans les mouvements."
              />
            ) : null}
          </View>
        }
        vide={
          cherche
            ? {
                icon: "Search",
                titre: "Aucun résultat",
                message: `Aucun ${SINGULIER[genre]} ne correspond à « ${recherche.trim()} ».`,
                action: {
                  label: "Effacer la recherche",
                  onPress: () => setRecherche(""),
                },
              }
            : {
                icon: genre === "recette" ? "ArrowDownRight" : "Receipt",
                titre: `Aucun ${SINGULIER[genre]}`,
                message:
                  genre === "recette"
                    ? "Créez un type d'entrée pour classer les apports de fonds."
                    : "Créez une catégorie pour classer vos charges.",
              }
        }
      />
      <Fab
        icon="Plus"
        label="Nouvelle"
        onPress={() => setCible({ mode: "creation", genre })}
        // Grisé avec sa RAISON plutôt que caché : un bouton absent enseigne que
        // la fonction n'existe pas, et personne ne cherche un droit manquant là
        // où il n'y a rien à voir.
        raison={
          peutGerer ? undefined : `Votre compte ne peut pas gérer les ${PLURIEL[genre]}.`
        }
      />

      {/* Montée CONDITIONNELLEMENT : chaque ouverture est un montage, donc un
          formulaire vierge, sans effet de remise à zéro à tenir en phase. */}
      {cible ? (
        <FeuilleCategorieCaisse
          cible={cible}
          connues={donnees ?? []}
          onFermer={() => setCible(null)}
          onEnregistre={() => setCible(null)}
        />
      ) : null}
    </Screen>
  );
}
