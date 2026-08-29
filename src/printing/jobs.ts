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
import { desc, eq } from "drizzle-orm";

import {
  buildCashSessionReceipt,
  buildExpenseReceipt,
  buildPaymentReceipt,
  buildSaleReceipt,
  type Block,
  type CashSessionReceiptData,
  type ExpenseReceiptData,
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

type DonneesDocument =
  | SaleReceiptData
  | PaymentReceiptData
  | CashSessionReceiptData
  | ExpenseReceiptData;

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

/** Range un document, sans l'imprimer. Rend son identifiant local. */
export async function enregistrerDocument(options: {
  kind: GenreDocument;
  documentNumber: string;
  label: string;
  donnees: DonneesDocument;
}): Promise<string> {
  const id = Crypto.randomUUID();
  await db.insert(printJobs).values({
    id,
    kind: options.kind,
    documentNumber: options.documentNumber,
    label: options.label,
    data: JSON.stringify(options.donnees),
    createdAt: new Date(),
  });
  return id;
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
}): Promise<{ id: string; transport: string }> {
  const id = await enregistrerDocument(options);
  const transport = await imprimerDocument(id);
  return { id, transport };
}

/** Les derniers documents, le plus récent d'abord. */
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
