/**
 * Catégories, marques et unités : ce qui part au serveur, et ce qui le retient
 * avant qu'il ne parte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN REFUS DE RÉFÉRENTIEL EST DÉTERMINISTE, DONC UNE QUARANTAINE.          │
 * │                                                                          │
 * │ Le serveur refuse un nom déjà pris, insensible à la casse, par           │
 * │ organisation. Sur le web l'erreur s'écrit sous le champ dans la seconde ;│
 * │ ici la saisie a eu lieu hors ligne, et le marchand ne verrait le refus   │
 * │ que bien plus tard, dans « Opérations à corriger », sans plus savoir ce  │
 * │ qu'il voulait créer. On oppose donc la même règle AU COMPTOIR.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR, comme `slug.ts` et `nouvelle-session.ts` : il décide de ce qui
 * part au serveur, il doit s'éprouver sans appareil.
 */
import type { EntreeReferentiel } from "@/data/articles";
import { ordreArbre, sousArbre } from "@/data/categories-arbre";

import { slugifier } from "./slug";

export type GenreReferentiel = "categories" | "marques" | "unites";

/** L'état du formulaire au moment de valider. */
export interface SaisieReferentiel {
  genre: GenreReferentiel;
  nom: string;
  /** Unités seulement : ce qui s'imprime sur un ticket. */
  symbole: string;
  /** Catégories seulement. `null` : catégorie racine. */
  parent: string | null;
  actif: boolean;
}

export interface ErreursReferentiel {
  nom?: string;
  symbole?: string;
  parent?: string;
}

/** Une fiche déjà connue : tirée du serveur OU encore dans le journal. */
export interface EntreeConnue {
  id: string;
  nom: string;
  /** Catégories et marques. Absent pour une unité. */
  slug?: string | null;
  /** Unités seulement. */
  symbole?: string | null;
  /** Catégories seulement, pour l'anti-cycle. */
  parentId?: string | null;
}

/**
 * Les bornes du serveur, par genre.
 *
 * ⚠ CINQUANTE pour une unité, pas 255 : `Unit.name` est un
 * `CharField(max_length=50)` et `Unit.symbol` un `CharField(max_length=10)`,
 * quand `Category.name` et `Brand.name` montent à 255. Un nom de soixante
 * signes passe sur une catégorie et part en quarantaine sur une unité.
 */
export const BORNES: Record<
  GenreReferentiel,
  { nom: number; symbole?: number }
> = {
  categories: { nom: 255 },
  marques: { nom: 255 },
  unites: { nom: 50, symbole: 10 },
};

const SINGULIER: Record<GenreReferentiel, string> = {
  categories: "catégorie",
  marques: "marque",
  unites: "unité",
};

/**
 * ⚠ `.toLowerCase()`, JAMAIS `.toLocaleLowerCase()`.
 *
 * La seconde suit la locale de l'hôte : `"I".toLocaleLowerCase()` rend `"ı"` en
 * turc. Le serveur compare par `__iexact`, c'est-à-dire `UPPER()` en Postgres,
 * indépendant de la locale. Le garde-fou `Intl` ne verrait pas
 * `toLocaleLowerCase` : la règle est sémantique, pas mécanique.
 */
function pliee(valeur: string): string {
  return valeur.trim().toLowerCase();
}

/**
 * Ce qui empêche d'enregistrer, champ par champ.
 *
 * Rend `{}` quand tout va, ne lève jamais. Les clés sont les noms des champs du
 * formulaire, et chaque valeur est une phrase entière : c'est ce qui s'écrit
 * sous le champ fautif.
 *
 * `edite` porte l'identifiant de la fiche en cours de modification, `null` à la
 * création. Sans lui, une fiche se refuserait ELLE-MÊME sur son propre nom.
 */
export function verifierReferentiel(
  s: SaisieReferentiel,
  connues: EntreeConnue[],
  edite: string | null = null
): ErreursReferentiel {
  const erreurs: ErreursReferentiel = {};
  const nom = s.nom.trim();
  const borne = BORNES[s.genre];
  const autres = connues.filter((c) => c.id !== edite);

  if (nom.length === 0) {
    erreurs.nom = "Le nom est requis.";
  } else if (nom.length > borne.nom) {
    erreurs.nom = `Le nom ne peut pas dépasser ${borne.nom} caractères.`;
  } else if (s.genre !== "unites" && slugifier(nom) === "") {
    // Traduction honnête de `slugifier("!!!") === ""` : le serveur refuserait
    // sur le `slug`, un champ que l'écran français ne montre nulle part.
    erreurs.nom = "Donnez un nom qui contient au moins une lettre ou un chiffre.";
  } else if (autres.some((c) => pliee(c.nom) === pliee(nom))) {
    erreurs.nom = `Une ${SINGULIER[s.genre]} porte déjà ce nom.`;
  }

  if (s.genre === "unites") {
    const symbole = s.symbole.trim();
    if (symbole.length === 0) {
      // ⚠ Le repli « à défaut, le nom » est RETIRÉ, et c'était un piège : tout
      // nom d'unité de plus de dix signes fabriquait un symbole hors borne, et
      // partait en quarantaine. Le formulaire web exige le symbole.
      erreurs.symbole = "Le symbole est requis.";
    } else if (symbole.length > (borne.symbole ?? 10)) {
      erreurs.symbole =
        `Le symbole ne peut pas dépasser ${borne.symbole} caractères : ` +
        "c'est ce qui s'imprime sur un ticket.";
    } else if (autres.some((c) => pliee(c.symbole ?? "") === pliee(symbole))) {
      erreurs.symbole = "Une unité porte déjà ce symbole.";
    }
  }

  if (s.genre === "categories" && s.parent && edite) {
    if (s.parent === edite) {
      erreurs.parent = "Une catégorie ne peut pas être son propre parent.";
    } else {
      // Le sous-arbre est dérivé ICI plutôt que reçu en paramètre : le passer
      // serait une chose de plus à ne pas oublier au point d'appel. Le
      // sélecteur exclut déjà la descendance ; ceci est le filet contre une
      // liste vieille de cent cinquante millisecondes.
      const descendance = sousArbre(
        connues.map((c) => ({ id: c.id, parentId: c.parentId ?? null })),
        edite
      );
      if (descendance?.includes(s.parent)) {
        erreurs.parent =
          "Ce choix placerait la catégorie sous l'une de ses propres sous-catégories.";
      }
    }
  }

  return erreurs;
}

/**
 * Un `slug` libre, dérivé du nom.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX NOMS DIFFÉRENTS PEUVENT DONNER LE MÊME `slug`.                     │
 * │                                                                          │
 * │ `slugifier("Café")` et `slugifier("Cafe")` rendent tous deux `"cafe"`.   │
 * │ Le contrôle de NOM passe, puisque les deux noms diffèrent ; c'est le     │
 * │ contrôle de SLUG du serveur qui refuse ensuite, en citant un champ qui   │
 * │ n'apparaît nulle part dans l'interface française.                        │
 * │                                                                          │
 * │ On DÉSAMBIGUÏSE plutôt que de refuser : le `slug` n'est ni affiché, ni   │
 * │ saisi, ni imprimé, ni cherché sur cette surface, et le contrôle de nom   │
 * │ garantit déjà que deux fiches restent distinguables par un humain.       │
 * │ Refuser « Cafe » parce que « Café » existe imposerait au marchand une    │
 * │ règle qu'il ne peut pas comprendre, à propos d'un champ qu'il n'a jamais │
 * │ vu, sur un écran où les deux noms sont visiblement différents.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ `prises` doit porter les `slug` TIRÉS **et** ceux déjà en file : sans quoi
 * deux créations hors ligne d'affilée calculent le même, et la seconde est
 * refusée.
 *
 * La troncature à cinquante signes porte sur la BASE, jamais sur le suffixe :
 * l'amputer rendrait `cafe-1` et `cafe-12` indistinguables.
 */
export function slugDisponible(nom: string, prises: Iterable<string>): string {
  const base = slugifier(nom);
  if (base === "") return "";

  const occupes = new Set<string>();
  for (const p of prises) if (p) occupes.add(p.toLowerCase());
  if (!occupes.has(base)) return base;

  for (let n = 2; n < 1000; n += 1) {
    const suffixe = `-${n}`;
    const candidat = base.slice(0, 50 - suffixe.length) + suffixe;
    if (!occupes.has(candidat)) return candidat;
  }
  return base;
}

/** Le corps d'une CRÉATION, sans son identifiant. */
export function corpsCreationReferentiel(
  s: SaisieReferentiel,
  slug: string
): Record<string, unknown> {
  if (s.genre === "unites") {
    // ⚠ NI `slug` NI `is_active` : `Unit` ne porte aucun des deux, et DRF jette
    // en silence une clé absente de `fields`. Les envoyer donnait l'illusion
    // qu'un drapeau voyageait.
    return { name: s.nom.trim(), symbol: s.symbole.trim() };
  }
  return {
    name: s.nom.trim(),
    slug,
    // `parent` OMIS quand il est nul : le défaut du modèle est déjà `null`, et
    // la maison n'écrit jamais `null` sur une clé absente.
    ...(s.genre === "categories" && s.parent ? { parent: s.parent } : {}),
    is_active: s.actif,
  };
}

/** Le corps d'une MODIFICATION, sans son identifiant. */
export function corpsModificationReferentiel(
  s: SaisieReferentiel
): Record<string, unknown> {
  if (s.genre === "unites") {
    return { name: s.nom.trim(), symbol: s.symbole.trim() };
  }
  return {
    name: s.nom.trim(),
    // Pas de `slug` : le back-office n'en renvoie pas non plus sur une
    // modification (`updateCategory`, `updateBrand` ne le dérivent qu'à la
    // création). Un `slug` recalculé pourrait heurter celui d'une autre fiche,
    // pour un motif qu'aucun écran français n'affiche.
    //
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ `parent` EST LA SEULE CLÉ QUI PART À `null`, ET C'EST VOULU.        │
    // │                                                                      │
    // │ Le serveur applique `partial=True` : une clé ABSENTE veut dire « ne  │
    // │ touche pas ». Omettre `parent` rendrait donc impossible de détacher  │
    // │ une sous-catégorie pour en faire une racine, le geste inverse de     │
    // │ celui que ce lot existe pour ouvrir. `null` est le seul mot qui dit  │
    // │ « plus de parent ». C'est pourquoi les deux corps diffèrent sur      │
    // │ exactement cette clé.                                                │
    // └──────────────────────────────────────────────────────────────────────┘
    ...(s.genre === "categories" ? { parent: s.parent } : {}),
    is_active: s.actif,
  };
}

/** Une fiche du journal, telle que `actes.ts` la rend. */
export interface FicheEnAttente {
  fiche: string;
  genre: GenreReferentiel;
  nom: string;
  slug: string | null;
  symbole: string | null;
  parentId: string | null;
  actif: boolean;
}

/**
 * Les lignes tirées et le journal, en une seule liste.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES MODIFICATIONS SE POSENT SUR TOUT, CRÉATIONS EN FILE COMPRISES.      │
 * │                                                                          │
 * │ Les appliquer aux seules lignes TIRÉES laisserait le marchand qui crée   │
 * │ « Boisons » hors ligne, voit la faute et corrige, devant une liste qui   │
 * │ écrit toujours « Boisons » : il renommerait une seconde fois, et la      │
 * │ seconde correction partirait sur une fiche déjà corrigée.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'ordre compte aussi pour l'UNICITÉ : le résultat sert de référence à
 * `verifierReferentiel`, et bâtir celle-ci sur les noms d'AVANT ferait accepter
 * un doublon que le serveur refusera.
 */
export function fusionnerReferentiels(
  tirees: EntreeReferentiel[],
  creations: FicheEnAttente[],
  modifications: Map<string, FicheEnAttente>,
  genre: GenreReferentiel
): EntreeReferentiel[] {
  const nouvelles: EntreeReferentiel[] = creations
    .filter((c) => c.genre === genre)
    .map((c) => ({
      id: c.fiche,
      genre,
      nom: c.nom,
      detail: null,
      actif: c.actif,
      // Zéro est un FAIT pour une fiche qui n'existe sur aucun serveur.
      produits: 0,
      slug: c.slug,
      symbole: c.symbole,
      parentId: c.parentId,
      profondeur: 0,
    }));

  return [...tirees, ...nouvelles].map((e) => {
    const m = modifications.get(e.id);
    if (!m || m.genre !== genre) return e;
    return {
      ...e,
      nom: m.nom || e.nom,
      symbole: m.symbole ?? e.symbole,
      parentId: m.parentId,
      actif: m.actif,
    };
  });
}

/**
 * Les catégories rangées en arbre, chaque ligne nommant SON PARENT.
 *
 * « Sodas » doit se lire sous « Boissons » : la relation reste ÉCRITE en ligne
 * secondaire, jamais dite par la seule indentation. Les autres genres n'ont pas
 * de hiérarchie et ressortent tels quels.
 */
export function rangerEnArbre(
  entrees: EntreeReferentiel[],
  genre: GenreReferentiel
): EntreeReferentiel[] {
  if (genre !== "categories") return entrees;
  const noms = new Map(entrees.map((e) => [e.id, e.nom]));
  return ordreArbre(entrees).map((r) => ({
    ...r.item,
    profondeur: r.profondeur,
    detail: r.item.parentId ? (noms.get(r.item.parentId) ?? null) : null,
  }));
}

/**
 * Les catégories qu'on peut prendre pour parent, prêtes pour `ListeChoix`.
 *
 * Trois retraits, chacun pour sa raison :
 * - la fiche elle-même et sa DESCENDANCE (miroir local d'`exclude_descendants_of`,
 *   que le back-office passe en query) : s'y placer ferait un cycle ;
 * - les catégories INACTIVES, comme le web qui force `is_active: true` sur sa
 *   recherche ;
 * - ⚠ SAUF le parent ACTUEL, même inactif : sans lui le déclencheur afficherait
 *   « Aucune » pour une catégorie qui en a un, et enregistrer la DÉTACHERAIT en
 *   silence.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CHERCHER APLATIT LA LISTE, ET NOMME LE PARENT À LA PLACE.               │
 * │                                                                          │
 * │ Filtrer un arbre CASSE l'arbre : un enfant qui correspond quand son      │
 * │ parent ne correspond pas s'afficherait indenté sous rien, ce qui         │
 * │ affirmerait une hiérarchie fausse. Dès qu'un terme est saisi on retire   │
 * │ le retrait et on écrit « Sodas (dans Boissons) » : la relation reste     │
 * │ DITE, elle n'est simplement plus dessinée.                               │
 * │                                                                          │
 * │ Le parent est nommé DANS le libellé parce que `ListeChoix` ne rend pas   │
 * │ le `detail` d'une `OptionSelect` : il n'en garde que `valeur` et         │
 * │ `label`. Seul `ListeChoixMultiple` affiche un sous-titre.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function optionsDeParent(
  connues: EntreeReferentiel[],
  edite: string | null,
  parentActuel: string | null,
  recherche: string
): { valeur: string; label: string }[] {
  const interdits = new Set(
    edite
      ? (sousArbre(
          connues.map((c) => ({ id: c.id, parentId: c.parentId ?? null })),
          edite
        ) ?? [])
      : []
  );
  const eligibles = connues.filter(
    (c) => !interdits.has(c.id) && (c.actif || c.id === parentActuel)
  );

  const terme = recherche.trim().toLowerCase();
  if (!terme) {
    return eligibles.map((c) => ({
      valeur: c.id,
      label: `${"    ".repeat(Math.min(c.profondeur, 4))}${c.nom}`,
    }));
  }

  const noms = new Map(connues.map((c) => [c.id, c.nom]));
  return eligibles
    .filter((c) => c.nom.toLowerCase().includes(terme))
    .map((c) => {
      const parent = c.parentId ? noms.get(c.parentId) : null;
      return {
        valeur: c.id,
        label: parent ? `${c.nom} (dans ${parent})` : c.nom,
      };
    });
}
