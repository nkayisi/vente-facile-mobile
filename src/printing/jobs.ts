/**
 * Les documents imprimables et leur réimpression.
 *
 * L'IMPRESSION NE SE REJOUE PAS TOUTE SEULE. Un ticket qui n'est pas sorti
 * parce que le rouleau était vide se redemande d'un geste ; un automate qui le
 * sortirait dix minutes plus tard le ferait alors que le client est parti, et
 * remettrait en circulation un papier que personne n'attend. C'est la
 * différence avec le journal d'opérations, qui, lui, doit rejouer.
 *
 * Le DUPLICATA n'est pas une seconde impression anonyme : au-delà de la
 * première, le document sort marqué, et son numéro ne change pas. C'est ce que
 * la numérotation par appareil garantit depuis le lot 4, et ce que l'ancienne
 * application cassait en fabriquant un numéro à chaque rendu.
 */
import * as Crypto from "expo-crypto";
import { and, desc, eq } from "drizzle-orm";

import {
  buildCashSessionReceipt,
  buildDayReport,
  buildExpenseReceipt,
  buildExpenseRequest,
  buildPaymentReceipt,
  buildSaleReceipt,
  type Block,
  type CashSessionReceiptData,
  type DayReportData,
  type ExpenseReceiptData,
  type ExpenseRequestData,
  type PaymentReceiptData,
  type SaleReceiptData,
} from "@vente-facile/core/receipt";

import { db } from "@/db/client";
import { printJobs } from "@/db/schema";

import { imprimer } from "./index";

/** Les quatre documents que le comptoir sait produire. */
export type GenreDocument = "sale" | "payment" | "cash_session" | "expense";

export interface DocumentImprimable {
  id: string;
  kind: GenreDocument;
  documentNumber: string;
  label: string;
  createdAt: Date;
  printedAt: Date | null;
  printCount: number;
  transport: string | null;
}

/**
 * Le reçu de dépense rangé AU PAIEMENT.
 *
 * ⚠ LE MARQUEUR EST NÉCESSAIRE. Jusqu'au 2026-11-20, le reçu sortait à la
 * CRÉATION de la dépense, et ces lignes sont encore dans `print_jobs` des
 * terminaux en service, sous le même numéro et le même genre. Les réimprimer
 * pour une dépense payée remettrait la pièce d'une sortie qui n'avait pas eu
 * lieu, sans payeur ni heure de paiement.
 */
export type RecuDeDepensePayee = ExpenseReceiptData & { auPaiement: true };

type DonneesDocument =
  | SaleReceiptData
  | PaymentReceiptData
  | CashSessionReceiptData
  | ExpenseReceiptData
  | RecuDeDepensePayee;

/**
 * Reconstruit les blocs depuis les données rangées.
 *
 * `duplicata` n'est pas un drapeau d'affichage : il change le document, qui
 * sort avec sa pastille. Une réimpression qui ressemblerait à l'original
 * laisserait deux papiers indiscernables pour un seul paiement.
 */
function construire(
  kind: GenreDocument,
  donnees: DonneesDocument,
  duplicata: boolean
): Block[] {
  const data = { ...donnees, isDuplicate: duplicata } as DonneesDocument;
  switch (kind) {
    case "sale":
      return buildSaleReceipt(data as SaleReceiptData);
    case "payment":
      return buildPaymentReceipt(data as PaymentReceiptData);
    case "cash_session":
      return buildCashSessionReceipt(data as CashSessionReceiptData);
    case "expense":
      return buildExpenseReceipt(data as ExpenseReceiptData);
  }
}

/**
 * Version des données rangées.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VERSION 1 PORTE SES MONTANTS EN DEVISE PRINCIPALE.                   │
 * │                                                                          │
 * │ Le ticket de vente rangeait les totaux du panier en devise PRINCIPALE    │
 * │ sous l'étiquette de la devise de FACTURE. La version 2 range les vrais   │
 * │ montants de facture. Les deux se distinguent par ce champ, et par lui    │
 * │ seul : rien dans les données elles-mêmes ne dit dans quelle devise elles │
 * │ sont, puisque `currency` annonçait déjà la facture dans les deux cas.    │
 * │                                                                          │
 * │ TOUTE LECTURE QUI CONVERTIT DOIT LE CONSULTER. Un document rangé avant   │
 * │ la mise à jour et pas encore poussé - c'est-à-dire précisément ceux que  │
 * │ le tableau de bord et le hub des ventes lisent - serait sinon converti   │
 * │ une seconde fois, et sur un établissement multi-devise le chiffre        │
 * │ d'affaires du jour partirait d'un facteur deux mille huit cents.         │
 * │                                                                          │
 * │ L'absence du champ vaut 1 : les lignes déjà en base n'en portent aucun.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const VERSION_DONNEES = 2;

/** Range un document, sans l'imprimer. Rend son identifiant local. */
export async function enregistrerDocument(options: {
  kind: GenreDocument;
  documentNumber: string;
  label: string;
  donnees: DonneesDocument;
  /**
   * Le document est DÉJÀ sorti ailleurs, et sa réimpression ici est donc un
   * duplicata dès la première fois.
   *
   * Le cas est réel et fréquent : une vente encaissée sur un autre terminal ou
   * au back-office descend par le tirage, et son ticket peut être redemandé
   * depuis n'importe quel appareil. Sans ce drapeau, le second papier sortirait
   * indiscernable du premier, et deux tickets identiques circuleraient pour une
   * seule vente.
   */
  dejaImprime?: boolean;
}): Promise<string> {
  const id = Crypto.randomUUID();
  await db.insert(printJobs).values({
    id,
    kind: options.kind,
    documentNumber: options.documentNumber,
    label: options.label,
    data: JSON.stringify({ ...options.donnees, schemaVersion: VERSION_DONNEES }),
    printCount: options.dejaImprime ? 1 : 0,
    createdAt: new Date(),
  });
  return id;
}

function enDocument(l: typeof printJobs.$inferSelect): DocumentImprimable {
  return {
    id: l.id,
    kind: l.kind as GenreDocument,
    documentNumber: l.documentNumber,
    label: l.label,
    createdAt: l.createdAt,
    printedAt: l.printedAt,
    printCount: l.printCount,
    transport: l.transport,
  };
}

/**
 * Le document de ce GENRE déjà rangé sous ce numéro, le plus récent.
 *
 * Un numéro de document est définitif : le retrouver évite de ranger une
 * seconde copie du même ticket, dont le compteur de duplicata repartirait de
 * zéro. ⚠ Le genre fait partie de la clé : la demande et le reçu d'une même
 * dépense portent le même numéro.
 */
export async function documentParNumero(
  documentNumber: string,
  kind: GenreDocument
): Promise<DocumentImprimable | null> {
  const [l] = await db
    .select()
    .from(printJobs)
    .where(and(eq(printJobs.documentNumber, documentNumber), eq(printJobs.kind, kind)))
    .orderBy(desc(printJobs.createdAt))
    .limit(1);
  return l ? enDocument(l) : null;
}

/**
 * Le reçu rangé au PAIEMENT de cette dépense, s'il existe.
 *
 * Un reçu rangé à la création (version antérieure) est ignoré : voir
 * `RecuDeDepensePayee`.
 */
export async function recuDeDepenseRange(reference: string): Promise<DocumentImprimable | null> {
  const lignes = await db
    .select()
    .from(printJobs)
    .where(and(eq(printJobs.documentNumber, reference), eq(printJobs.kind, "expense")))
    .orderBy(desc(printJobs.createdAt));
  const l = lignes.find((x) => {
    try {
      return (JSON.parse(x.data) as { auPaiement?: unknown }).auPaiement === true;
    } catch {
      return false;
    }
  });
  return l ? enDocument(l) : null;
}

/**
 * Imprime un document rangé, et note qu'il est sorti.
 *
 * Le compteur n'avance QUE si l'impression a réussi : l'incrémenter d'avance
 * ferait sortir le premier vrai ticket marqué DUPLICATA après un rouleau vide.
 */
export async function imprimerDocument(id: string): Promise<string> {
  const [ligne] = await db.select().from(printJobs).where(eq(printJobs.id, id)).limit(1);
  if (!ligne) throw new Error("Document introuvable.");

  const donnees = JSON.parse(ligne.data) as DonneesDocument;
  const blocs = construire(ligne.kind as GenreDocument, donnees, ligne.printCount > 0);

  const transport = await imprimer(blocs, { nom: ligne.documentNumber });

  await db
    .update(printJobs)
    .set({
      printedAt: new Date(),
      printCount: ligne.printCount + 1,
      transport,
    })
    .where(eq(printJobs.id, id));

  return transport;
}

/** Range puis imprime, le cas courant à l'encaissement. */
export async function enregistrerEtImprimer(options: {
  kind: GenreDocument;
  documentNumber: string;
  label: string;
  donnees: DonneesDocument;
  dejaImprime?: boolean;
}): Promise<{ id: string; transport: string }> {
  const id = await enregistrerDocument(options);
  const transport = await imprimerDocument(id);
  return { id, transport };
}

/** Les derniers documents, le plus récent d'abord. */
/**
 * Combien de documents ce terminal garde pour la réimpression.
 *
 * Sert à la déconnexion : `print_jobs` est purement locale, et vider la base
 * emporte donc la seule trace qui permette de ressortir un ticket. Le marchand
 * doit le savoir AVANT de confirmer, pas le découvrir quand un client revient.
 */
export async function compterDocuments(): Promise<number> {
  const lignes = await db.select({ id: printJobs.id }).from(printJobs);
  return lignes.length;
}

export async function derniersDocuments(limite = 50): Promise<DocumentImprimable[]> {
  const lignes = await db
    .select({
      id: printJobs.id,
      kind: printJobs.kind,
      documentNumber: printJobs.documentNumber,
      label: printJobs.label,
      createdAt: printJobs.createdAt,
      printedAt: printJobs.printedAt,
      printCount: printJobs.printCount,
      transport: printJobs.transport,
    })
    .from(printJobs)
    .orderBy(desc(printJobs.createdAt))
    .limit(limite);

  return lignes.map((l) => ({ ...l, kind: l.kind as GenreDocument }));
}

/**
 * Imprime une facture proforma, SANS la ranger.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SEUL DOCUMENT QUI S'IMPRIME SANS ENTRER DANS `print_jobs`.           │
 * │                                                                          │
 * │ Cette table porte des documents à numéro définitif et à valeur probante :│
 * │ `documentParNumero` traite le numéro comme unique et durable,            │
 * │ `derniersDocuments` en fait la liste que le marchand consulte, et        │
 * │ `detteEnAttente` y lit des montants pour reconstituer le crédit d'un     │
 * │ client. Une proforma n'est rien de tout cela - elle ne prouve aucun      │
 * │ paiement et n'engage aucun stock - et l'y ranger la ferait entrer dans   │
 * │ trois lectures qui ne la concernent pas.                                 │
 * │                                                                          │
 * │ Elle se réimprime donc en se RÉGÉNÉRANT, et c'est pour cela que le       │
 * │ panier reste en place après l'impression : sa source est encore à        │
 * │ l'écran. Le back-office n'en garde rien non plus.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function imprimerProforma(donnees: SaleReceiptData): Promise<void> {
  await imprimer(buildSaleReceipt(donnees), { nom: donnees.number });
}

/**
 * Imprime la DEMANDE d'une dépense, sans la ranger.
 *
 * Même doctrine que la proforma : elle ne prouve aucune sortie d'argent, et la
 * ranger la ferait entrer dans la liste des documents à valeur probante. Elle
 * se réimprime en se régénérant depuis la fiche de la dépense.
 */
export async function imprimerDemandeDeDepense(donnees: ExpenseRequestData): Promise<void> {
  // Le reçu porte le MÊME numéro : sous le même nom de fichier, la demande et
  // le reçu arrivaient indiscernables chez le destinataire, et le second
  // écrasait le premier dans le cache. Le back-office les distingue aussi.
  await imprimer(buildExpenseRequest(donnees), { nom: `Demande ${donnees.number}` });
}

/**
 * Imprime le rapport de la journée, sans le ranger.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE N'EST PAS UN Z, ET IL NE PREND PAS DE NUMÉRO.                        │
 * │                                                                          │
 * │ Le Z clôt une caisse et vaut pièce comptable ; ce ticket dit ce que la   │
 * │ journée a produit à l'instant où on l'imprime, et il sera faux une vente │
 * │ plus tard. Le ranger dans `print_jobs` le ferait entrer parmi les        │
 * │ documents à valeur probante, et sa réimpression ressortirait des         │
 * │ chiffres périmés sous la pastille DUPLICATA. Il se régénère, comme la    │
 * │ proforma - et il s'imprime HORS LIGNE, ses chiffres étant calculés sur   │
 * │ le terminal.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function imprimerRapportDeLaJournee(donnees: DayReportData): Promise<void> {
  await imprimer(buildDayReport(donnees), { nom: `Rapport de la journée ${donnees.day}` });
}
