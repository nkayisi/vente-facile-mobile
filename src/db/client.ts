/**
 * Base locale.
 *
 * Une seule connexion pour toute l'application, ouverte de façon synchrone au
 * chargement du module : le démarrage à froid ne doit faire AUCUN appel réseau
 * ni attendre quoi que ce soit avant d'afficher le panier du jour.
 */
import * as SQLite from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";

import * as schema from "./schema";

export const DATABASE_NAME = "vente-facile.db";

const connection = SQLite.openDatabaseSync(DATABASE_NAME, {
  enableChangeListener: true, // requis par `useLiveQuery`
});

/**
 * WAL : la synchronisation écrit pendant que le POS lit. Sans lui, un pull de
 * quelques milliers de produits bloque la grille articles, et le caissier voit
 * l'application se figer au pire moment.
 *
 * `foreign_keys` est désactivé par défaut dans SQLite ; on l'active pour que
 * les liens entre une vente et ses lignes soient tenus par la base et pas
 * seulement par notre code.
 */
connection.execSync(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

export const db = drizzle(connection, { schema });

export type Database = typeof db;
export { connection, schema };
