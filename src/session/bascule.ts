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
 * veut pas faire dans le dos d'un marchand. On le renvoie vers l'ancienne app,
 * qui sait, elle, les synchroniser.
 */
import { Directory, File, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";

/** Nom par défaut de la base WatermelonDB : l'ancienne app n'en fixe aucun. */
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

/**
 * Ce que l'ancienne application a laissé, s'il y a quelque chose.
 *
 * Rend `null` quand il n'y a pas de bascule : installation neuve, ou ancienne
 * app déjà vidée et désinstallée. C'est le cas de très loin le plus fréquent,
 * et il ne doit rien coûter - une existence de fichier, et on s'arrête.
 */
export async function resteDeLAncienneApp(): Promise<ResteAncienneApp | null> {
  let fichier: File;
  try {
    fichier = new File(Paths.document, FICHIER_ANCIEN);
    if (!fichier.exists) {
      // Android range parfois la base sous `databases/`, selon la version du
      // greffon SQLite qu'employait l'ancienne app.
      const autre = new File(new Directory(Paths.document, "databases"), FICHIER_ANCIEN);
      if (!autre.exists) return null;
      fichier = autre;
    }
  } catch {
    // Un accès refusé n'est pas une bascule : on ne bloque pas le comptoir
    // pour une lecture qui n'a pas abouti.
    return null;
  }

  const parTable: { table: string; nombre: number }[] = [];
  try {
    // LECTURE SEULE, et c'est la seule façon d'ouvrir ce fichier : il
    // appartient à un schéma qui n'est pas le nôtre, et l'ouvrir en écriture
    // exposerait à une migration accidentelle.
    const base = await SQLite.openDatabaseAsync(fichier.uri, {
      useNewConnection: true,
    });
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
    return { chemin: fichier.uri, parTable: [], total: -1 };
  }

  const total = parTable.reduce((t, l) => t + l.nombre, 0);
  // Le fichier est là mais vidé : la bascule s'est bien passée, on se tait.
  if (total === 0) return null;
  return { chemin: fichier.uri, parTable, total };
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
