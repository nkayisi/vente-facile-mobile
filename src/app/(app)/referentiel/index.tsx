/**
 * Catégories, marques et unités. Miroir des trois pages du back-office,
 * réunies derrière un segment.
 *
 * **Trois listes de même nature derrière un segment plutôt qu'une navigation
 * imbriquée** : on passe de l'une à l'autre d'un geste au lieu de deux allers,
 * exactement le choix déjà fait pour Clients & Fournisseurs.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA LISTE FUSIONNE LE JOURNAL, ET C'EST CE QUI REND LES SOUS-CATÉGORIES  │
 * │ POSSIBLES HORS LIGNE.                                                    │
 * │                                                                          │
 * │ Les tables tirées ne sont écrites que par le tirage : une catégorie      │
 * │ créée au comptoir vit dans le journal. Sans la fusion, elle n'apparaît   │
 * │ ni dans cette liste NI dans le sélecteur de parent, si bien qu'on ne     │
 * │ peut pas lui donner d'enfant tant que le réseau n'est pas revenu - sur   │
 * │ un terminal qui existe pour travailler hors ligne.                       │
 * │                                                                          │
 * │ Les MODIFICATIONS en file se superposent aussi : sans elles, le marchand │
 * │ renomme « Boisons » en « Boissons », la liste continue d'écrire          │
 * │ « Boisons », et il renomme une seconde fois.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Une UNITÉ n'a pas de `slug`, elle a un symbole** ; une catégorie et une
 * marque en exigent un, que le serveur ne dérive pas. Il est fabriqué depuis le
 * nom (`slugDisponible`), comme le formulaire web le fait.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { referentiel, type EntreeReferentiel } from "@/data/articles";
import { libelleEnvoi, pireEnvoi } from "@/data/envoi";
import type { EtatEnvoi } from "@/sync";
import { useLecture } from "@/data/live";
import {
  creationsReferentielEnAttente,
  modificationsReferentielEnAttente,
} from "@/features/inventaire/actes";
import {
  FeuilleReferentiel,
  type CibleReferentiel,
} from "@/features/inventaire/feuille-referentiel";
import {
  fusionnerReferentiels,
  rangerEnArbre,
  type GenreReferentiel,
} from "@/features/inventaire/referentiel";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, DataList, DataRow, Fab, Screen, SearchInput, Segmented, Text,
} from "@/ui";

const TABLES: Record<GenreReferentiel, string[]> = {
  categories: ["categories", "products"],
  marques: ["brands", "products"],
  unites: ["units", "products"],
};

const SINGULIER: Record<GenreReferentiel, string> = {
  categories: "catégorie",
  marques: "marque",
  unites: "unité",
};

const PLURIEL: Record<GenreReferentiel, string> = {
  categories: "catégories",
  marques: "marques",
  unites: "unités",
};

const ICONE: Record<GenreReferentiel, "FolderTree" | "Tag" | "Ruler"> = {
  categories: "FolderTree",
  marques: "Tag",
  unites: "Ruler",
};

export default function Referentiels() {
  const { can } = useSession();
  const [genre, setGenre] = useState<GenreReferentiel>("categories");
  const [recherche, setRecherche] = useState("");
  const [cible, setCible] = useState<CibleReferentiel | null>(null);

  const charger = useCallback(() => referentiel(genre), [genre]);
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES[genre],
    deps: [genre],
  });
  const { donnees: creations } = useLecture(creationsReferentielEnAttente, {
    tables: ["outbox_operations"],
  });
  const { donnees: retouches } = useLecture(modificationsReferentielEnAttente, {
    tables: ["outbox_operations"],
  });

  /**
   * Les droits, en LITTÉRAUX.
   *
   * `session/permissions.test.ts` balaie les appels de garde en TEXTE, et ne
   * reconnaît qu'un code écrit en toutes lettres : un code lu dans une table
   * indexée par le genre sortirait cet écran de sa surveillance sans rien dire.
   * Une catégorie exige `categories.*` ; marques et unités relèvent bien de
   * `products.*`, il n'existe aucun code `brands.*` ni `units.*`.
   */
  const peutCreer =
    genre === "categories" ? can("categories.create") : can("products.create");
  const peutModifier =
    genre === "categories" ? can("categories.edit") : can("products.edit");

  const { elements, connues, etats } = useMemo(() => {
    const misesAJour = retouches ?? new Map();

    // La fusion et le rangement en arbre vivent dans le module PUR : une règle
    // écrite dans un écran est ce que ce module existe pour empêcher, et
    // celle-ci a déjà caché un défaut (une modification qui ne se posait pas
    // sur une création encore en file).
    const union = fusionnerReferentiels(
      donnees ?? [],
      creations ?? [],
      misesAJour,
      genre
    );
    const ordonnees = rangerEnArbre(union, genre);

    const etats = new Map<string, EtatEnvoi>();
    for (const c of creations ?? []) if (c.genre === genre) etats.set(c.fiche, c.envoi);
    for (const [fiche, m] of misesAJour) {
      if (m.genre !== genre) continue;
      const deja = etats.get(fiche);
      etats.set(fiche, deja ? pireEnvoi([deja, m.envoi]) : m.envoi);
    }

    // ⚠ FILTRER UN ARBRE CASSE L'ARBRE : un enfant qui correspond quand son
    // parent ne correspond pas s'afficherait indenté sous rien. Dès qu'un terme
    // est saisi, la liste passe À PLAT, chaque ligne continuant de nommer son
    // parent en ligne secondaire - la présentation du back-office.
    const terme = recherche.trim().toLowerCase();
    const filtrees = terme
      ? ordonnees
          .filter((e) => e.nom.toLowerCase().includes(terme))
          .map((e) => ({ ...e, profondeur: 0 }))
      : ordonnees;

    return { elements: filtrees, connues: union, etats };
  }, [donnees, creations, retouches, genre, recherche]);

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <Segmented
        options={[
          { valeur: "categories", label: "Catégories", icon: "FolderTree" },
          { valeur: "marques", label: "Marques", icon: "Tag" },
          { valeur: "unites", label: "Unités", icon: "Ruler" },
        ]}
        valeur={genre}
        onChange={(v) => {
          setGenre(v as GenreReferentiel);
          setRecherche("");
        }}
      />
      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder={`Rechercher une ${SINGULIER[genre]}...`}
      />
      {etats.size > 0 ? (
        <BandeauEnvoi
          envoi={pireEnvoi([...etats.values()])}
          titre={
            etats.size === 1
              ? "Une entrée attend son envoi"
              : `${etats.size} entrées attendent leur envoi`
          }
          consequence="Elles sont déjà utilisables ici, y compris comme parent."
        />
      ) : null}
    </View>
  );

  const rendu = (e: EntreeReferentiel) => {
    const envoi = libelleEnvoi(etats.get(e.id));
    return (
      // Le retrait appartient à la MISE EN PAGE, pas à `DataRow` : un préfixe
      // d'espaces dans le libellé serait invisible au lecteur d'écran et mangé
      // par `numberOfLines`. Plafond à quatre niveaux, au delà desquels le nom
      // n'a plus de place sur 360 points ; et la relation reste ÉCRITE en ligne
      // secondaire, jamais dite par les seuls pixels.
      <View style={{ paddingLeft: Math.min(e.profondeur, 4) * 16 }}>
        <DataRow
          principal={e.nom}
          secondaire={e.detail}
          badge={
            envoi || !e.actif ? (
              <View className="flex-row gap-1">
                {/* L'envoi D'ABORD : il dit si la ligne existe. */}
                {envoi ? (
                  <Badge tone={envoi.ton === "warning" ? "warning" : "neutral"}>
                    {envoi.court}
                  </Badge>
                ) : null}
                {e.actif ? null : <Badge tone="neutral">Inactive</Badge>}
              </View>
            ) : undefined
          }
          valeur={
            <Text variant="bodySmall" numeric className="font-sans-medium">
              {/* Le nombre de produits est la seule mesure utile ici : il dit si
                  l'entrée sert, et si la supprimer casserait quelque chose. */}
              {String(e.produits)}
            </Text>
          }
          sousValeur={e.produits > 1 ? "produits" : "produit"}
          onPress={peutModifier ? () => setCible({ mode: "edition", genre, fiche: e }) : undefined}
          chevron={false}
        />
      </View>
    );
  };

  const cherche = recherche.trim().length > 0;

  return (
    <Screen padded={false}>
      <AppBar title="Catégories, marques et unités" />
      <DataList
        donnees={elements}
        cle={(e) => e.id}
        rendu={rendu}
        enTete={enTete}
        chargement={chargement && elements.length === 0}
        vide={
          // Un état vide sous une recherche NE DIT PAS que la liste est vide :
          // les confondre fait lire une perte de données et n'offre aucun
          // chemin de retour.
          cherche
            ? {
                icon: "Search",
                titre: "Aucun résultat",
                message: `Aucune ${SINGULIER[genre]} ne correspond à « ${recherche.trim()} ».`,
                action: { label: "Effacer la recherche", onPress: () => setRecherche("") },
              }
            : {
                icon: ICONE[genre],
                titre: `Aucune ${SINGULIER[genre]}`,
                message: `Créez votre première ${SINGULIER[genre]} pour organiser le catalogue.`,
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
          peutCreer
            ? undefined
            : `Votre compte ne peut pas créer de ${PLURIEL[genre]}.`
        }
      />

      {cible ? (
        <FeuilleReferentiel
          cible={cible}
          connues={connues}
          enFile={new Set(etats.keys())}
          onFermer={() => setCible(null)}
          onEnregistre={() => setCible(null)}
        />
      ) : null}
    </Screen>
  );
}
