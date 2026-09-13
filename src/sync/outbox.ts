/**
 * Journal des opérations en attente d'envoi.
 *
 * Le client n'envoie pas des lignes de table mais des ACTES métier, rejoués
 * côté serveur par le chemin du back-office. Ce fichier est la file d'attente
 * de ces actes.
 *
 * Ce qu'il ne refait pas, et pourquoi. L'ancienne file relisait sa table
 * ENTIÈRE à chaque écriture locale pour dédupliquer : avec quelques milliers de
 * ventes en attente, chaque encaissement ralentissait. Ici on interroge par
 * index, et rien ne balaie la table.
 */
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { outboxOperations, type NewOutboxOperation, type OutboxOperation } from "@/db/schema";

import { backoffMs } from "./policy";

export type OperationKind =
  | "sale.create"
  | "sale.add_payment"
  | "sale.cancel"
  | "register_session.open"
  | "customer.create"
  | "customer.record_payment"
  // « Avance » n'a PAS d'acte propre : le serveur en a fait un alias de
  // `record_payment`, parce qu'inscrire une avance sans toucher aux factures
  // d'un client endetté faisait diverger son solde de la somme de ses
  // `amount_due`. Un seul acte, donc, et le préfixe du reçu (`RGL` ou `AVC`)
  // dit après coup ce qu'il a été.
  | "customer.adjust_balance"
  | "stock.unpack"
  // Les TRANSITIONS d'un transfert ou d'un ajustement sont des actes à part
  // entière : elles bougent du stock. Un refus y est déterministe (« déjà
  // expédié ») et ne se réessaie donc JAMAIS - il part en quarantaine.
  | "stock_transfer.create"
  | "stock_transfer.approve"
  | "stock_transfer.ship"
  | "stock_transfer.receive"
  | "stock_transfer.cancel"
  | "stock_adjustment.create"
  | "stock_adjustment.approve"
  | "stock_adjustment.reject"
  // COMPTER est le meilleur usage mobile du produit : on compte debout dans le
  // rayon, souvent au fond d'un dépôt sans réseau. Les cinq transitions d'une
  // session passent donc par le journal.
  | "inventory_session.create"
  | "inventory_session.start"
  | "inventory_session.count"
  | "inventory_session.submit"
  | "inventory_session.validate"
  | "inventory_session.cancel"
  | "product.create"
  | "category.create"
  | "brand.create"
  | "unit.create"
  // MODIFIER un référentiel est un acte : le back-office le fait par un PATCH
  // sur la vue, et le rejouer par le même serializer est ce qui garde
  // l'unicité du nom et l'anti-cycle du côté qui en décide. Un refus y est
  // DÉTERMINISTE (nom déjà pris, fiche introuvable) : quarantaine, jamais un
  // nouvel essai.
  | "category.update"
  | "brand.update"
  | "unit.update"
  // La CLÔTURE passe par le journal : le Z se tire au comptoir, souvent avant
  // que le réseau ne revienne.
  | "register_session.close"
  // Retours et devis : NI L'UN NI L'AUTRE n'avait d'écran, nulle part. Le
  // terminal crée la référence.
  | "sale_return.create"
  | "sale_return.approve"
  | "sale_return.reject"
  | "quotation.create"
  | "quotation.convert"
  | "stock_movement.create"
  | "expense.create"
  // Les CINQ transitions d'une dépense, et l'annulation d'un mouvement. Elles
  // vivaient dans les vues du back-office, donc hors d'atteinte du journal :
  // un terminal savait créer une dépense, jamais la faire avancer ni corriger
  // une écriture de caisse. Un refus y est DÉTERMINISTE (« déjà payée »,
  // « déjà annulé ») et part en quarantaine, jamais en nouvel essai : rejouer
  // une approbation créerait un SECOND mouvement, et le tiroir sortirait deux
  // fois la même dépense.
  | "expense.submit"
  | "expense.approve"
  | "expense.reject"
  | "expense.pay"
  | "expense.cancel"
  | "cash_movement.create"
  | "cash_movement.cancel"
  // Créer un type d'entrée ou une catégorie de dépense sans quitter la
  // saisie : le back-office le fait par un bouton « + » à côté de son champ,
  // et sans lui le caissier doit sortir de son formulaire, donc le perdre.
  | "income_category.create"
  | "expense_category.create"
  // Renommer, recolorer ou DÉSACTIVER une rubrique. La désactivation remplace
  // la suppression, qui n'existe pas : `ExpenseCategory` est
  // `PROTECT`-référencée, `IncomeCategory` orphelinerait l'historique en
  // silence, et surtout aucune des deux tables n'émet de pierre tombale au
  // tirage - une suppression serveur n'atteindrait donc jamais un terminal.
  | "income_category.update"
  | "expense_category.update";

export type OutboxState = OutboxOperation["state"];

/** Taille d'un envoi. Un lot trop gros sur un lien instable ne se termine jamais. */
export const BATCH_SIZE = 50;

async function nextSeq(): Promise<number> {
  const [row] = await db
    .select({ seq: outboxOperations.seq })
    .from(outboxOperations)
    .orderBy(desc(outboxOperations.seq))
    .limit(1);
  return (row?.seq ?? 0) + 1;
}

export interface EnqueueOptions {
  /** Clés locales créées par l'opération, pour la réconciliation. */
  localIds?: Record<string, string>;
  /** Opérations dont celle-ci dépend : un règlement suit sa vente. */
  dependsOn?: string[];
}

/**
 * Met un acte en file.
 *
 * `id` est fourni par l'appelant et devient la clé d'idempotence côté serveur :
 * c'est ce qui rend le renvoi sûr après une coupure survenue APRÈS que le
 * serveur ait validé, mais avant que la réponse n'arrive.
 */
export async function enqueue(
  id: string,
  kind: OperationKind,
  payload: unknown,
  options: EnqueueOptions = {}
): Promise<OutboxOperation> {
  const row: NewOutboxOperation = {
    id,
    kind,
    seq: await nextSeq(),
    payload: JSON.stringify(payload),
    dependsOn: JSON.stringify(options.dependsOn ?? []),
    localIds: JSON.stringify(options.localIds ?? {}),
    state: "pending",
    attempts: 0,
    occurredAt: new Date(),
  };
  await db.insert(outboxOperations).values(row).onConflictDoNothing();
  const [saved] = await db
    .select()
    .from(outboxOperations)
    .where(eq(outboxOperations.id, id));
  return saved!;
}

/** Opérations prêtes à partir : en attente, et dont la temporisation est passée. */
export async function readyToSend(limit = BATCH_SIZE): Promise<OutboxOperation[]> {
  const now = new Date();
  return db
    .select()
    .from(outboxOperations)
    .where(
      and(
        eq(outboxOperations.state, "pending"),
        or(
          isNull(outboxOperations.nextAttemptAt),
          lte(outboxOperations.nextAttemptAt, now)
        )
      )
    )
    .orderBy(asc(outboxOperations.seq))
    .limit(limit);
}

export async function countByState(): Promise<Record<OutboxState, number>> {
  const rows = await db
    .select({ state: outboxOperations.state, n: sql<number>`count(*)` })
    .from(outboxOperations)
    .groupBy(outboxOperations.state);

  const counts = {
    pending: 0, inflight: 0, done: 0, quarantined: 0, blocked: 0,
  } as Record<OutboxState, number>;
  for (const row of rows) counts[row.state] = Number(row.n);
  return counts;
}

/**
 * Ce que le planificateur de synchronisation a besoin de savoir du journal.
 *
 * Deux nombres, et il faut les deux. `nbPret` dit s'il y a quelque chose à
 * envoyer MAINTENANT ; `prochaineTentativeAt` dit quand se réveiller pour ce
 * qui attend encore sa temporisation.
 *
 * ⚠ Sans le second, une opération ayant reçu un verdict `retry` n'est JAMAIS
 * réessayée : `backoffMs` lui pose un `nextAttemptAt` que `readyToSend` filtre,
 * et rien dans le terminal ne venait relire cette échéance. Elle attendait
 * qu'un humain appuie sur « Synchroniser », indéfiniment.
 */
export interface EtatJournal {
  /** Opérations en attente dont la temporisation est échue. */
  nbPret: number;
  /** La plus proche échéance encore à venir, ou `null` s'il n'y en a aucune. */
  prochaineTentativeAt: Date | null;
}

export async function etatJournal(): Promise<EtatJournal> {
  const now = new Date();

  const [pret] = await db
    .select({ n: sql<number>`count(*)` })
    .from(outboxOperations)
    .where(
      and(
        eq(outboxOperations.state, "pending"),
        or(isNull(outboxOperations.nextAttemptAt), lte(outboxOperations.nextAttemptAt, now))
      )
    );

  const [suivante] = await db
    .select({ at: outboxOperations.nextAttemptAt })
    .from(outboxOperations)
    .where(and(eq(outboxOperations.state, "pending"), gt(outboxOperations.nextAttemptAt, now)))
    .orderBy(asc(outboxOperations.nextAttemptAt))
    .limit(1);

  return {
    nbPret: Number(pret?.n ?? 0),
    prochaineTentativeAt: suivante?.at ?? null,
  };
}

export async function markInflight(ids: string[], batchId: string): Promise<void> {
  if (!ids.length) return;
  await db
    .update(outboxOperations)
    .set({ state: "inflight", batchId })
    .where(inArray(outboxOperations.id, ids));
}

/**
 * Remet en attente ce qui est resté « en vol ».
 *
 * Appelée au démarrage. Une application tuée pendant un envoi laisserait sinon
 * ses opérations bloquées dans cet état pour toujours : c'est précisément le
 * défaut de l'ancienne file, dont les entrées `processing` n'étaient jamais
 * relues par personne.
 */
export async function recoverInflight(): Promise<number> {
  const bloquees = await db
    .select({ id: outboxOperations.id })
    .from(outboxOperations)
    .where(eq(outboxOperations.state, "inflight"));

  if (bloquees.length) {
    await db
      .update(outboxOperations)
      .set({ state: "pending", batchId: null })
      .where(eq(outboxOperations.state, "inflight"));
  }
  return bloquees.length;
}

export async function markDone(id: string): Promise<void> {
  await db
    .update(outboxOperations)
    .set({ state: "done", lastError: null, errorCode: null })
    .where(eq(outboxOperations.id, id));
}

/**
 * Met en quarantaine : refus métier définitif.
 *
 * L'opération n'est JAMAIS réessayée. Elle attend une décision humaine sur
 * l'écran « Opérations à corriger », avec son motif en clair.
 */
export async function markQuarantined(
  id: string,
  code: string,
  message: string
): Promise<void> {
  await db
    .update(outboxOperations)
    .set({ state: "quarantined", errorCode: code, lastError: message })
    .where(eq(outboxOperations.id, id));
}

export async function markBlocked(id: string, message: string): Promise<void> {
  await db
    .update(outboxOperations)
    .set({ state: "blocked", errorCode: "blocked", lastError: message })
    .where(eq(outboxOperations.id, id));
}

/** Programme un nouvel essai. Le compteur ne monte que pour CETTE opération. */
export async function scheduleRetry(
  id: string,
  attempts: number,
  message: string | null
): Promise<void> {
  await db
    .update(outboxOperations)
    .set({
      state: "pending",
      attempts: attempts + 1,
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts + 1)),
      lastError: message,
    })
    .where(eq(outboxOperations.id, id));
}

/** Débloque ce qui attendait une porte fermée : abonnement renouvelé, droits rendus. */
export async function unblockAll(): Promise<void> {
  await db
    .update(outboxOperations)
    .set({ state: "pending", nextAttemptAt: null })
    .where(eq(outboxOperations.state, "blocked"));
}

export async function quarantined(): Promise<OutboxOperation[]> {
  return db
    .select()
    .from(outboxOperations)
    .where(eq(outboxOperations.state, "quarantined"))
    .orderBy(asc(outboxOperations.seq));
}

/**
 * Les opérations que le serveur a BLOQUÉES, faute de droit ou d'abonnement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE OPÉRATION BLOQUÉE N'EST PAS PERDUE, MAIS ELLE ÉTAIT INVISIBLE.      │
 * │                                                                          │
 * │ « Opérations à corriger » ne lisait que la quarantaine. Une opération    │
 * │ bloquée restait donc dans le journal sans que rien ne la montre : le     │
 * │ marchand voyait un compteur d'attente qui ne descendait jamais, sans     │
 * │ savoir pourquoi ni quoi faire.                                           │
 * │                                                                          │
 * │ Elle se distingue d'une quarantaine : celle-ci est définitive, celle-là  │
 * │ repart d'elle-même dès que le droit est accordé ou l'abonnement réglé.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function bloquees(): Promise<OutboxOperation[]> {
  return db
    .select()
    .from(outboxOperations)
    .where(eq(outboxOperations.state, "blocked"))
    .orderBy(asc(outboxOperations.seq));
}

/** Abandonne une opération mise en quarantaine, sur décision de l'utilisateur. */
export async function discard(id: string): Promise<void> {
  await db.delete(outboxOperations).where(eq(outboxOperations.id, id));
}

/** Purge les opérations abouties. Les refus, eux, ne se purgent jamais. */
export async function purgeDone(): Promise<void> {
  await db.delete(outboxOperations).where(eq(outboxOperations.state, "done"));
}

/**
 * Où en est un acte, du point de vue de l'ÉCRAN qui le montre.
 *
 * Trois états, et pas deux : « bloqué » n'est pas « en attente ». Une opération
 * en attente part à la prochaine synchronisation ; une opération bloquée
 * attend une DÉCISION - un abonnement à régler, un droit à accorder - et n'en
 * partira pas d'elle-même. Les confondre laisse le marchand attendre un réseau
 * qui est déjà là, parfois des jours, en regardant un compteur qui ne descend
 * jamais.
 */
export type EtatEnvoi =
  /** Le serveur l'a acceptée : la ligne authentique fait foi. */
  | "envoye"
  /** Elle part à la prochaine synchronisation. */
  | "en_attente"
  /** Elle attend une décision : abonnement expiré, droit manquant. */
  | "bloque";

/** Ce qu'une lecture d'écran reçoit pour une opération non encore aboutie. */
export interface OperationEnAttente<T = unknown> {
  id: string;
  payload: T;
  occurredAt: Date;
  envoi: EtatEnvoi;
}

/** Traduit l'état du journal en état d'écran. Un seul endroit le décide. */
export function etatEnvoi(state: OutboxState | string): EtatEnvoi {
  return state === "blocked" ? "bloque" : "en_attente";
}

/**
 * Opérations d'un type donné qui n'ont pas encore abouti.
 *
 * RÈGLE DU DÉPÔT : les tables tirées ne sont écrites que par le TIRAGE. Ce qui
 * n'est pas encore confirmé par le serveur vit ici, et nulle part ailleurs.
 *
 * La tentation inverse est forte : écrire tout de suite la vente ou la session
 * dans sa table, pour que l'écran l'affiche sans attendre. Mais le tirage
 * n'efface jamais rien, il insère et met à jour. Une opération REFUSÉE
 * laisserait donc sa ligne optimiste en place pour toujours : une session de
 * caisse ouverte qui n'existe sur aucun serveur, et sur laquelle le terminal
 * continuerait à vendre. En lisant le journal, l'oubli est automatique, puisque
 * la mise en quarantaine sort l'opération de cette liste.
 *
 * `done` est exclu : l'opération a abouti, sa ligne authentique est arrivée par
 * le tirage et c'est elle qui fait foi. `quarantined` aussi : le serveur l'a
 * refusée, rien n'en est advenu, elle ne doit rien afficher comme acquis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `blocked` N'EST PAS `quarantined`, ET LES CONFONDRE FAIT VENDRE DEUX     │
 * │ FOIS LE MÊME ARTICLE.                                                    │
 * │                                                                          │
 * │ Une opération bloquée n'est pas refusée : elle est CONSERVÉE, et elle    │
 * │ repart telle quelle dès que le droit est accordé ou l'abonnement réglé   │
 * │ (`unblockAll`). Une vente bloquée par un abonnement expiré sera donc     │
 * │ appliquée, et le stock qu'elle a sorti est déjà parti avec le client.    │
 * │                                                                          │
 * │ La lire comme inexistante rouvrait exactement le défaut que la réserve   │
 * │ locale referme : pendant toute la durée du blocage - des jours, le temps │
 * │ qu'un marchand règle son abonnement - le comptoir reproposait le dernier │
 * │ article à chaque nouveau client. `avecBloquees` demande donc la lecture  │
 * │ CONSERVATRICE, celle qui ne peut que resserrer : réserve de stock, dette │
 * │ en file, et le hub des ventes, où le caissier doit retrouver ce qu'il a  │
 * │ vendu et imprimé.                                                        │
 * │                                                                          │
 * │ La lecture PAR DÉFAUT reste la bonne partout ailleurs : un écran qui     │
 * │ présenterait une opération bloquée comme ACQUISE - une session de        │
 * │ caisse ouverte, un transfert expédié - affirmerait un état que le        │
 * │ serveur n'a pas accordé, et sur lequel le comptoir continuerait de       │
 * │ travailler.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function enAttenteParType<T = unknown>(
  kind: string,
  options: { avecBloquees?: boolean } = {}
): Promise<OperationEnAttente<T>[]> {
  const etats: OutboxState[] = options.avecBloquees
    ? ["pending", "inflight", "blocked"]
    : ["pending", "inflight"];

  const lignes = await db
    .select({
      id: outboxOperations.id,
      payload: outboxOperations.payload,
      occurredAt: outboxOperations.occurredAt,
      state: outboxOperations.state,
    })
    .from(outboxOperations)
    .where(
      and(eq(outboxOperations.kind, kind), inArray(outboxOperations.state, etats))
    )
    .orderBy(asc(outboxOperations.seq));

  return lignes.map((l) => ({
    id: l.id,
    payload: JSON.parse(l.payload) as T,
    occurredAt: l.occurredAt,
    envoi: etatEnvoi(l.state),
  }));
}
