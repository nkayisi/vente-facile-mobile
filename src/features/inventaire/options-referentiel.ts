/**
 * Les référentiels, prêts à être posés dans un `ChampSelect`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE CATÉGORIE CRÉÉE HORS LIGNE N'ÉTAIT PROPOSÉE NULLE PART.             │
 * │                                                                          │
 * │ Corollaire systématique de « les tables tirées ne sont écrites que par   │
 * │ le TIRAGE » : une catégorie qui vient d'être saisie vit dans le journal, │
 * │ pas dans `categories`. L'écran des référentiels le savait et fusionnait  │
 * │ déjà ; le formulaire d'article, non. Le marchand créait sa catégorie,    │
 * │ revenait créer son article, et elle n'était pas dans la liste - sur un   │
 * │ terminal dont c'est le métier de travailler sans réseau.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : aucune ouverture de base, donc éprouvable sans appareil. La
 * lecture, elle, appartient à l'appelant.
 */
import type { OptionSelect } from "@/ui";

import type { EntreeReferentiel } from "@/data/articles";
import type { GenreReferentiel } from "./referentiel";
import { fusionnerReferentiels, rangerEnArbre } from "./referentiel";
import type { ReferentielEnAttente } from "./actes";

/** Un rang d'arbre se lit à l'œil, jamais aux seuls pixels. */
const RETRAIT = "  ";

/**
 * Options d'un référentiel, journal compris.
 *
 * ⚠ Les entrées INACTIVES sont écartées, comme le back-office qui force
 * `is_active: true` sur sa recherche : sans ce filtre, désactiver une catégorie
 * n'aurait aucun effet visible et l'interrupteur promettrait ce qu'il ne tient
 * pas. Une UNITÉ ne porte pas ce drapeau et passe donc toujours.
 *
 * ⚠ `exclure` sert au CONTENANT, qui puise dans les mêmes unités que le détail :
 * proposer la même des deux côtés laisserait saisir « 1 BOITE contient
 * 12 BOITES », que le serveur accepte et que personne ne sait lire en rayon.
 */
export function optionsReferentiel(
  tirees: EntreeReferentiel[] | null,
  creations: ReferentielEnAttente[] | null,
  modifications: Map<string, ReferentielEnAttente> | null,
  genre: GenreReferentiel,
  options: { exclure?: string | null } = {}
): OptionSelect[] {
  const union = fusionnerReferentiels(
    tirees ?? [],
    creations ?? [],
    modifications ?? new Map(),
    genre
  );

  return rangerEnArbre(union, genre)
    .filter((e) => e.actif && e.id !== options.exclure)
    .map((e) => ({
      valeur: e.id,
      // Le retrait vit dans le LIBELLÉ faute de mieux : `ListeChoix` ne rend
      // pas de sous-titre, et l'arbre des catégories doit se lire quand même.
      label: RETRAIT.repeat(Math.min(e.profondeur ?? 0, 4)) + e.nom,
    }));
}

/**
 * Ce que l'écran écrit quand un référentiel est VIDE.
 *
 * Un champ qui disparaît quand sa liste est vide - ce que faisait le
 * formulaire - n'apprend rien : le marchand ne sait ni que le champ existe, ni
 * où le remplir. On rend donc le champ, et il DIT où aller.
 */
export const MESSAGE_VIDE: Record<GenreReferentiel, string> = {
  categories:
    "Aucune catégorie pour l'instant. Créez-en une depuis Articles › Référentiels.",
  marques:
    "Aucune marque pour l'instant. Créez-en une depuis Articles › Référentiels.",
  unites:
    "Aucune unité pour l'instant. Créez-en une depuis Articles › Référentiels.",
};
