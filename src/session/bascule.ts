/**
 * Bascule depuis l'ancienne application.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES DEUX APPLICATIONS PORTENT LE MÊME IDENTIFIANT NATIF.                │
 * │                                                                          │
 * │ `mobile/vente-facile/app.json` déclare `com.ventefacile.app`, et le      │
 * │ profil de PRODUCTION de celle-ci n'ajoute aucun suffixe : c'est le même. │
 * │ Installer la nouvelle par-dessus l'ancienne n'est donc pas une seconde   │
 * │ application, c'est une MISE À JOUR EN PLACE, et elle hérite du bac à     │
 * │ sable - la base WatermelonDB de l'ancienne comprise.                     │
 * │                                                                          │
 * │ Le danger n'est pas la collision, c'est le SILENCE : les ventes que      │
 * │ l'ancienne app n'avait pas encore poussées restent dans un fichier que   │
 * │ la nouvelle ne lit jamais. Elles ne sont ni perdues ni visibles - elles  │
 * │ n'existent plus pour personne, et le marchand ne l'apprend qu'en         │
 * │ cherchant une vente qu'il se souvient d'avoir faite.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * D'où cette lecture, faite UNE fois au démarrage : si le fichier de l'ancienne
 * est là, on compte ce qu'il reste à pousser et on le DIT, avant de laisser
 * vendre. La règle de la bascule est simple et elle tient dans une phrase :
 * **on vide l'ancienne app avant d'installer la nouvelle.**
 *
 * On ne tente PAS de rejouer ces enregistrements. Leur schéma n'est pas le
 * nôtre, leurs numéros de document ont été fabriqués par le serveur d'alors, et
 * une migration silencieuse de données comptables est exactement ce qu'on ne
 * veut pas faire dans le dos d'un marchand.
 *
 * L'ancienne voie de synchronisation (`POST /api/v1/sync/`) a été retirée du
 * serveur avec l'application qu'elle servait : réinstaller celle-ci ne remonte
 * plus rien. Ce module ne fait donc plus qu'une chose, et c'est la seule qui
 * reste vraie : DIRE que ces écritures n'existent que dans ce fichier, avant
 * qu'une désinstallation ne l'emporte.
 */
import { File } from "expo-file-system";
import * as SQLite from "expo-sqlite";

/**
 * Nom du fichier de l'ancienne base.
 *
 * `SQLiteAdapter` sans `dbName` retombe sur `'watermelon'` (son `_getName`), et
 * les deux plateformes y accolent `.db`.
 */
const FICHIER_ANCIEN = "watermelon.db";

/**
 * Les tables de l'ancienne app qui portaient des ÉCRITURES locales.
 *
 * Inutile de balayer les trente : une catégorie non synchronisée n'est pas un
 * incident, une vente non synchronisée en est un. On regarde ce qui vaut de
 * l'argent.
 */
const TABLES_A_RISQUE = [
  "sales",
  "sale_items",
  "payments",
  "customers",
  "stock_movements",
  "expenses",
  "cash_movements",
];

export interface ResteAncienneApp {
  /** Chemin du fichier trouvé, pour le dire à qui doit intervenir. */
  chemin: string;
  /** Nombre d'enregistrements non poussés, par table. Vide : rien à sauver. */
  parTable: { table: string; nombre: number }[];
  total: number;
}

/** Retire le dernier segment d'un chemin absolu. */
function parentDe(chemin: string): string {
  return chemin.replace(/\/+[^/]+\/*$/, "");
}

/**
 * Les dossiers où l'ancienne application a pu déposer sa base.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA BASE DE WATERMELONDB N'EST PAS DANS LE DOSSIER DES DOCUMENTS SUR      │
 * │ ANDROID.                                                                 │
 * │                                                                          │
 * │ Établi dans la source de `@nozbe/watermelondb@0.28` :                     │
 * │                                                                          │
 * │   WMDatabase.java   context.getDatabasePath(name + ".db")                │
 * │                            .getPath().replace("/databases", "")           │
 * │                     → /data/user/0/<paquet>/watermelon.db                 │
 * │                                                                          │
 * │   DatabasePlatformIOS.mm   NSDocumentDirectory + "<name>.db"              │
 * │                     → <bac à sable>/Documents/watermelon.db               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sur Android le fichier est donc dans le PARENT du dossier des documents
 * (`files/`), pas dedans : chercher sous `Paths.document` n'y trouve jamais
 * rien, et la bascule se tairait précisément sur la plateforme qu'elle vise.
 *
 * La racine se déduit de `SQLite.defaultDatabaseDirectory`, qui vaut
 * `<documents>/SQLite` des deux côtés (`SQLiteModule.kt` : `filesDir` ;
 * `SQLiteModule.swift` : `documentDirectory`). C'est un chemin NU, sans schéma
 * `file://`, ce que `openDatabaseAsync` attend et ce qu'un URI d'
 * `expo-file-system` n'est pas.
 */
function dossiersCandidats(): string[] {
  const parDefaut = SQLite.defaultDatabaseDirectory as string | null | undefined;
  if (!parDefaut) return [];

  const documents = parentDe(parDefaut); // `files/` (Android) ou `Documents/` (iOS)
  const racine = parentDe(documents); // bac à sable de l'application

  return [
    racine, // Android : /data/user/0/<paquet>/watermelon.db
    documents, // iOS : <bac à sable>/Documents/watermelon.db
    // Anciennes versions de WatermelonDB, qui ne retiraient pas `/databases`.
    `${racine}/databases`,
    `${documents}/databases`,
  ];
}

/** Le premier dossier candidat qui porte réellement le fichier. */
function dossierDeLaBase(): string | null {
  for (const dossier of dossiersCandidats()) {
    try {
      // `File` veut un URI, `openDatabaseAsync` veut un chemin nu : les deux
      // API voisinent sans parler la même langue, et les confondre est
      // exactement le défaut que ce module a porté.
      if (new File(`file://${dossier}/${FICHIER_ANCIEN}`).exists) return dossier;
    } catch {
      // Chemin inaccessible : ce n'est pas une bascule, on passe au suivant.
    }
  }
  return null;
}

/**
 * Ce que l'ancienne application a laissé, s'il y a quelque chose.
 *
 * Rend `null` quand il n'y a pas de bascule : installation neuve, ou ancienne
 * app déjà vidée et désinstallée. C'est le cas de très loin le plus fréquent,
 * et il ne doit rien coûter - quelques existences de fichier, et on s'arrête.
 */
export async function resteDeLAncienneApp(): Promise<ResteAncienneApp | null> {
  const dossier = dossierDeLaBase();
  if (dossier === null) return null;
  const chemin = `${dossier}/${FICHIER_ANCIEN}`;

  const parTable: { table: string; nombre: number }[] = [];
  try {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE PREMIER ARGUMENT EST UN NOM, PAS UN CHEMIN.                     │
    // │                                                                    │
    // │ `openDatabaseAsync(nom, options, dossier)` recolle simplement      │
    // │ `dossier + "/" + nom` (`pathUtils.createDatabasePath`). Lui passer │
    // │ un URI le traite comme un NOM DE FICHIER : SQLite crée alors une   │
    // │ base VIDE sous `<SQLite>/file:/…/watermelon.db`, chaque requête    │
    // │ échoue, le compte tombe à zéro, et l'écran annonce « Rien à        │
    // │ reprendre » pendant que les ventes de l'ancienne app sont          │
    // │ toujours là. Un silence, jamais une erreur.                        │
    // └────────────────────────────────────────────────────────────────────┘
    //
    // On n'écrit RIEN : que des `SELECT`, aucune migration. `expo-sqlite`
    // n'expose pas d'ouverture en lecture seule (`SQLiteOpenOptions` ne porte
    // que `enableChangeListener`, `useNewConnection`, `libSQLOptions`), la
    // discipline est donc ici et pas dans un drapeau.
    const base = await SQLite.openDatabaseAsync(
      FICHIER_ANCIEN,
      { useNewConnection: true },
      dossier
    );
    try {
      for (const table of TABLES_A_RISQUE) {
        try {
          // `_status` est le marqueur de WatermelonDB : tout ce qui n'est pas
          // `synced` attend encore d'être poussé.
          const ligne = await base.getFirstAsync<{ n: number }>(
            `SELECT COUNT(*) AS n FROM ${table} WHERE _status IS NOT NULL AND _status <> 'synced'`
          );
          const n = Number(ligne?.n ?? 0);
          if (n > 0) parTable.push({ table, nombre: n });
        } catch {
          // Table absente de ce schéma : ce n'est pas une anomalie, les
          // versions de l'ancienne app n'avaient pas toutes les mêmes.
        }
      }
    } finally {
      await base.closeAsync();
    }
  } catch {
    // Le fichier existe mais ne s'ouvre pas : on le SIGNALE quand même, sans
    // compte. Un fichier illisible est justement le cas où il faut un humain.
    return { chemin, parTable: [], total: -1 };
  }

  const total = parTable.reduce((t, l) => t + l.nombre, 0);
  // Le fichier est là mais vidé : la bascule s'est bien passée, on se tait.
  if (total === 0) return null;
  return { chemin, parTable, total };
}

/** Libellés français des tables, pour un écran que lit un marchand. */
export const NOM_TABLE: Record<string, string> = {
  sales: "ventes",
  sale_items: "lignes de vente",
  payments: "règlements",
  customers: "clients",
  stock_movements: "mouvements de stock",
  expenses: "dépenses",
  cash_movements: "mouvements de caisse",
};
