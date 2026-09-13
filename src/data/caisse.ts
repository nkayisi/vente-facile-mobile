/**
 * Lectures du livre de caisse. Miroir de `frontend/actions/cashbook.actions.ts`.
 *
 * **Tout est ventilé par devise, sans exception.** Le back-office l'a appris à
 * ses dépens : un solde de caisse est une somme d'espèces physiques, et le
 * tiroir contient des billets de plusieurs devises qui ne s'additionnent pas.
 * Les mouvements sont d'ailleurs déjà enregistrés dans la devise physique.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES CUMULS DESCENDENT EN SQL, ET CE N'EST PAS DU CONFORT.               │
 * │                                                                          │
 * │ `relevesCaisse` chargeait TOUTE la table `cash_movements` en mémoire et  │
 * │ sommait en JavaScript. C'est le défaut exact que `_get_stock_stats` a dû │
 * │ corriger côté serveur, sur un écran bien moins souvent ouvert : le livre │
 * │ de caisse est un onglet, et un terminal en service accumule un mouvement │
 * │ par vente. `sum() ... group by` rend quatre lignes au lieu de dix mille. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CADRAN NE SUIT PAS LES FILTRES, ET C'EST DÉLIBÉRÉ.                   │
 * │                                                                          │
 * │ Il diffère en cela du journal des mouvements de stock, où la question    │
 * │ posée est « combien pèse ce que je regarde ». Ici le solde du tiroir est │
 * │ une RÉFÉRENCE à laquelle on compare ce qu'on compte : le faire suivre    │
 * │ une puce ferait perdre le chiffre auquel on compare. C'est le même       │
 * │ arbitrage que sur les créances, et c'est celui du back-office, dont les  │
 * │ quatre cartes viennent de `/cash-movements/balance/` sans aucun filtre.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { and, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { bornesLocales } from "./periode-filtre";
import { deviseOuPrincipale } from "./devise-principale";
import {
  depensesEnFile,
  mouvementsEnFile,
  type DepenseEnFile,
  type MouvementEnFile,
} from "@/features/caisse/attente";
import { lotEnAttente, type LotEnAttente } from "@/features/sync/attente";
import type { FiltresCaisse, FiltresDepense } from "@/features/caisse/filtres";
import { type EtatEnvoi } from "@/sync";
import { categoriesEnAttente } from "@/features/caisse/actes";
import {
  fusionnerCategories,
  type CategorieFusionnee,
  type GenreCategorie,
} from "@/features/caisse/categorie";
import {
  cashMovements,
  expenseCategories,
  expenses,
  incomeCategories,
  paymentMethods,
  payments,
  registerSessions,
  registers,
  sales,
  users,
  warehouses,
} from "@/db/schema";

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function bornesDuJour(): { debut: Date; fin: Date } {
  const d = new Date();
  const debut = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { debut, fin };
}

export type ParDevise = { devise: string; montant: number }[];

/** Un cumul par devise, que l'on nourrit ligne à ligne. */
type Cumul = Map<string, number>;

const ajouter = (m: Cumul, devise: string, montant: number): void => {
  const d = deviseOuPrincipale(devise);
  m.set(d, (m.get(d) ?? 0) + montant);
};

/**
 * Les lignes non nulles, par ordre de devise.
 *
 * Un cumul qui retombe à zéro est RETIRÉ : « 0 $ » à côté de « 12 500 FC »
 * affirmerait qu'aucun dollar n'est passé aujourd'hui, alors qu'il y en a
 * peut-être eu autant en entrée qu'en sortie. Une liste vide se rend « 0 »
 * dans la devise de l'établissement, ce que `MultiCurrencyTotal` fait seul.
 */
const trier = (m: Cumul): ParDevise =>
  [...m.entries()]
    .map(([devise, montant]) => ({ devise, montant }))
    .filter((x) => x.montant !== 0)
    .sort((a, b) => a.devise.localeCompare(b.devise));

export interface RelevesCaisse {
  solde: ParDevise;
  entreesDuJour: ParDevise;
  sortiesDuJour: ParDevise;
  netDuJour: ParDevise;
  /** Ce que le journal porte encore, et dans quel état il partira. */
  enFile: LotEnAttente;
}

/**
 * Les quatre relevés du tiroir, journal compris.
 *
 * Deux requêtes groupées et une lecture du journal, quel que soit le nombre de
 * mouvements. Les mouvements ANNULÉS sont exclus des deux : un mouvement
 * annulé n'a pas bougé le tiroir, et le compter donnerait un solde qui ne
 * correspond à aucune liasse.
 */
export async function relevesCaisse(): Promise<RelevesCaisse> {
  const { debut, fin } = bornesDuJour();
  const vivant = eq(cashMovements.isCancelled, false);
  const montant = sql<number>`sum(cast(${cashMovements.amount} as real))`;

  const [cumuls, duJour, enFile] = await Promise.all([
    db
      .select({
        devise: cashMovements.currency,
        direction: cashMovements.direction,
        montant,
      })
      .from(cashMovements)
      .where(vivant)
      .groupBy(cashMovements.currency, cashMovements.direction),
    db
      .select({
        devise: cashMovements.currency,
        direction: cashMovements.direction,
        montant,
      })
      .from(cashMovements)
      .where(
        and(
          vivant,
          gte(cashMovements.movementDate, debut),
          sql`${cashMovements.movementDate} < ${fin.getTime()}`
        )
      )
      .groupBy(cashMovements.currency, cashMovements.direction),
    mouvementsEnFile(),
  ]);

  const solde: Cumul = new Map();
  const entrees: Cumul = new Map();
  const sorties: Cumul = new Map();

  for (const l of cumuls) {
    ajouter(solde, l.devise, (l.direction === "in" ? 1 : -1) * nb(l.montant));
  }
  for (const l of duJour) {
    ajouter(l.direction === "in" ? entrees : sorties, l.devise, nb(l.montant));
  }

  // Le journal, ensuite : les billets sont déjà dans le tiroir.
  for (const m of enFile) {
    ajouter(solde, m.devise, (m.direction === "in" ? 1 : -1) * m.montant);
    if (m.date && m.date >= debut && m.date < fin) {
      ajouter(m.direction === "in" ? entrees : sorties, m.devise, m.montant);
    }
  }

  const net: Cumul = new Map();
  for (const d of new Set([...entrees.keys(), ...sorties.keys()])) {
    net.set(d, (entrees.get(d) ?? 0) - (sorties.get(d) ?? 0));
  }

  return {
    solde: trier(solde),
    entreesDuJour: trier(entrees),
    sortiesDuJour: trier(sorties),
    netDuJour: trier(net),
    enFile: lotEnAttente(enFile),
  };
}

export interface MouvementCaisse {
  id: string;
  reference: string | null;
  direction: string;
  type: string;
  description: string | null;
  montant: number;
  devise: string;
  date: Date | null;
  annule: boolean;
  /**
   * Le solde du tiroir APRÈS ce mouvement, dans sa devise. Colonne du
   * back-office, et le seul chiffre qui permette de rapprocher une ligne d'un
   * comptage. `null` sur une ligne encore en file : le serveur ne l'a pas
   * calculé, et l'inventer ferait un solde qui n'a jamais existé.
   */
  soldeApres: number | null;
  auteur: string | null;
  notes: string;
  motifAnnulation: string;
  /**
   * La pièce qui a produit ce mouvement, quand il en vient une.
   *
   * Le back-office les écrit entre parenthèses derrière la description : c'est
   * ce qui permet de rattacher une entrée de tiroir à sa vente, et c'est la
   * première chose qu'on cherche en rapprochant un comptage.
   */
  refVente: string | null;
  refDepense: string | null;
  /** `undefined` : la ligne est descendue du serveur. */
  envoi?: EtatEnvoi;
}

export interface JournalCaisse {
  elements: MouvementCaisse[];
  /** Le nombre TOTAL du périmètre, journal compris - jamais la fenêtre. */
  nombre: number;
  tronque: boolean;
  enFile: LotEnAttente;
}

/**
 * Le SQL du périmètre, partagé par la liste et son compte.
 *
 * ⚠ Les mouvements ANNULÉS sont exclus, comme le back-office qui envoie
 * `is_cancelled=false` sur sa liste. Ils restent visibles dans un rapport de
 * caisse, où l'on vient justement chercher ce qui a été rectifié.
 */
function conditionsCaisse(f: FiltresCaisse) {
  const terme = f.recherche.trim().toLowerCase();
  const motif = `%${terme}%`;
  const { debutMs, finMs } = bornesLocales(f.periode);

  const conditions = [
    eq(cashMovements.isCancelled, false),
    f.sens ? eq(cashMovements.direction, f.sens) : undefined,
    f.type ? eq(cashMovements.movementType, f.type) : undefined,
    f.devise ? eq(cashMovements.currency, f.devise) : undefined,
    debutMs != null ? gte(cashMovements.movementDate, new Date(debutMs)) : undefined,
    finMs != null ? lte(cashMovements.movementDate, new Date(finMs)) : undefined,
    terme
      ? or(
          // Les trois colonnes de `search_fields` du serveur, ni plus ni
          // moins : chercher ailleurs ferait une liste plus large que le
          // document qu'elle déclenche.
          like(sql`lower(coalesce(${cashMovements.reference}, ''))`, motif),
          like(sql`lower(coalesce(${cashMovements.description}, ''))`, motif),
          like(sql`lower(coalesce(${cashMovements.notes}, ''))`, motif)
        )
      : undefined,
  ].filter(Boolean);
  return and(...conditions);
}

/** Le même périmètre, opposé à une ligne encore dans le journal. */
function retientEnFile(f: FiltresCaisse, m: MouvementEnFile): boolean {
  if (f.sens && m.direction !== f.sens) return false;
  if (f.type && m.type !== f.type) return false;
  if (f.devise && deviseOuPrincipale(m.devise) !== f.devise) return false;
  const { debutMs, finMs } = bornesLocales(f.periode);
  const t = m.date?.getTime();
  if (debutMs != null && (t == null || t < debutMs)) return false;
  if (finMs != null && (t == null || t > finMs)) return false;
  const terme = f.recherche.trim().toLowerCase();
  // Une ligne en file n'a NI référence NI notes : son numéro est attribué par
  // le serveur. Chercher dans la description est tout ce qu'on peut faire, et
  // le dire vaut mieux que de la faire disparaître sans raison lisible.
  if (terme && !m.description.toLowerCase().includes(terme)) return false;
  return true;
}

export async function journalCaisse(
  f: FiltresCaisse,
  limite = 100
): Promise<JournalCaisse> {
  const ou = conditionsCaisse(f);
  const [lignes, compte, enFile] = await Promise.all([
    db
      .select({
        m: cashMovements,
        prenom: users.firstName,
        nom: users.lastName,
        refVente: sales.reference,
        refDepense: expenses.reference,
      })
      .from(cashMovements)
      .leftJoin(users, eq(users.id, cashMovements.createdById))
      .leftJoin(sales, eq(sales.id, cashMovements.saleId))
      .leftJoin(expenses, eq(expenses.id, cashMovements.expenseId))
      .where(ou)
      .orderBy(desc(cashMovements.movementDate))
      .limit(limite),
    db
      .select({ n: sql<number>`count(*)` })
      .from(cashMovements)
      .where(ou),
    mouvementsEnFile(),
  ]);

  const retenus = enFile.filter((m) => retientEnFile(f, m));
  const nombreTable = nb(compte[0]?.n);

  const tirees: MouvementCaisse[] = lignes.map(({ m, prenom, nom, refVente, refDepense }) => ({
    id: m.id,
    reference: m.reference ?? null,
    direction: m.direction,
    type: m.movementType,
    description: m.description ?? null,
    montant: nb(m.amount),
    devise: deviseOuPrincipale(m.currency),
    date: m.movementDate ?? null,
    annule: Boolean(m.isCancelled),
    soldeApres: m.balanceAfter == null ? null : nb(m.balanceAfter),
    auteur: [prenom, nom].filter(Boolean).join(" ").trim() || null,
    notes: m.notes ?? "",
    motifAnnulation: m.cancelReason ?? "",
    refVente: refVente ?? null,
    refDepense: refDepense ?? null,
  }));

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ UNE LIGNE POUSSÉE PUIS TIRÉE SERAIT COMPTÉE DEUX FOIS.               │
  // │                                                                       │
  // │ Le serveur reprend l'identifiant du terminal, et `sync/push` remet    │
  // │ l'opération en `pending` quand la réponse se perd APRÈS application : │
  // │ un tirage ramène alors la ligne pendant qu'elle est encore au         │
  // │ journal. On croise donc sur l'identifiant, jamais sur la description. │
  // └──────────────────────────────────────────────────────────────────────┘
  const dejaTirees = new Set(tirees.map((t) => t.id));
  const nonTirees = retenus.filter((m) => !dejaTirees.has(m.id));

  const elements = [
    ...nonTirees.map((m) => ({
      id: m.id,
      reference: null,
      direction: m.direction,
      type: m.type,
      description: m.description || null,
      montant: m.montant,
      devise: deviseOuPrincipale(m.devise),
      date: m.date,
      annule: false,
      soldeApres: null,
      auteur: null,
      notes: "",
      motifAnnulation: "",
      refVente: null,
      refDepense: null,
      envoi: m.envoi,
    })),
    ...tirees,
  ].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  return {
    elements,
    nombre: nombreTable + nonTirees.length,
    tronque: nombreTable > tirees.length,
    enFile: lotEnAttente(nonTirees),
  };
}

export interface DepenseResume {
  id: string;
  reference: string | null;
  description: string;
  categorie: string | null;
  couleur: string | null;
  beneficiaire: string | null;
  montant: number;
  devise: string;
  statut: string;
  date: Date | null;
  envoi?: EtatEnvoi;
}

export interface JournalDepenses {
  elements: DepenseResume[];
  nombre: number;
  tronque: boolean;
  /**
   * Ce que le back-office met dans ses trois cartes : le total par devise et
   * le NOMBRE par devise, sur les seules dépenses APPROUVÉES OU PAYÉES.
   *
   * ⚠ `stats` du serveur filtre `status__in=['approved', 'paid']` sans jamais
   * le dire à l'écran. Un brouillon n'est pas encore une sortie de caisse ;
   * l'inclure ferait un total supérieur à ce qui manque dans le tiroir.
   */
  totaux: { devise: string; montant: number; nombre: number }[];
  /**
   * Le même total, converti en devise principale au taux FIGÉ sur chaque
   * dépense.
   *
   * ⚠ On multiplie par `exchange_rate` de la LIGNE, jamais par le taux du
   * jour : un cumul de dépenses dont le chiffre bouge avec le cours n'est pas
   * relisable, et le marchand ne saurait pas lequel croire. C'est la règle de
   * `primary_sum` côté serveur, qui alimente le `total_primary` du même
   * cartouche au back-office.
   */
  totalPrincipal: number;
  enFile: LotEnAttente;
}

const STATUTS_ENGAGEANTS = ["approved", "paid"];

function conditionsDepense(f: FiltresDepense) {
  const terme = f.recherche.trim().toLowerCase();
  const motif = `%${terme}%`;
  const { debutMs, finMs } = bornesLocales(f.periode);

  const conditions = [
    f.statut ? eq(expenses.status, f.statut) : undefined,
    f.categorie ? eq(expenses.categoryId, f.categorie) : undefined,
    f.devise ? eq(expenses.currency, f.devise) : undefined,
    debutMs != null ? gte(expenses.expenseDate, new Date(debutMs)) : undefined,
    finMs != null ? lte(expenses.expenseDate, new Date(finMs)) : undefined,
    terme
      ? or(
          like(sql`lower(coalesce(${expenses.reference}, ''))`, motif),
          like(sql`lower(coalesce(${expenses.description}, ''))`, motif),
          like(sql`lower(coalesce(${expenses.beneficiary}, ''))`, motif),
          like(sql`lower(coalesce(${expenses.notes}, ''))`, motif)
        )
      : undefined,
  ].filter(Boolean);
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function retientDepenseEnFile(f: FiltresDepense, d: DepenseEnFile): boolean {
  // Une dépense en file est un BROUILLON : le serveur l'enregistre en `draft`
  // et ne la fait avancer que sur une décision. Filtrer sur un autre statut
  // doit donc l'écarter, sinon elle se rangerait sous « Payée ».
  if (f.statut && f.statut !== "draft") return false;
  if (f.categorie && d.categorieId !== f.categorie) return false;
  if (f.devise && deviseOuPrincipale(d.devise) !== f.devise) return false;
  const { debutMs, finMs } = bornesLocales(f.periode);
  const t = d.date?.getTime();
  if (debutMs != null && (t == null || t < debutMs)) return false;
  if (finMs != null && (t == null || t > finMs)) return false;
  const terme = f.recherche.trim().toLowerCase();
  if (terme) {
    const dans = `${d.description} ${d.beneficiaire ?? ""}`.toLowerCase();
    if (!dans.includes(terme)) return false;
  }
  return true;
}

export async function listeDepenses(
  f: FiltresDepense,
  limite = 100
): Promise<JournalDepenses> {
  const ou = conditionsDepense(f);
  const [lignes, compte, totaux, enFile, categories] = await Promise.all([
    db
      .select({
        id: expenses.id,
        reference: expenses.reference,
        description: expenses.description,
        beneficiary: expenses.beneficiary,
        amount: expenses.amount,
        currency: expenses.currency,
        status: expenses.status,
        expenseDate: expenses.expenseDate,
        categorie: expenseCategories.name,
        couleur: expenseCategories.color,
      })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(ou)
      .orderBy(desc(expenses.expenseDate))
      .limit(limite),
    db.select({ n: sql<number>`count(*)` }).from(expenses).where(ou),
    db
      .select({
        devise: expenses.currency,
        montant: sql<number>`sum(cast(${expenses.amount} as real))`,
        principal: sql<number>`sum(cast(${expenses.amount} as real) * cast(${expenses.exchangeRate} as real))`,
        nombre: sql<number>`count(*)`,
      })
      .from(expenses)
      .where(
        ou
          ? and(ou, inArray(expenses.status, STATUTS_ENGAGEANTS))
          : inArray(expenses.status, STATUTS_ENGAGEANTS)
      )
      .groupBy(expenses.currency),
    depensesEnFile(),
    db
      .select({ id: expenseCategories.id, nom: expenseCategories.name })
      .from(expenseCategories),
  ]);

  const nomDeCategorie = new Map(categories.map((c) => [c.id, c.nom]));
  const retenues = enFile.filter((d) => retientDepenseEnFile(f, d));
  const nombreTable = nb(compte[0]?.n);

  const tirees: DepenseResume[] = lignes.map((e) => ({
    id: e.id,
    reference: e.reference ?? null,
    description: e.description,
    categorie: e.categorie ?? null,
    couleur: e.couleur ?? null,
    beneficiaire: e.beneficiary?.trim() || null,
    montant: nb(e.amount),
    devise: deviseOuPrincipale(e.currency),
    statut: e.status,
    date: e.expenseDate ?? null,
  }));

  const dejaTirees = new Set(tirees.map((t) => t.id));
  const nonTirees = retenues.filter((d) => !dejaTirees.has(d.id));

  const elements = [
    ...nonTirees.map((d) => ({
      id: d.id,
      reference: null,
      description: d.description,
      categorie: nomDeCategorie.get(d.categorieId) ?? null,
      couleur: null,
      beneficiaire: d.beneficiaire,
      montant: d.montant,
      devise: deviseOuPrincipale(d.devise),
      // Le serveur l'enregistrera en BROUILLON : l'annoncer autrement ferait
      // croire à une sortie de caisse déjà engagée.
      statut: "draft",
      date: d.date,
      envoi: d.envoi,
    })),
    ...tirees,
  ].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  const parDevise: Map<string, { montant: number; nombre: number }> = new Map();
  let totalPrincipal = 0;
  for (const t of totaux) {
    const d = deviseOuPrincipale(t.devise);
    const courant = parDevise.get(d) ?? { montant: 0, nombre: 0 };
    parDevise.set(d, {
      montant: courant.montant + nb(t.montant),
      nombre: courant.nombre + nb(t.nombre),
    });
    totalPrincipal += nb(t.principal);
  }

  return {
    elements,
    nombre: nombreTable + nonTirees.length,
    tronque: nombreTable > tirees.length,
    totaux: [...parDevise.entries()]
      .map(([devise, v]) => ({ devise, ...v }))
      .sort((a, b) => a.devise.localeCompare(b.devise)),
    totalPrincipal,
    enFile: lotEnAttente(nonTirees),
  };
}

// ------------------------------------------------------------------- lot 9

export interface SoldeDeviseSession {
  devise: string;
  ouverture: number;
  /** Entrées espèces de la session, dans cette devise. */
  entrees: number;
  /** Sorties espèces rattachées à la session. */
  sorties: number;
  attendu: number;
}

export interface SessionACloturer {
  id: string;
  caisse: string;
  entrepot: string | null;
  ouverteLe: Date | null;
  nbVentes: number;
  /** Un solde par devise. On ne somme JAMAIS entre devises. */
  soldes: SoldeDeviseSession[];
  /** Encaissements par moyen de paiement, pour le Z. */
  parMoyen: { moyen: string; devise: string; montant: number }[];
}

/**
 * Ce qu'il faut pour clôturer, calculé LOCALEMENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE CALCUL EST UN APERÇU. Le serveur refait l'arithmétique du tiroir à la │
 * │ clôture, et c'est la sienne qui est écrite. Celui-ci sert à afficher le  │
 * │ solde attendu au caissier PENDANT qu'il compte, y compris hors ligne -   │
 * │ sans quoi il compterait à l'aveugle.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La formule suit celle du serveur : fonds d'ouverture, plus les règlements
 * ESPÈCES des ventes de la session (montant remis), moins les sorties espèces
 * rattachées à la session. Une devise = une ligne, jamais une somme.
 */
export async function sessionACloturer(
  sessionId: string
): Promise<SessionACloturer | null> {
  const [s] = await db
    .select({
      id: registerSessions.id,
      openedAt: registerSessions.openedAt,
      openingBalance: registerSessions.openingBalance,
      caisse: registers.name,
      entrepot: warehouses.name,
    })
    .from(registerSessions)
    .leftJoin(registers, eq(registers.id, registerSessions.registerId))
    .leftJoin(warehouses, eq(warehouses.id, registers.warehouseId))
    .where(eq(registerSessions.id, sessionId))
    .limit(1);
  if (!s) return null;

  const ventesSession = await db
    .select({ id: sales.id })
    .from(sales)
    .where(eq(sales.sessionId, sessionId));
  const idsVentes = ventesSession.map((v) => v.id);

  // Les ENCAISSEMENTS de la session, par moyen et par devise.
  const reglements =
    idsVentes.length > 0
      ? await db
          .select({
            amount: payments.amount,
            tendered: payments.tenderedAmount,
            currency: payments.currency,
            moyen: paymentMethods.name,
            type: paymentMethods.methodType,
          })
          .from(payments)
          .leftJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
          .where(inArray(payments.saleId, idsVentes))
      : [];

  const entrees = new Map<string, number>();
  const parMoyen = new Map<string, { moyen: string; devise: string; montant: number }>();
  for (const p of reglements) {
    const devise = deviseOuPrincipale(p.currency);
    // Le MONTANT REMIS, pas le montant imputé : c'est ce qui est entré au
    // tiroir. Le serveur emploie `coalesce(tendered_amount, amount)`.
    const montant = nb(p.tendered ?? p.amount);
    const cle = `${p.moyen ?? "Espèces"}|${devise}`;
    const ligne = parMoyen.get(cle) ?? {
      moyen: p.moyen ?? "Espèces",
      devise,
      montant: 0,
    };
    ligne.montant += montant;
    parMoyen.set(cle, ligne);
    // SEULES LES ESPÈCES entrent au tiroir : un règlement mobile money n'y
    // met aucun billet, et le compter ferait constater un écart chaque soir.
    if (p.type === "cash") {
      entrees.set(devise, (entrees.get(devise) ?? 0) + montant);
    }
  }

  const sorties = new Map<string, number>();
  for (const m of await db
    .select({
      amount: cashMovements.amount,
      currency: cashMovements.currency,
      direction: cashMovements.direction,
      annule: cashMovements.isCancelled,
    })
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, sessionId))) {
    if (m.annule || m.direction !== "out") continue;
    const d = deviseOuPrincipale(m.currency);
    sorties.set(d, (sorties.get(d) ?? 0) + nb(m.amount));
  }

  const devises = new Set<string>([
    ...entrees.keys(),
    ...sorties.keys(),
  ]);
  // Le fonds d'ouverture est scalaire dans la table tirée : il appartient à la
  // devise principale, et les autres devises partent de zéro.
  const principale = [...devises][0] ?? "";
  devises.add(principale);

  const soldes: SoldeDeviseSession[] = [...devises]
    .filter(Boolean)
    .sort()
    .map((devise) => {
      const ouverture = devise === principale ? nb(s.openingBalance) : 0;
      const e = entrees.get(devise) ?? 0;
      const so = sorties.get(devise) ?? 0;
      return { devise, ouverture, entrees: e, sorties: so, attendu: ouverture + e - so };
    });

  return {
    id: s.id,
    caisse: s.caisse ?? "Caisse",
    entrepot: s.entrepot ?? null,
    ouverteLe: s.openedAt ?? null,
    nbVentes: idsVentes.length,
    soldes,
    parMoyen: [...parMoyen.values()].sort((a, b) => a.moyen.localeCompare(b.moyen)),
  };
}

export interface DetailDepense {
  id: string;
  reference: string;
  couleur: string | null;
  description: string;
  categorie: string | null;
  montant: number;
  devise: string;
  statut: string;
  beneficiaire: string | null;
  moyen: string | null;
  reference_paiement: string | null;
  notes: string;
  date: Date | null;
  payeeLe: Date | null;
  /** `undefined` : la pièce est descendue du serveur. */
  envoi?: EtatEnvoi;
}

export async function detailDepense(id: string): Promise<DetailDepense | null> {
  const [d] = await db
    .select({
      depense: expenses,
      categorie: expenseCategories.name,
      couleur: expenseCategories.color,
      moyen: paymentMethods.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .leftJoin(paymentMethods, eq(paymentMethods.id, expenses.paymentMethodId))
    .where(eq(expenses.id, id))
    .limit(1);

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ UNE DÉPENSE EN FILE EST INTROUVABLE PAR SA PROPRE LISTE.             │
  // │                                                                      │
  // │ Corollaire systématique de « les tables tirées ne sont écrites que    │
  // │ par le tirage », déjà refermé pour les retours, les devis et les      │
  // │ ventes. La liste fusionne le journal et rend chaque rangée tapable :  │
  // │ sans ce repli, taper une dépense saisie hors ligne annonçait          │
  // │ « Dépense introuvable » - le marchand tenant son reçu dans l'autre    │
  // │ main.                                                                 │
  // └──────────────────────────────────────────────────────────────────────┘
  if (!d) return ficheEnFile(id);

  const e = d.depense;
  return {
    id: e.id,
    reference: e.reference,
    couleur: d.couleur ?? null,
    description: e.description ?? "",
    categorie: d.categorie ?? null,
    montant: nb(e.amount),
    devise: e.currency,
    statut: e.status,
    beneficiaire: e.beneficiary?.trim() || null,
    moyen: d.moyen ?? null,
    reference_paiement: e.paymentReference?.trim() || null,
    notes: e.notes ?? "",
    date: e.expenseDate ?? null,
    payeeLe: e.paidDate ?? null,
  };
}

/** Catégories de dépense, pour la saisie. */
/**
 * La fiche d'une dépense encore au journal, et RIEN de plus.
 *
 * Elle rend ce dont elle est SÛRE : ce que le corps de l'opération porte, plus
 * le nom de la catégorie et du moyen de paiement, qui se joignent localement.
 * `payeeLe` reste `null` - jamais une date inventée : le serveur ne l'écrit
 * qu'au paiement, et `null` ne se lit jamais comme zéro.
 *
 * ⚠ Le statut est `draft`, parce que c'est ce que `create_expense` écrira.
 * L'annoncer autrement ferait croire à une sortie de caisse déjà engagée : une
 * dépense en brouillon ne crée AUCUN mouvement de tiroir.
 */
async function ficheEnFile(id: string): Promise<DetailDepense | null> {
  const enFile = (await depensesEnFile()).find((d) => d.id === id);
  if (!enFile) return null;

  const [categories, moyens] = await Promise.all([
    categoriesDepense(),
    db.select({ id: paymentMethods.id, nom: paymentMethods.name }).from(paymentMethods),
  ]);
  const categorie = categories.find((c) => c.id === enFile.categorieId);

  return {
    id: enFile.id,
    // Le numéro d'appareil, DÉFINITIF dès l'impression : c'est lui qui permet
    // de réimprimer le reçu du bénéficiaire sans attendre le réseau.
    reference: enFile.reference ?? "",
    couleur: categorie?.couleur ?? null,
    description: enFile.description,
    categorie: categorie?.nom ?? null,
    montant: enFile.montant,
    devise: deviseOuPrincipale(enFile.devise),
    statut: "draft",
    beneficiaire: enFile.beneficiaire,
    moyen: moyens.find((m) => m.id === enFile.methode)?.nom ?? null,
    reference_paiement: null,
    notes: enFile.notes ?? "",
    date: enFile.date,
    payeeLe: null,
    envoi: enFile.envoi,
  };
}

/**
 * Les catégories utilisables, JOURNAL COMPRIS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE CATÉGORIE CRÉÉE AU COMPTOIR EST INTROUVABLE PAR SA PROPRE LISTE.    │
 * │                                                                          │
 * │ Corollaire systématique de « les tables tirées ne sont écrites que par   │
 * │ le tirage », déjà refermé sur les retours, les devis et les ventes : la  │
 * │ catégorie vit dans le journal, pas dans `expense_categories`. Sans cette │
 * │ fusion, le marchand la crée, ne la voit dans aucune liste, et la recrée. │
 * │                                                                          │
 * │ ⚠ Les BLOQUÉES en sont : un blocage tient le temps qu'un droit soit      │
 * │ accordé, et la catégorie repartira telle quelle. La masquer ferait créer │
 * │ un doublon que le serveur refuserait ensuite pour un nom déjà pris.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les INACTIVES sont écartées, comme le back-office qui force `is_active=true`
 * sur sa recherche : proposer une catégorie retirée du catalogue ferait
 * ressortir une rubrique que le marchand a justement fermée.
 */
export interface CategorieCaisse {
  id: string;
  nom: string;
  /** Ce que le marchand a choisi. `null` quand rien n'a été enregistré. */
  couleur: string | null;
  enFile: boolean;
}

async function categoriesAvecJournal(
  table: typeof expenseCategories | typeof incomeCategories,
  genre: GenreCategorie
): Promise<CategorieFusionnee[]> {
  const [lignes, journal] = await Promise.all([
    db
      .select({
        id: table.id,
        nom: table.name,
        couleur: table.color,
        description: table.description,
        actif: table.isActive,
      })
      .from(table)
      .orderBy(table.name),
    categoriesEnAttente(genre),
  ]);

  return fusionnerCategories(
    lignes.map((l) => ({
      id: l.id,
      nom: l.nom,
      couleur: l.couleur ?? null,
      description: l.description ?? "",
      actif: l.actif !== false,
    })),
    journal.creations,
    journal.modifications
  );
}

/**
 * Les rubriques UTILISABLES : actives seulement, pour les formulaires.
 *
 * Le back-office force `is_active=true` sur sa recherche, pour la même raison :
 * proposer une rubrique retirée ferait ressortir ce que le marchand a
 * justement fermé.
 */
function categoriesActives(
  table: typeof expenseCategories | typeof incomeCategories,
  genre: GenreCategorie
): Promise<CategorieCaisse[]> {
  return categoriesAvecJournal(table, genre).then((tout) =>
    tout
      .filter((c) => c.actif)
      .map((c) => ({
        id: c.id,
        nom: c.nom,
        couleur: c.couleur,
        enFile: c.envoi !== null,
      }))
  );
}

/** Catégories de dépense, pour une sortie de caisse. */
export function categoriesDepense() {
  return categoriesActives(expenseCategories, "depense");
}

/** Catégories de recette, pour une entrée de caisse. */
export function categoriesRecette() {
  return categoriesActives(incomeCategories, "recette");
}

/**
 * TOUTES les rubriques d'un genre, inactives comprises.
 *
 * ⚠ Deux lecteurs, et il en faut deux. Une gestion qui ne montrerait pas ce
 * qu'elle a désactivé ne permettrait pas de le réactiver : la rubrique
 * disparaîtrait de l'écran au moment même où on la ferme, et il n'existerait
 * plus aucun chemin vers elle - la suppression n'étant pas offerte.
 */
export function toutesCategoriesCaisse(
  genre: GenreCategorie
): Promise<CategorieFusionnee[]> {
  return categoriesAvecJournal(
    genre === "recette" ? incomeCategories : expenseCategories,
    genre
  );
}
