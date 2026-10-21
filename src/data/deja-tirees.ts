/**
 * Les références du journal que le TIRAGE a déjà ramenées.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DÉDOUBLONNAGE SE FAIT CONTRE LA TABLE, JAMAIS CONTRE UNE PAGE.       │
 * │                                                                          │
 * │ Le serveur reprend l'identifiant ET la référence du terminal, et la      │
 * │ poussée remet l'opération en `pending` quand la réponse se perd APRÈS    │
 * │ que le serveur l'a appliquée. Un tirage ramène alors la vente dans       │
 * │ `sales` pendant qu'elle est encore dans le journal.                      │
 * │                                                                          │
 * │ Une vente comptée deux fois n'est pas une ligne en trop dans une liste : │
 * │ c'est un chiffre d'affaires doublé, des unités doublées et une courbe    │
 * │ qui invente une journée. Le croisement était écrit dans `data/ventes.ts` │
 * │ et manquait au tableau de bord ; il vit ici pour qu'un troisième lecteur │
 * │ n'ait pas à le redécouvrir.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * On n'interroge que les références EN FILE, peu nombreuses par construction -
 * c'est ce qui n'a pas encore été poussé.
 *
 * ⚠ UN SEUL CORPS, DEUX FAÇADES. Ce module annonçait vivre ici « pour qu'un
 * troisième lecteur n'ait pas à le redécouvrir », et il était pourtant câblé sur
 * `sales` seul : le lecteur des réquisitions est ce troisième, et il a redécouvert
 * le défaut. Une troisième copie serait la divergence de plus.
 */
import { inArray } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

import { db } from "@/db/client";
import { requisitions, sales } from "@/db/schema";

async function croiser(
  references: (string | null | undefined)[],
  table: SQLiteTable,
  colonne: SQLiteColumn
): Promise<Set<string>> {
  const utiles = references.filter((r): r is string => Boolean(r));
  if (utiles.length === 0) return new Set();

  const connues = await db
    .select({ reference: colonne })
    .from(table)
    .where(inArray(colonne, utiles));

  return new Set(connues.map((l) => l.reference as string));
}

/** Les ventes que le tirage a déjà ramenées. */
export async function referencesDejaTirees(
  references: (string | null | undefined)[]
): Promise<Set<string>> {
  return croiser(references, sales, sales.reference);
}

/** Les réquisitions que le tirage a déjà ramenées. */
export async function requisitionsDejaTirees(
  references: (string | null | undefined)[]
): Promise<Set<string>> {
  return croiser(references, requisitions, requisitions.reference);
}
