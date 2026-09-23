/**
 * Vider la base locale, pour qu'un terminal change de compte sans rien mélanger.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE EST LA SEULE MAIN QUI EFFACE, ET IL NE DÉCIDE DE RIEN.        │
 * │                                                                          │
 * │ La doctrine de `session/logout()` reste vraie : se déconnecter n'efface  │
 * │ PAS la base. L'ancienne application appelait `resetDatabase()` en se     │
 * │ déconnectant et détruisait la journée d'un caissier qui voulait          │
 * │ simplement changer de compte. Ce qui lève cette raison n'est pas ce      │
 * │ fichier, c'est son APPELANT : il a garanti, avant d'appeler, que la file │
 * │ d'envoi était vide, ou qu'un humain a décidé de la perdre.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `DELETE FROM` plutôt que supprimer le fichier, et ce n'est pas un raccourci.
 * `db/client.ts` ouvre la connexion de façon SYNCHRONE au chargement du module,
 * et `db` comme `connection` sont des exports figés, capturés par une
 * cinquantaine de `useLecture`. Aucun moyen de les rebrancher sans
 * `reloadAsync()`, qui détruirait l'état de la manœuvre en cours - on ne
 * pourrait même plus afficher « Nettoyage » - et laisserait, en WAL, un trio
 * `.db`/`.db-wal`/`.db-shm` dont l'effacement partiel donne une base corrompue.
 *
 * `DELETE FROM` conserve la connexion, le schéma et le journal de migrations,
 * est atomique (une purge interrompue est intégralement annulée) et rend un
 * décompte. Son seul coût est que le fichier ne rétrécit pas, d'où le `VACUUM`
 * qui suit, best-effort.
 */
import { connection } from "@/db/client";
import { ecrireReglage, lireReglage } from "@/data/reglages";
import { viderDossierPhotos } from "@/features/inventaire/photos";

import {
  CLE_PROPRIETAIRE,
  CLE_PURGE_EN_COURS,
  clesEpargnees,
  localesParTraitement,
  TABLE_ALLOWLIST,
  tablesAllowlistInattendues,
  tablesNonClassees,
} from "./purge-regles";
import { tablesLocales, tablesTirees } from "./tables";

export interface BilanPurge {
  tablesVidees: number;
  lignesSupprimees: number;
  fichiersSupprimes: number;
}

/** Un nom de table dérivé du schéma, cité pour SQLite. */
function cite(nom: string): string {
  return `"${nom.replace(/"/g, '""')}"`;
}

/**
 * Une purge a-t-elle été interrompue avant son terme ?
 *
 * Le drapeau couvre la SEULE étape qui ne tienne pas dans la transaction : la
 * suppression des fichiers de photos. Tout le reste s'annule tout seul.
 */
export async function purgeInachevee(): Promise<boolean> {
  return lireReglage<boolean>(CLE_PURGE_EN_COURS, false);
}

/**
 * La base porte-t-elle encore des données ?
 *
 * Sert au filet d'entrée : sans estampille, une base VIDE est vierge (première
 * installation) et une base HABITÉE est étrangère (réinstallation par-dessus,
 * purge interrompue). Les confondre rouvrirait la fusion par le seul chemin que
 * la modale ne couvre pas.
 *
 * On s'arrête à la première table qui porte une ligne : sur une base pleine, la
 * réponse tombe au premier `SELECT`.
 */
export async function baseHabitee(): Promise<boolean> {
  // ⚠ `vider_sauf_allowlist` est DÉLIBÉRÉMENT absent, et c'est le premier
  // réflexe qu'aura le prochain lecteur. `local_settings` porte le thème et
  // l'imprimante dès le premier lancement : l'inclure rendrait « habitée »
  // toujours vraie, et déclarerait ÉTRANGÈRE chaque première installation.
  const aRegarder = [
    ...tablesTirees(),
    ...localesParTraitement("vider"),
    ...localesParTraitement("vider_avec_fichiers"),
  ];
  for (const nom of aRegarder) {
    try {
      const ligne = await connection.getFirstAsync<{ n: number }>(
        `SELECT 1 AS n FROM ${cite(nom)} LIMIT 1`
      );
      if (ligne) return true;
    } catch {
      // Une table absente (migration partielle) ne dit pas que la base est
      // habitée. On passe à la suivante.
    }
  }
  return false;
}

/**
 * Vide la base locale, en épargnant les réglages de l'APPAREIL.
 *
 * L'ordre n'est pas négociable :
 *
 *   1. le drapeau, validé AVANT tout ;
 *   2. les FICHIERS des photos ;
 *   3. la transaction, qui emporte toutes les lignes d'un bloc ;
 *   4. le drapeau et l'estampille ;
 *   5. le `VACUUM`, best-effort.
 *
 * ⚠ **LES FICHIERS AVANT LES LIGNES, ET C'EST OBLIGÉ.** Dans l'autre sens, un
 * arrêt entre les deux perd les `uri` pour toujours : le dossier garde des
 * fichiers que plus rien ne référence, sur un terminal qui manque déjà de place.
 * Dans ce sens, un arrêt laisse des lignes pointant vers des fichiers absents,
 * ce que la reprise traite sans bruit (`f.exists` faux).
 */
export async function purgerBaseLocale(): Promise<BilanPurge> {
  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ ON REFUSE DE PURGER À MOITIÉ.                                       │
  // │                                                                      │
  // │ Une table locale ajoutée sans décision ne doit être ni effacée par   │
  // │ défaut (elle pourrait porter un réglage d'appareil), ni épargnée par │
  // │ défaut (elle pourrait porter des ventes). Le test le dit vite ; ceci │
  // │ le dit sûrement, y compris sur un binaire livré.                     │
  // └──────────────────────────────────────────────────────────────────────┘
  const nonClassees = tablesNonClassees(tablesLocales());
  if (nonClassees.length > 0) {
    throw new Error(
      `Purge refusée : ces tables locales ne sont pas classées dans purge-regles.ts : ${nonClassees.join(", ")}`
    );
  }

  // ⚠ Et le second trou, que le premier ne voit pas : une table CLASSÉE
  // `vider_sauf_allowlist` autre que `local_settings` serait silencieusement
  // épargnée, `aVider` ne reprenant que les deux autres traitements. Elle se
  // rend par un `DELETE … WHERE "key" NOT IN (…)`, qui suppose une colonne
  // `key` : il n'y a rien à généraliser, il y a une décision à prendre.
  const inattendues = tablesAllowlistInattendues();
  if (inattendues.length > 0) {
    throw new Error(
      `Purge refusée : ${inattendues.join(", ")} est classée « vider_sauf_allowlist », que seule ${TABLE_ALLOWLIST} sait rendre. Donnez-lui son propre traitement dans purge-regles.ts.`
    );
  }

  await ecrireReglage(CLE_PURGE_EN_COURS, true);

  const fichiersSupprimes = await viderDossierPhotos();

  const aVider = [
    ...tablesTirees(),
    ...localesParTraitement("vider"),
    ...localesParTraitement("vider_avec_fichiers"),
  ];
  const epargnees = clesEpargnees();
  const trous = epargnees.map(() => "?").join(", ");

  let lignesSupprimees = 0;
  let tablesVidees = 0;

  await connection.withTransactionAsync(async () => {
    // Assurance à coût nul : `schema/pulled.ts` ne déclare aujourd'hui aucun
    // `references()`, mais `client.ts` pose `PRAGMA foreign_keys = ON` et le
    // générateur peut en produire demain. Sans cela, l'ordre d'effacement
    // deviendrait une règle de plus à tenir.
    await connection.execAsync("PRAGMA defer_foreign_keys = ON;");

    for (const nom of aVider) {
      const r = await connection.runAsync(`DELETE FROM ${cite(nom)}`);
      lignesSupprimees += r.changes;
      tablesVidees += 1;
    }

    // ⚠ JAMAIS un `DELETE FROM local_settings` sec : il emporterait le thème et
    // l'imprimante, qui décrivent le matériel posé sur le comptoir et non le
    // compte. Le marchand suivant devrait réappairer avant d'imprimer un ticket.
    const r = await connection.runAsync(
      `DELETE FROM "local_settings" WHERE "key" NOT IN (${trous})`,
      epargnees
    );
    lignesSupprimees += r.changes;
    tablesVidees += 1;
  });

  // Hors transaction, et dans cet ordre : le drapeau doit survivre au commit,
  // pour qu'une purge tuée juste après lui se rejoue plutôt que de se croire
  // finie. L'estampille part ici aussi ; c'est l'appelant qui repose la nouvelle.
  await connection.runAsync(`DELETE FROM "local_settings" WHERE "key" IN (?, ?)`, [
    CLE_PROPRIETAIRE,
    CLE_PURGE_EN_COURS,
  ]);

  try {
    await connection.execAsync("VACUUM;");
  } catch {
    // Le `VACUUM` rend la place au système ; il ne conditionne rien. Un échec
    // (disque plein, base occupée) ne doit pas faire échouer une déconnexion.
  }

  return { tablesVidees, lignesSupprimees, fichiersSupprimes };
}
