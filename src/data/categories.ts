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

import { sousArbre, type NoeudCategorie } from "./categories-arbre";

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
    .orderBy(asc(categories.name));

  const enfants = new Map<string | null, typeof lignes>();
  for (const l of lignes) {
    const cle = l.parentId ?? null;
    const fratrie = enfants.get(cle);
    if (fratrie) fratrie.push(l);
    else enfants.set(cle, [l]);
  }

  const rendu: CategorieChoix[] = [];
  const vus = new Set<string>();
  const descendre = (parent: string | null, profondeur: number) => {
    for (const l of enfants.get(parent) ?? []) {
      // Garde de cycle : une hiérarchie fautive ralentit, elle ne boucle pas.
      if (vus.has(l.id)) continue;
      vus.add(l.id);
      rendu.push({ id: l.id, nom: l.nom, parentId: l.parentId, profondeur });
      descendre(l.id, profondeur + 1);
    }
  };
  descendre(null, 0);

  // Une catégorie dont le parent a été supprimé n'a plus de racine : la perdre
  // la rendrait infiltrable, sans que rien ne le signale.
  for (const l of lignes) {
    if (!vus.has(l.id)) {
      rendu.push({ id: l.id, nom: l.nom, parentId: l.parentId, profondeur: 0 });
    }
  }
  return rendu;
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
