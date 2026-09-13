/**
 * Tirage des données depuis le serveur.
 *
 * Une table à la fois, page par page, en rebouclant tant que le serveur annonce
 * qu'il en reste. Le point de reprise n'avance qu'une fois la table épuisée :
 * c'est ce qui distingue « j'ai tout reçu » de « la connexion a lâché au
 * milieu », deux situations que l'ancienne synchronisation confondait.
 */
import { api } from "@/api/client";
import { SYNC_TIMEOUT_MS } from "@/api/config";
import { ApiError, readableMessage } from "@/api/errors";
import { connection } from "@/db/client";

import { deleteRows, replaceChildren, upsertRows } from "./ingest";
import { readAllStates, readState, writeState } from "./state";
import type {
  ChangedTables,
  Manifest,
  PullPage,
  PullProgress,
  TableSpec,
} from "./types";

/**
 * Le manifeste est demandé une fois par cycle, il ne change pas en cours de route.
 *
 * Comme toutes les requêtes de synchronisation, il porte `SYNC_TIMEOUT_MS` et
 * non le délai par défaut : voir la note de `pullTable`.
 */
export async function fetchManifest(withCounts = false): Promise<Manifest> {
  return api.get<Manifest>(
    `/sync/pull/manifest/${withCounts ? "?counts=1" : ""}`,
    { timeoutMs: SYNC_TIMEOUT_MS }
  );
}

/**
 * Réduit une exception à une PHRASE affichable.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN MESSAGE D'ERREUR EST UNE PHRASE, JAMAIS UNE PAGE.                     │
 * │                                                                          │
 * │ `lastError` est rendu TEL QUEL dans le bandeau de l'écran                │
 * │ Synchronisation. Un 500 de Django, un proxy inverse ou un portail        │
 * │ captif d'hôtel répondent une page de balises, et `String(error)` sur un  │
 * │ échec d'ingestion peut rendre une chaîne sans fin.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `readableMessage` appliquée à une CHAÎNE porte déjà les deux bornes qui
 * manquent ici : elle refuse ce qui ressemble à du HTML et coupe au-delà de
 * trois cents signes. On ne réécrit pas cette règle, on l'emprunte.
 */
function messageDEchec(error: unknown): string {
  const brut = error instanceof Error ? error.message : String(error);
  return readableMessage(brut, "Le tirage de cette table a échoué.");
}

interface PullOptions {
  onProgress?: (progress: PullProgress) => void;
  /** Permet d'interrompre proprement : l'écran quitté, on arrête. */
  signal?: AbortSignal;
  pageSize?: number;
}

/**
 * Tire une table jusqu'au bout.
 *
 * Retourne le nombre de lignes reçues. Une interruption laisse le point de
 * reprise sur la dernière page RÉUSSIE : reprendre ne rejoue rien et ne saute
 * rien.
 */
export async function pullTable(
  spec: TableSpec,
  options: PullOptions & { received?: (n: number) => void } = {}
): Promise<number> {
  const { signal, pageSize = 500 } = options;
  const state = await readState(spec.name);

  let cursor = state?.cursor ?? null;
  let deletedCursor = state?.deletedCursor ?? null;
  let total = 0;

  for (;;) {
    if (signal?.aborted) return total;

    const params = new URLSearchParams({
      table: spec.name,
      limit: String(pageSize),
    });
    if (cursor) params.set("cursor", cursor);
    if (deletedCursor) params.set("deleted_cursor", deletedCursor);

    // Ce que la page a rapporté, lu APRÈS le bloc gardé : le rappel de
    // progression de l'appelant n'a rien à faire dans le chemin d'erreur, il
    // ferait consigner un échec de table pour un simple défaut d'affichage.
    let recues = 0;
    let encore = false;

    try {
      // ┌────────────────────────────────────────────────────────────────────┐
      // │ LE DÉLAI DE SYNCHRONISATION, PAS CELUI D'UN APPEL ORDINAIRE.       │
      // │                                                                    │
      // │ `SYNC_TIMEOUT_MS` existait et n'avait AUCUN consommateur : le      │
      // │ tirage tournait au défaut de trente secondes. Sur une 2G           │
      // │ congolaise, une première page de cinq cents lignes le dépasse, la  │
      // │ requête est abandonnée, et `client.ts` classe tout abandon en      │
      // │ `network`. Le marchand lisait donc « Serveur injoignable » pendant │
      // │ que le serveur répondait, et aucun geste de sa part n'y pouvait    │
      // │ rien.                                                              │
      // └────────────────────────────────────────────────────────────────────┘
      const page = await api.get<PullPage>(`/sync/pull/?${params.toString()}`, {
        signal,
        timeoutMs: SYNC_TIMEOUT_MS,
      });

      // Tout ce qu'une page contient s'écrit ensemble, ou pas du tout. Une
      // vente sans ses lignes est pire qu'une vente absente.
      await connection.withTransactionAsync(async () => {
        await upsertRows(spec.name, spec.columns, page.rows);

        for (const child of spec.children) {
          const parentIds = page.rows.map((row) => String(row.id));
          const childRows = page.rows.flatMap(
            (row) => (row[child.name] as Record<string, unknown>[]) ?? []
          );
          await replaceChildren(child, parentIds, childRows);
        }

        if (page.deleted_ids.length) {
          await deleteRows(spec.name, page.deleted_ids);
        }
      });

      total += page.rows.length;
      cursor = page.next_cursor;
      deletedCursor = page.next_deleted_cursor;

      // Le point de reprise avance page par page : une coupure au milieu d'un
      // catalogue de 20 000 produits ne fait pas tout recommencer.
      await writeState(spec.name, {
        cursor,
        deletedCursor,
        hasMore: page.has_more,
        lastError: null,
      });

      recues = page.rows.length;
      encore = page.has_more;
    } catch (error) {
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ LE BLOC GARDÉ COUVRE TOUTE LA PAGE, PAS SEULEMENT LA REQUÊTE.   │
      // │                                                                  │
      // │ Il ne couvrait que l'appel : une exception venue de l'INGESTION  │
      // │ - colonne absente d'une réponse malformée, transaction refusée - │
      // │ ne laissait AUCUN motif sur la ligne d'état. Depuis que le       │
      // │ tirage isole ses échecs et passe à la table suivante, c'est      │
      // │ précisément la seule trace que l'écran Synchronisation puisse    │
      // │ montrer pour CETTE table.                                        │
      // │                                                                  │
      // │ On NE touche PAS au point de reprise : la table reprendra où     │
      // │ elle en était. Une erreur ne doit jamais faire sauter une        │
      // │ fenêtre de données.                                              │
      // └──────────────────────────────────────────────────────────────────┘
      await writeState(spec.name, { lastError: messageDEchec(error) });
      throw error;
    }

    options.received?.(recues);
    if (!encore) break;
  }

  await writeState(spec.name, {
    hasMore: false,
    lastFullSyncAt: new Date(),
    lastError: null,
    rowCount: (state?.rowCount ?? 0) + total,
  });
  return total;
}

/**
 * Demande au serveur QUELLES tables ont du neuf.
 *
 * Renvoie `null` si la sonde échoue : on retombe alors sur l'ancien
 * comportement, tirer tout. Une sonde indisponible doit ralentir la
 * synchronisation, jamais l'empêcher.
 *
 * La PRÉSENCE d'une clé dit au serveur « j'ai déjà tiré cette table en
 * entier », sa valeur dit jusqu'où. Les deux comptent : une table vide se tire
 * entièrement et rend un curseur nul, qu'il ne faut pas confondre avec « jamais
 * tirée ». Une table restée à `hasMore` n'a PAS été tirée en entier, on ne
 * l'annonce donc pas comme connue.
 */
async function fetchChangedTables(
  signal?: AbortSignal
): Promise<Set<string> | null> {
  const states = await readAllStates();
  const cursors: Record<string, string | null> = {};
  const deletedCursors: Record<string, string | null> = {};

  for (const state of states) {
    if (!state.lastFullSyncAt || state.hasMore) continue;
    cursors[state.table] = state.cursor ?? null;
    deletedCursors[state.table] = state.deletedCursor ?? null;
  }

  if (Object.keys(cursors).length === 0) return null;

  try {
    const reponse = await api.post<ChangedTables>(
      "/sync/pull/changed/",
      { cursors, deleted_cursors: deletedCursors },
      { signal, timeoutMs: SYNC_TIMEOUT_MS }
    );
    return new Set(reponse.changed);
  } catch {
    return null;
  }
}

/** Ce qu'un cycle de tirage a réellement fait. */
export interface BilanPull {
  /** Tables tirées jusqu'au bout. */
  tables: number;
  rows: number;
  interrupted: boolean;
  /** Tables que le serveur a déclarées sans changement. */
  skipped: number;
  /**
   * Tables que ce cycle n'a PAS su tirer, et le motif de chacune.
   *
   * Un tableau vide est la seule lecture qui autorise à dire « tout est à
   * jour ». Rendre un bilan sans ce champ obligerait l'appelant à croire un
   * succès qui n'en est pas un.
   */
  echecs: { table: string; message: string }[];
}

/**
 * Tire les tables qui ont du neuf, dans l'ordre du manifeste.
 *
 * L'ordre porte du sens : l'organisation, les moyens de paiement, les produits
 * et les stocks d'abord, parce que le point de vente s'ouvre dès qu'ils sont
 * là. Le reste continue derrière.
 *
 * Une table sans changement est SAUTÉE, sans que son CURSEUR bouge : une
 * synchronisation qui ne trouve rien coûte un aller-retour au lieu de
 * trente-deux. Sa date de fraîcheur, elle, avance : le serveur vient de
 * confirmer qu'elle est complète, et le taire ferait annoncer « il y a 3 j »
 * juste après une synchronisation réussie.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE TABLE QUI ÉCHOUE N'EMPORTE PAS LES SUIVANTES.                        │
 * │                                                                          │
 * │ C'est la règle du journal d'opérations (« verdict par opération, jamais  │
 * │ par lot ») appliquée au tirage, et elle manquait ici. Le dépôt a connu   │
 * │ un `FieldError` sur `sale_returns` qui faisait répondre 500 : l'erreur   │
 * │ remontait, et les tables PLACÉES APRÈS elle au manifeste n'étaient plus  │
 * │ jamais tirées. Leur point de reprise restait juste, donc rien n'était    │
 * │ perdu, mais la base locale du marchand restait incomplète en silence,    │
 * │ jusqu'à ce que le défaut serveur soit corrigé.                           │
 * │                                                                          │
 * │ Une panne de RÉSEAU, elle, reste terminale, et le motif est chiffré :    │
 * │ trente-huit tables à faire expirer une à une font près de vingt minutes  │
 * │ d'attente pour zéro donnée. Ce qui distingue les deux est `kind` :       │
 * │ `network` dit que rien n'a atteint le serveur, tout le reste dit qu'il   │
 * │ a répondu, donc qu'il répondra encore à la table suivante.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function pullAll(options: PullOptions = {}): Promise<BilanPull> {
  // Une sonde d'abord : sans elle, ce tirage parcourait les trente et une
  // tables du manifeste, une requête séquentielle chacune, MÊME QUAND RIEN
  // N'AVAIT CHANGÉ. Vingt et une réponses consécutives de 250 octets disant
  // « rien de neuf », soit une dizaine de secondes d'attente pour zéro donnée
  // sur un réseau à 300 ms de latence. `null` : sonde indisponible ou première
  // synchronisation, on tire tout.
  const changed = await fetchChangedTables(options.signal);

  // Les décomptes coûtent 31 `COUNT` au serveur et ne servent qu'à chiffrer la
  // progression de la PREMIÈRE synchronisation. Les redemander à chaque fois
  // était pur gaspillage.
  const manifest = await fetchManifest(changed === null);
  const expectedTotal = manifest.tables.reduce(
    (sum, t) => sum + (t.row_count ?? 0),
    0
  );

  let receivedTotal = 0;
  let done = 0;
  let skipped = 0;
  const echecs: BilanPull["echecs"] = [];
  /** Conservée pour la relever si AUCUNE table n'a pu être tirée. */
  let premiereErreur: unknown = null;

  for (const [index, spec] of manifest.tables.entries()) {
    if (changed !== null && !changed.has(spec.name)) {
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ « RIEN DE NEUF » EST UNE CONFIRMATION, PAS UNE ABSENCE DE        │
      // │ RÉPONSE. Elle s'enregistre.                                      │
      // │                                                                  │
      // │ Le CURSEUR ne bouge pas, et c'est intouchable : l'avancer sans   │
      // │ avoir tiré sauterait des lignes pour toujours, le défaut exact   │
      // │ de l'ancien `/sync/`. Mais `lastFullSyncAt` répond à une AUTRE   │
      // │ question : « de quand date ce que je sais de cette table ? ». Le │
      // │ serveur vient précisément de répondre « de maintenant ».         │
      // │                                                                  │
      // │ Sans cette ligne, l'écran de synchronisation annonçait « Complet │
      // │ il y a 3 j » sur trente tables SUR TRENTE ET UNE, à l'instant    │
      // │ même où la synchronisation venait de réussir. Relevé sur         │
      // │ l'émulateur ; le marchand ne peut pas distinguer « à jour » de   │
      // │ « jamais synchronisé », et le comptoir annonçait un verrou       │
      // │ d'inventaire « arrêté au 30 août » trente secondes après l'avoir │
      // │ vérifié. Un chiffre de fraîcheur faux est pire qu'aucun : il     │
      // │ fait appuyer sur « Synchroniser » sans effet.                    │
      // │                                                                  │
      // │ Défaut né avec la sonde (session 2026-08-29), invisible avant    │
      // │ elle : toutes les tables étaient alors tirées à chaque fois.     │
      // └──────────────────────────────────────────────────────────────────┘
      await writeState(spec.name, { lastFullSyncAt: new Date(), lastError: null });
      skipped += 1;
      continue;
    }

    if (options.signal?.aborted) {
      return { tables: done, rows: receivedTotal, interrupted: true, skipped, echecs };
    }

    let received = 0;
    const report = () =>
      options.onProgress?.({
        table: spec.name,
        index: index + 1,
        tableCount: manifest.tables.length,
        received,
        expected: spec.row_count,
        receivedTotal,
        expectedTotal: expectedTotal || null,
      });

    report();
    try {
      await pullTable(spec, {
        ...options,
        received: (n) => {
          received += n;
          receivedTotal += n;
          report();
        },
      });
      done += 1;
    } catch (error) {
      // Une interruption DEMANDÉE n'est pas un échec. Elle arrive ici et non
      // en tête de boucle quand le signal tombe pendant la requête : le
      // client abandonne alors le `fetch`, et tout abandon y est classé
      // `network`. La relever afficherait « Serveur injoignable » à qui vient
      // d'appuyer sur « Interrompre ».
      if (options.signal?.aborted) {
        return { tables: done, rows: receivedTotal, interrupted: true, skipped, echecs };
      }

      premiereErreur ??= error;

      // Rien n'a atteint le serveur : les trente-sept tables suivantes
      // échoueraient de la même façon, chacune au bout de son délai. On
      // s'arrête, et le point de reprise de chaque table reste où il était.
      if (error instanceof ApiError && error.kind === "network") throw error;

      // Le serveur a RÉPONDU, et mal, pour cette table-là. `pullTable` a déjà
      // écrit son `lastError`, donc le bandeau de l'écran Synchronisation la
      // désigne en rouge. On la note et on passe à la suivante.
      echecs.push({ table: spec.name, message: messageDEchec(error) });
    }
  }

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ ZÉRO TABLE TIRÉE ET DES ÉCHECS N'EST PAS UN SUCCÈS.                    │
  // │                                                                        │
  // │ Rendre « 0 table, 38 échecs » sans lever ferait afficher               │
  // │ « Synchronisation terminée » à un terminal qui n'a rien reçu du tout.  │
  // │ On relève la PREMIÈRE erreur, celle qui porte la cause ; les suivantes │
  // │ en sont le plus souvent la conséquence.                                │
  // └────────────────────────────────────────────────────────────────────────┘
  if (done === 0 && echecs.length > 0) throw premiereErreur;

  return { tables: done, rows: receivedTotal, interrupted: false, skipped, echecs };
}
