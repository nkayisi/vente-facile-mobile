/**
 * Envoi des opérations en attente.
 *
 * Le serveur rend un verdict PAR opération. C'est toute la différence avec
 * l'ancienne file, qui envoyait tout d'un bloc et marquait les deux cents
 * opérations en échec dès qu'une seule était refusée, en incrémentant leur
 * compteur d'essais par-dessus le marché : cinq refus d'un enregistrement
 * fautif condamnaient définitivement une journée de ventes valides.
 */
import * as Crypto from "expo-crypto";

import { api } from "@/api/client";
import { SYNC_TIMEOUT_MS } from "@/api/config";
import { ApiError } from "@/api/errors";

import {
  BATCH_SIZE,
  markBlocked,
  markDone,
  markInflight,
  markQuarantined,
  readyToSend,
  recoverInflight,
  scheduleRetry,
} from "./outbox";
import { messageOf } from "./policy";
import { fetchManifest, pullTable } from "./pull";
import type { TableSpec } from "./types";

export type Verdict = "applied" | "duplicate" | "rejected" | "retry" | "blocked";

interface OperationResult {
  operation_id: string;
  verdict: Verdict;
  server_ids: Record<string, string | null>;
  authoritative: Record<string, unknown> | null;
  errors: { code?: string; detail?: string; errors?: unknown } | null;
}

interface BatchResponse {
  batch_id: string | null;
  server_time: string;
  results: OperationResult[];
}

/**
 * Tables à retirer après qu'une opération a abouti.
 *
 * On NE reconstruit PAS l'état local depuis la réponse du serveur : ce serait
 * une seconde façon de lire, à tenir synchronisée avec la première. On relit
 * par le tirage, qui est déjà le chemin canonique et sait traiter les enfants
 * imbriqués. Le serveur reste la seule autorité sur l'argent.
 */
const TABLES_TOUCHEES: Record<string, string[]> = {
  "sale.create": ["sales", "stocks", "stock_movements", "customers",
                  "customer_balances", "customer_transactions", "cash_movements",
                  "customer_loyalty"],
  "sale.add_payment": ["sales", "customers", "customer_balances",
                       "customer_transactions", "cash_movements", "stocks"],
  "sale.cancel": ["sales", "stocks", "stock_movements", "customers",
                  "customer_balances", "cash_movements"],
  "register_session.open": ["register_sessions"],
  "customer.create": ["customers"],
  "customer.record_payment": ["customers", "customer_balances",
                              "customer_transactions", "sales", "cash_movements"],
  // Un ajustement négatif entre au tiroir : `cash_movements` en fait partie,
  // et l'oublier laisserait le rapport de caisse en arrière d'une écriture.
  "customer.adjust_balance": ["customers", "customer_balances",
                              "customer_transactions", "cash_movements"],
  // ⚠ `products` EN FAIT PARTIE, et ce n'est pas du zèle : le report des prix
  // (`update_product_prices`) écrit la FICHE PRODUIT dans la même transaction
  // que le mouvement (`ProductPricingService.apply`). Sans cette entrée, le
  // terminal ne relit jamais la fiche : le prochain préremplissage ressortirait
  // l'ANCIEN prix, et le comptoir vendrait au tarif d'avant.
  "stock_movement.create": ["stocks", "stock_movements", "products"],
  "stock.unpack": ["stocks", "stock_movements"],
  "stock_transfer.create": ["stock_transfers"],
  "stock_transfer.approve": ["stock_transfers"],
  // Expédier et réceptionner DÉPLACENT du stock : les trois tables suivent.
  "stock_transfer.ship": ["stock_transfers", "stocks", "stock_movements"],
  "stock_transfer.receive": ["stock_transfers", "stocks", "stock_movements"],
  "stock_transfer.cancel": ["stock_transfers", "stocks", "stock_movements"],
  "stock_adjustment.create": ["stock_adjustments"],
  "stock_adjustment.approve": ["stock_adjustments", "stocks", "stock_movements"],
  "stock_adjustment.reject": ["stock_adjustments"],
  "inventory_session.create": ["inventory_sessions"],
  // Démarrer engendre les lignes de comptage : elles descendent avec la
  // session, sans quoi le magasinier ouvrirait une feuille vide.
  "inventory_session.start": ["inventory_sessions", "stocks"],
  "inventory_session.count": ["inventory_sessions"],
  "inventory_session.submit": ["inventory_sessions"],
  // Valider APPLIQUE les écarts : le stock et les mouvements suivent.
  "inventory_session.validate": ["inventory_sessions", "stocks", "stock_movements"],
  "inventory_session.cancel": ["inventory_sessions"],
  "product.create": ["products", "stocks"],
  "category.create": ["categories"],
  "brand.create": ["brands"],
  "unit.create": ["units"],
  // Une seule table : le nom d'une catégorie est JOINT à la lecture des
  // articles (`data/articles.ts`), jamais recopié dans `products`. Relire les
  // articles ne rendrait rien de plus.
  "category.update": ["categories"],
  "brand.update": ["brands"],
  "unit.update": ["units"],
  // Fermer une session fige ses soldes par devise et son écart : la session
  // suit, et les mouvements de caisse avec elle.
  "register_session.close": ["register_sessions", "cash_movements"],
  "sale_return.create": ["sale_returns"],
  // Approuver un retour REND le stock, éteint la dette et peut rembourser :
  // les cinq tables suivent.
  "sale_return.approve": ["sale_returns", "stocks", "stock_movements", "sales",
                          "customers", "customer_balances", "customer_transactions",
                          "cash_movements"],
  "sale_return.reject": ["sale_returns"],
  "quotation.create": ["quotations"],
  // Convertir crée une VENTE et inscrit une dette : la vente, le stock réservé
  // et le compte du client changent tous.
  "quotation.convert": ["quotations", "sales", "stocks", "customers",
                        "customer_balances", "customer_transactions"],
  // ⚠ `cash_movements` alors que CRÉER une dépense ne bouge PAS le tiroir : le
  // serveur l'enregistre en BROUILLON et n'appelle
  // `create_cash_movement_for_expense` qu'à l'approbation. L'entrée reste
  // parce que le serveur peut, demain, approuver d'office ; relire une table
  // pour rien coûte une requête, la manquer laisse un solde faux.
  "expense.create": ["expenses", "cash_movements"],
  // Soumettre ne fait qu'avancer un statut. Les quatre autres touchent le
  // tiroir : approuver et payer en font SORTIR l'argent, annuler l'y remet.
  "expense.submit": ["expenses"],
  "expense.approve": ["expenses", "cash_movements"],
  "expense.reject": ["expenses"],
  "expense.pay": ["expenses", "cash_movements"],
  "expense.cancel": ["expenses", "cash_movements"],
  "cash_movement.create": ["cash_movements"],
  "cash_movement.cancel": ["cash_movements"],
  "income_category.create": ["income_categories"],
  "expense_category.create": ["expense_categories"],
  "income_category.update": ["income_categories"],
  "expense_category.update": ["expense_categories"],
};

export interface PushOutcome {
  sent: number;
  applied: number;
  quarantined: number;
  retry: number;
  blocked: number;
  /** Vrai s'il reste des opérations prêtes à partir. */
  more: boolean;
}

const VIDE: PushOutcome = {
  sent: 0, applied: 0, quarantined: 0, retry: 0, blocked: 0, more: false,
};

/**
 * Envoie un lot et applique les verdicts.
 *
 * Retourne ce qui s'est passé. N'échoue que si RIEN n'a pu partir : une panne
 * réseau laisse toutes les opérations en attente, sans perte et sans doublon,
 * puisque leur identifiant porte l'idempotence côté serveur.
 */
export async function pushOnce(deviceId?: string): Promise<PushOutcome> {
  const lot = await readyToSend(BATCH_SIZE);
  if (lot.length === 0) return VIDE;

  const batchId = Crypto.randomUUID();
  await markInflight(lot.map((o) => o.id), batchId);

  const operations = lot.map((o) => ({
    operation_id: o.id,
    kind: o.kind,
    seq: o.seq,
    depends_on: JSON.parse(o.dependsOn) as string[],
    occurred_at: o.occurredAt.toISOString(),
    payload: JSON.parse(o.payload) as unknown,
  }));

  let reponse: BatchResponse;
  try {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE DÉLAI DE SYNCHRONISATION, ET IL EST PLUS CRITIQUE ICI QU'AU     │
    // │ TIRAGE.                                                            │
    // │                                                                    │
    // │ Un lot porte jusqu'à `BATCH_SIZE` actes que le serveur REJOUE un   │
    // │ par un, chacun dans sa transaction : il répond donc bien plus tard │
    // │ qu'à une lecture. Abandonner au bout de trente secondes ramène le  │
    // │ lot entier en attente alors que le serveur est en train de         │
    // │ l'appliquer, et le renvoi coûte un second traitement complet.      │
    // │ L'idempotence par `operation_id` protège les données, jamais la    │
    // │ batterie ni la patience du caissier.                               │
    // └────────────────────────────────────────────────────────────────────┘
    reponse = await api.post<BatchResponse>(
      "/sync/operations/",
      { batch_id: batchId, device_id: deviceId, operations },
      { timeoutMs: SYNC_TIMEOUT_MS }
    );
  } catch (error) {
    const message = error instanceof ApiError ? error.message : String(error);

    // ┌────────────────────────────────────────────────────────────────────┐
    // │ UNE PORTE FERMÉE N'EST PAS UNE PANNE.                             │
    // │                                                                    │
    // │ Le serveur répond 402 quand l'abonnement ne couvre plus            │
    // │ l'écriture. Réessayer ne l'ouvrira pas : sans cette branche, le    │
    // │ terminal renvoyait le même lot à chaque cycle, pendant toute la    │
    // │ durée du blocage - des semaines, le temps qu'un marchand règle -   │
    // │ en faisant monter un compteur d'essais qui finirait par condamner  │
    // │ des ventes parfaitement valides. Et les écrans annonçaient « attend│
    // │ son envoi », c'est-à-dire qu'ils envoyaient chercher du réseau.    │
    // │                                                                    │
    // │ `blocked` est fait pour cela : conservé, non réessayé, message     │
    // │ distinct, et libéré d'un coup par `unblockAll()` au règlement.     │
    // └────────────────────────────────────────────────────────────────────┘
    if (error instanceof ApiError && error.kind === "subscription") {
      for (const op of lot) await markBlocked(op.id, message);
      // ⚠ `more: false` ARRÊTE la boucle de `pushAll`. Sans lui, le refus
      // portant sur l'endpoint et non sur le lot, cinquante lots partiraient
      // pour cinquante 402.
      //
      // Et on ne relance PAS : rien n'a échoué, une porte est fermée. Le
      // cycle continue vers le tirage, qui reste autorisé et ramène le
      // verdict frais - c'est lui qui fait monter le voile au bon moment.
      return { ...VIDE, sent: lot.length, blocked: lot.length, more: false };
    }

    // Rien n'a atteint le serveur, ou il a repondu 5xx : tout retourne en
    // attente. On n'a RIEN perdu : le renvoi est sûr.
    for (const op of lot) await scheduleRetry(op.id, op.attempts, message);
    throw error;
  }

  const parKind = new Map(lot.map((o) => [o.id, o]));
  const resultat = { ...VIDE, sent: lot.length };
  const tables = new Set<string>();

  for (const r of reponse.results) {
    const op = parKind.get(r.operation_id);
    if (!op) continue;

    switch (r.verdict) {
      case "applied":
      case "duplicate":
        await markDone(r.operation_id);
        resultat.applied += 1;
        for (const t of TABLES_TOUCHEES[op.kind] ?? []) tables.add(t);
        break;
      case "rejected":
        await markQuarantined(
          r.operation_id, r.errors?.code ?? "rejected", messageOf(r)
        );
        resultat.quarantined += 1;
        break;
      case "blocked":
        await markBlocked(r.operation_id, messageOf(r));
        resultat.blocked += 1;
        break;
      default:
        await scheduleRetry(r.operation_id, op.attempts, messageOf(r));
        resultat.retry += 1;
    }
  }

  if (tables.size) await refreshTables(tables);

  resultat.more = (await readyToSend(1)).length > 0;
  return resultat;
}

/** Relit les tables que le lot a touchées. Le serveur fait autorité. */
async function refreshTables(noms: Set<string>): Promise<void> {
  let manifest;
  try {
    manifest = await fetchManifest();
  } catch {
    // Le relire échouera aussi au prochain cycle ; les données locales restent
    // celles d'avant, ce qui est faux mais pas incohérent.
    return;
  }
  const specs = new Map<string, TableSpec>(manifest.tables.map((t) => [t.name, t]));
  for (const nom of noms) {
    const spec = specs.get(nom);
    if (!spec) continue;
    try {
      await pullTable(spec);
    } catch {
      // Une table qu'on n'a pas pu relire sera relue au cycle suivant.
    }
  }
}

/**
 * Vide la file, lot après lot.
 *
 * Au démarrage, remet d'abord en attente ce qui était resté « en vol » : une
 * application tuée pendant un envoi laisserait sinon ses opérations bloquées
 * pour toujours.
 */
export async function pushAll(deviceId?: string): Promise<PushOutcome> {
  await recoverInflight();

  const cumul = { ...VIDE };
  for (let tour = 0; tour < 50; tour++) {
    const r = await pushOnce(deviceId);
    cumul.sent += r.sent;
    cumul.applied += r.applied;
    cumul.quarantined += r.quarantined;
    cumul.retry += r.retry;
    cumul.blocked += r.blocked;
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ `more` N'ÉTAIT JAMAIS RÉAFFECTÉ, DONC TOUJOURS FAUX.                 │
    // │                                                                      │
    // │ Le cumul partait de `VIDE` et n'en reprenait que les compteurs :     │
    // │ `pushAll` annonçait « la file est vide » y compris quand elle        │
    // │ sortait sur sa borne de cinquante tours, c'est-à-dire précisément    │
    // │ quand il RESTE du travail prêt à partir. Un appelant qui s'y fierait │
    // │ pour décider d'un second cycle ne le déclencherait jamais, et la     │
    // │ file au-delà de cinquante lots attendrait la synchronisation         │
    // │ suivante sans que rien ne le dise.                                   │
    // └──────────────────────────────────────────────────────────────────────┘
    cumul.more = r.more;
    if (!r.more || r.sent === 0) break;
  }
  return cumul;
}
