/**
 * Créer OU modifier un type d'entrée / une catégorie de dépense.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SORTIR D'UN FORMULAIRE, C'EST LE PERDRE.                                │
 * │                                                                          │
 * │ Le back-office pose un « + » à côté de son champ de type, précisément    │
 * │ pour cela : le caissier qui découvre qu'il manque « Carburant » ne doit  │
 * │ pas abandonner le montant et le bénéficiaire qu'il vient de taper.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL COMPOSANT POUR LES DEUX ACTES.                                  │
 * │                                                                          │
 * │ Deux formulaires pour un même acte, ce sont deux règles à tenir en       │
 * │ phase - l'unicité du nom, la palette, le corps envoyé - et c'est ainsi   │
 * │ que les surfaces divergent. Motif de `FeuilleReferentiel`.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ NI SUPPRESSION, ET CE N'EST PAS UN RENONCEMENT. `ExpenseCategory` est
 * `PROTECT`-référencée par `Expense` (supprimer une rubrique employée lève
 * `ProtectedError`), `IncomeCategory` est `SET_NULL` (la suppression réussit et
 * orpheline l'historique en silence), et surtout AUCUNE des deux tables n'émet
 * de pierre tombale au tirage : une suppression côté serveur n'atteindrait
 * jamais un terminal, où la rubrique resterait proposée à la saisie, pour
 * toujours. L'interrupteur « Active » fait ce qu'on attend sans les dégâts.
 *
 * ⚠ La rubrique créée vit d'abord dans le JOURNAL. L'appelant la fusionne à sa
 * liste et la présélectionne : sans cela, le marchand la crée, ne la voit nulle
 * part, et la recrée.
 */
import { useState } from "react";
import { View } from "react-native";

import {
  creerCategorieCaisse,
  modifierCategorieCaisse,
} from "@/features/caisse/actes";
import {
  COULEUR_DEFAUT,
  palette,
  type CategorieFusionnee,
  type GenreCategorie,
} from "@/features/caisse/categorie";
import {
  Button, FormField, Input, Pastille, Pressable, Sheet, Switch, Text, useToast,
} from "@/ui";

/** Ce que la feuille ouvre : une création, ou une fiche à corriger. */
export type CibleCategorie =
  | { mode: "creation"; genre: GenreCategorie }
  | { mode: "edition"; genre: GenreCategorie; fiche: CategorieFusionnee };

export function FeuilleCategorieCaisse({
  cible,
  connues,
  onFermer,
  onEnregistre,
  retour,
}: {
  cible: CibleCategorie;
  /** Les rubriques du genre, pour opposer l'unicité AVANT l'envoi. */
  connues: { id: string; nom: string }[];
  onFermer: () => void;
  /**
   * Rendre la feuille comme un PANNEAU d'un formulaire plus grand.
   *
   * ⚠ C'est ce qui permet d'ouvrir la création de rubrique depuis la feuille
   * de dépense sans empiler deux `Modal` - un voile sur un voile, et deux
   * `onRequestClose` qui se disputent le bouton retour d'Android. Le geste de
   * retour recule alors d'un panneau au lieu d'effacer la saisie en cours.
   */
  retour?: () => void;
  /**
   * L'identifiant local, pour présélectionner sans attendre le serveur.
   * En modification, c'est celui de la fiche : l'appelant peut l'ignorer.
   */
  onEnregistre: (id: string, nom: string) => void;
}) {
  const toast = useToast();
  const genre = cible.genre;
  const fiche = cible.mode === "edition" ? cible.fiche : null;

  const [nom, setNom] = useState(fiche?.nom ?? "");
  const [description, setDescription] = useState(fiche?.description ?? "");
  const [couleur, setCouleur] = useState<string>(
    fiche?.couleur ?? COULEUR_DEFAUT[genre]
  );
  const [actif, setActif] = useState(fiche?.actif ?? true);
  const [envoi, setEnvoi] = useState(false);

  const propre = nom.trim();
  /**
   * ⚠ La fiche modifiée s'EXCLUT elle-même, sinon elle se refuse à chaque
   * enregistrement qui porte son propre nom - c'est-à-dire toujours. C'est le
   * miroir client de l'`exclude(pk=...)` du serializer.
   *
   * ⚠ `toLowerCase`, jamais `toLocaleLowerCase` : la seconde suit la locale de
   * l'appareil (« I » rend « ı » en turc) quand le serveur compare par
   * `__iexact`, indépendant de la locale.
   */
  const collision = connues.some(
    (c) => c.id !== fiche?.id && c.nom.toLowerCase() === propre.toLowerCase()
  );
  const bloque = envoi || propre.length === 0 || collision;

  const quoi = genre === "recette" ? "type d'entrée" : "catégorie de dépense";

  const valider = async () => {
    if (bloque) return;
    setEnvoi(true);
    try {
      const saisie = { genre, nom: propre, description, couleur, actif };
      const id = fiche
        ? await modifierCategorieCaisse(fiche.id, saisie)
        : await creerCategorieCaisse(saisie);
      onEnregistre(id, propre);
      onFermer();
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "La rubrique n'a pas pu être enregistrée."
      );
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Sheet
      ouvert
      onFermer={retour ?? onFermer}
      retour={retour}
      titre={fiche ? `Modifier ${fiche.nom}` : `Nouveau ${quoi}`}
    >
      <FormField
        label="Nom"
        required
        // Le refus est opposé ICI, pas en quarantaine : le serveur refuse un
        // nom déjà pris, et le découvrir des jours plus tard sur un autre
        // écran ne dit plus ce que le marchand voulait créer.
        error={collision ? `Un ${quoi} porte déjà ce nom.` : undefined}
      >
        <Input
          value={nom}
          onChangeText={setNom}
          placeholder={genre === "recette" ? "Apport, subvention…" : "Carburant, loyer…"}
          autoFocus
        />
      </FormField>

      <FormField label="Description">
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder="Optionnelle"
        />
      </FormField>

      {/* ┌──────────────────────────────────────────────────────────────────┐
          │ UNE PALETTE FERMÉE, LÀ OÙ LE WEB OUVRE LE SÉLECTEUR SYSTÈME.     │
          │                                                                  │
          │ `<input type="color">` n'a pas d'équivalent tactile raisonnable, │
          │ et il n'existe AUCUNE palette dans le dépôt à recopier. On       │
          │ choisit une couleur de rubrique une fois et on la relit tous les │
          │ jours : dix teintes distinctes valent mieux qu'un dégradé où     │
          │ deux rubriques finissent par se ressembler.                       │
          └──────────────────────────────────────────────────────────────────┘ */}
      <FormField label="Couleur" hint="Elle distingue la rubrique dans les listes et les rapports.">
        <View className="flex-row flex-wrap gap-3">
          {palette(genre).map((teinte) => (
            <Pressable
              key={teinte}
              onPress={() => setCouleur(teinte)}
              haptic="selection"
              accessibilityRole="radio"
              accessibilityState={{ selected: couleur === teinte }}
              accessibilityLabel={`Couleur ${teinte}`}
              // 44 points de cible tactile autour d'une pastille de 28 :
              // §5.3 règle 5, et un anneau qui dit lequel est choisi.
              className={`h-11 w-11 items-center justify-center rounded-full border-2 ${
                couleur === teinte ? "border-primary" : "border-transparent"
              }`}
            >
              <Pastille couleur={teinte} taille={28} />
            </Pressable>
          ))}
        </View>
      </FormField>

      {/* L'interrupteur n'apparaît QU'EN MODIFICATION : une rubrique qu'on
          vient de créer n'a pas à naître désactivée, et l'offrir ferait
          hésiter sur un choix qui n'en est pas un. */}
      {fiche ? (
        <Switch
          valeur={actif}
          onChange={setActif}
          label="Active"
          aide={
            actif
              ? "Elle est proposée à la saisie d'une dépense et d'un mouvement."
              : "Elle disparaît des formulaires. L'historique la garde, et les rapports aussi."
          }
        />
      ) : null}

      <Button fullWidth size="lg" disabled={bloque} loading={envoi} onPress={() => void valider()}>
        {fiche ? "Enregistrer" : "Créer"}
      </Button>
      <Text variant="caption">
        {fiche
          ? "La correction s'applique tout de suite ici et partira à la prochaine synchronisation."
          : "Elle est utilisable tout de suite et partira à la prochaine synchronisation."}
      </Text>
    </Sheet>
  );
}
