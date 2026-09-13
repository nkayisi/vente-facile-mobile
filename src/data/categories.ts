/**
 * Les catégories, pour filtrer. Le SOUS-ARBRE vit dans `categories-arbre.ts`.
 *
 * La séparation n'est pas décorative : ce fichier ouvre la base SQLite au
 * chargement, le module d'arbre non - et c'est la règle du sous-arbre qu'il
 * fallait pouvoir éprouver sans appareil.
 */
import { asc, eq, or, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { categories } from "@/db/schema";

import { ordreArbre, sousArbre, type NoeudCategorie } from "./categories-arbre";

export interface CategorieChoix {
  id: string;
  nom: string;
  parentId: string | null;
  /** Profondeur dans l'arbre : elle indente le libellé de la liste de choix. */
  profondeur: number;
}

async function toutesLesCategories(): Promise<NoeudCategorie[]> {
  return db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)
    .where(or(eq(categories.isDeleted, false), isNull(categories.isDeleted)));
}

/**
 * Les catégories à plat, dans l'ordre d'un parcours d'arbre.
 *
 * « Sodas » doit apparaître SOUS « Boissons » : une liste alphabétique plate
 * les séparerait, et le marchand ne verrait pas que l'une contient l'autre.
 * L'indentation passe par le LIBELLÉ, `OptionSelect` ne portant pas de
 * sous-titre - décision déjà prise pour toutes les listes de choix.
 */
export async function categoriesPourFiltre(): Promise<CategorieChoix[]> {
  const lignes = await db
    .select({
      id: categories.id,
      nom: categories.name,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(or(eq(categories.isDeleted, false), isNull(categories.isDeleted)))
    // `(sort_order, name)`, miroir de `Category.Meta.ordering`. Deux ordres
    // pour le même arbre dans la même application serait pire que ce
    // changement.
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  // Le parcours, la garde de cycle et la reprise des orphelins vivent dans
  // `ordreArbre` : les recopier ici serait la seconde arithmétique d'arbre du
  // dépôt, et la liste des référentiels a besoin de la même.
  return ordreArbre(lignes).map((r) => ({
    id: r.item.id,
    nom: r.item.nom,
    parentId: r.item.parentId,
    profondeur: r.profondeur,
  }));
}

/**
 * La catégorie et sa descendance, lues en base. `null` : aucun filtre.
 *
 * Le serveur filtre sur le sous-arbre entier ; s'en tenir à la catégorie
 * choisie ferait montrer à l'écran MOINS de lignes que le document n'en porte.
 */
export async function identifiantsSousArbre(
  racine: string | null
): Promise<string[] | null> {
  if (!racine) return null;
  return sousArbre(await toutesLesCategories(), racine);
}
