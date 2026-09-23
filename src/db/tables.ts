/**
 * Les noms SQL des tables, DÉRIVÉS du schéma.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON NE RECOPIE JAMAIS UNE LISTE DE TABLES À LA MAIN.                     │
 * │                                                                          │
 * │ `schema/pulled.ts` est ENGENDRÉ par `pnpm db:pull-schema` depuis le      │
 * │ manifeste du serveur. Une liste tenue à part dériverait à la prochaine   │
 * │ régénération, en silence, et une table oubliée referait exactement le    │
 * │ défaut que la purge existe pour corriger : les ventes d'un marchand      │
 * │ resteraient visibles sous le compte du suivant.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Deux bénéfices gratuits, qui valent d'être nommés :
 *
 * - `__drizzle_migrations` n'apparaît jamais ici. Elle n'est pas dans le schéma,
 *   et l'effacer ferait rejouer TOUT le journal de migrations au démarrage
 *   suivant, sur une base qui porte déjà les tables.
 * - Une table ajoutée au schéma demain est purgée du jour où elle est ajoutée,
 *   sans que personne ait à y penser.
 *
 * Module PUR au sens de ce dépôt : il importe les modules de SCHÉMA, qui ne
 * déclarent que des tables et n'ouvrent aucune base. `@/db/client`, lui, ouvre
 * SQLite au chargement ; il n'a rien à faire ici.
 */
import { getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";

import * as locales from "./schema/local";
import * as tirees from "./schema/pulled";

/**
 * Les noms SQL exportés par un module de schéma, en ordre alphabétique.
 *
 * L'ordre n'est pas décoratif : il rend la liste stable d'une exécution à
 * l'autre, donc un test qui la compare ne dépend pas de l'ordre de déclaration
 * d'un fichier engendré.
 */
export function nomsDesTables(module: Record<string, unknown>): string[] {
  return Object.values(module)
    .filter((v): v is SQLiteTable => is(v, SQLiteTable))
    .map((t) => getTableName(t))
    .sort();
}

/** Les tables tirées du serveur. Jamais écrites localement, purgées en bloc. */
export function tablesTirees(): string[] {
  return nomsDesTables(tirees);
}

/** Les tables purement locales. Elles ne se traitent PAS uniformément : voir `purge-regles.ts`. */
export function tablesLocales(): string[] {
  return nomsDesTables(locales);
}
