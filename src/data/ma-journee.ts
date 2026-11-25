/**
 * « Ma journée » lue sur le terminal : la base locale ET le journal.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA JOURNÉE SE CALCULE ICI, HORS LIGNE, VENTES EN FILE COMPRISES.        │
 * │                                                                          │
 * │ C'est l'écran qu'un caissier ouvre avant de compter son tiroir, et le    │
 * │ réseau n'y est pas toujours. Il lisait auparavant `my-activity` du       │
 * │ serveur : sans réseau il ne montrait rien, et après une matinée hors     │
 * │ ligne il ignorait toutes les ventes encore dans le journal.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LES DÉFINITIONS SONT CELLES DU SERVEUR (`reports/ma_journee.py`), une à
 * une, et l'agrégation vit dans le module PUR `features/ma-journee/agregats` :
 *
 * - Ventes : `sale_date` du jour local, ni brouillon ni annulées, crédit
 *   compris ; auteur = le vendeur. Les ventes anciennes sans entrepôt restent
 *   sous le défaut, comme `warehouse_include_null`.
 * - Encaissé : règlements `completed`, `paid_at` du jour, hors cagnotte et
 *   avance ; auteur = celui qui a REÇU l'argent, le vendeur à défaut. Converti
 *   par `amount × taux de la vente`, exactement comme `primary_sum`.
 * - Dépenses : `expense_date` du jour, ni rejetées ni annulées ; auteur = qui
 *   l'a créée.
 * - Caisse : mouvements non annulés du jour ; l'entrepôt se DÉRIVE (vente,
 *   dépense, session et son comptoir), sans `isnull` sous un choix.
 * - Stock : mouvements du jour hors ventes et retours clients, pour qui lit
 *   les mouvements de stock.
 *
 * ⚠ CE QUI ATTEND DANS LE JOURNAL N'A PAS ENCORE DE TAUX FIGÉ côté serveur :
 * une dépense ou un mouvement de caisse saisi hors ligne se convertit au taux
 * du JOUR (`versPrincipale`). Une vente en file, elle, porte ses taux dans son
 * corps, et ce sont eux qu'on prend.
 *
 * ⚠ UNE LIGNE EN FILE EST TOUJOURS À MOI (`session/proprietaire.ts`) : sous un
 * filtre sur un collègue, elle n'apparaît pas ; sous un entrepôt PRÉCIS, une
 * ligne dont on ignore le dépôt n'apparaît pas non plus (`ContexteFile`).
 */
import { and, desc, eq, gte, inArray, isNull, lt, notInArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  formatPackagedSplit,
  formatUnitQuantity,
  getPackaging,
} from "@vente-facile/core";

import { db } from "@/db/client";
import {
  cashMovements,
  customers,
  expenses,
  paymentMethods,
  payments,
  products,
  registerSessions,
  registers,
  sales,
  stockMovements,
  units,
  users,
  warehouses,
} from "@/db/schema";
import { depensesEnFile, mouvementsEnFile } from "@/features/caisse/attente";
import {
  agregerLaJournee,
  monnaieDeLaVente,
  type DepenseDeLaJournee,
  type EncaissementDeLaJournee,
  type JourneeLocale,
  type MouvementCaisseDeLaJournee,
  type MouvementStockDeLaJournee,
  type VenteDeLaJournee,
} from "@/features/ma-journee/agregats";
import {
  retientEntrepot,
  type ContexteFile,
  type FiltrePerimetre,
} from "@/features/perimetre/filtre-perimetre";
import {
  fusionnerVentesEnFile,
  retientVenteEnFile,
  statutDeVente,
} from "@/features/tableau-de-bord/en-file";
import { ventesEnAttenteDetaillees } from "@/features/ventes/attente";
import type { LotEnAttente } from "@/features/sync/attente";
import { enAttenteParType } from "@/sync";

import { referencesDejaTirees } from "./deja-tirees";
import { minuitUTCDuJour } from "./dates";
import { deviseOuPrincipale } from "./devise-principale";
import { pireEnvoi } from "./envoi";
import { quantiteDuMouvement } from "./mouvements";
import { conditionEntrepot } from "./perimetre-sql";
import { TYPE_MOUVEMENT_STOCK } from "./types-mouvement";

/**
 * Les tables que l'écran surveille : toute écriture dans l'une d'elles relit
 * la journée. `outbox_operations` et `print_jobs` en sont, sans quoi une vente
 * encaissée pendant que l'écran est ouvert n'y paraîtrait qu'au tirage suivant.
 */
export const TABLES_MA_JOURNEE = [
  "sales",
  "payments",
  "cash_movements",
  "expenses",
  "stock_movements",
  "outbox_operations",
  "print_jobs",
] as const;

/** Ni la cagnotte ni l'avance ne sont de l'argent entré ce jour-là. */
const MOYENS_HORS_ENCAISSE = ["loyalty", "advance"];

/** Ces mouvements doublonneraient la liste des ventes du jour. */
const MOUVEMENTS_DES_VENTES = ["sale", "return_in"];

const ECARTEES = ["draft", "cancelled"];
const DEPENSES_ECARTEES = ["rejected", "cancelled"];

const nb = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Un taux nul ou absent laisse au moins le montant : voir `enPrincipale`. */
const taux = (v: string | number | null | undefined): number => {
  const t = nb(v);
  return t > 0 ? t : 1;
};

export interface DroitsJournee {
  /** `sales.view` : la liste des ventes du jour. */
  ventes: boolean;
  /** `stock_movements.view` : la carte des mouvements de stock. */
  stock: boolean;
}

export interface LectureJournee {
  /** Ce que la portée retient de la base locale ET du journal. */
  perimetre: FiltrePerimetre;
  file: ContexteFile;
  droits: DroitsJournee;
  /** Mon nom, pour les ventes en file : elles n'ont pas encore de vendeur. */
  monNom: string | null;
  /**
   * Un montant en devise quelconque ramené en principale au taux du JOUR.
   * Seules les lignes du journal sans taux figé s'en servent.
   */
  versPrincipale: (montant: number, devise: string) => number;
  maintenant?: Date;
}

export interface MaJourneeLue {
  journee: JourneeLocale;
  /**
   * Les ventes de la journée qui attendent encore leur envoi : le document du
   * serveur ne les porte pas, et la feuille de rapport doit le dire.
   */
  ventesEnFile: LotEnAttente;
}

function bornesDuJour(maintenant: Date): { debut: Date; fin: Date } {
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { debut, fin };
}

const dansLeJour = (d: Date | null | undefined, b: { debut: Date; fin: Date }): boolean =>
  !!d && d >= b.debut && d < b.fin;

export async function lireMaJournee(l: LectureJournee): Promise<MaJourneeLue> {
  const maintenant = l.maintenant ?? new Date();
  const jour = bornesDuJour(maintenant);
  const f = l.perimetre;

  // ── Ventes en file : lues une fois, elles nourrissent ventes, encaissé et
  //    caisse. On les borne AVANT la fusion, comme le tableau de bord.
  const attente = (await ventesEnAttenteDetaillees()).filter(
    (v) => dansLeJour(v.date, jour) && retientVenteEnFile(v, f, l.file)
  );
  const dejaTirees = await referencesDejaTirees(attente.map((v) => v.reference));
  const nouvelles = attente.filter((v) => !dejaTirees.has(v.reference));
  const fusion = fusionnerVentesEnFile({
    ventes: nouvelles,
    dejaTirees,
    facteurs: new Map(),
    couts: new Map(),
  });

  const [ventes, encaissements, caisse, depenses, stock] = await Promise.all([
    lireVentes(f, jour, nouvelles, l.monNom),
    lireEncaissements(f, l.file, jour),
    lireCaisse(f, l.file, jour, l.versPrincipale),
    lireDepenses(f, l.file, jour, l.versPrincipale),
    l.droits.stock ? lireStock(f, l.file, jour) : Promise.resolve(null),
  ]);

  // Les règlements des ventes en file : encaissés, ET entrés au tiroir. Le
  // serveur créera à la poussée un mouvement d'entrée par règlement, puis la
  // monnaie rendue en sortie : d'ici là, on les écrit nous-mêmes.
  const nomsDesMoyens = await nomsEtTypesDesMoyens(
    fusion.reglements.map((r) => r.methodeId)
  );
  const reglesParVente = new Map<string, number>();
  for (const r of fusion.reglements) {
    const moyen = r.methodeId ? nomsDesMoyens.get(r.methodeId) : undefined;
    if (moyen && MOYENS_HORS_ENCAISSE.includes(moyen.type)) continue;
    encaissements.push({ moyen: moyen?.nom ?? "Autre", principal: r.principal });
    caisse.push({ direction: "in", type: "sale", principal: r.principal });
    reglesParVente.set(r.saleId, (reglesParVente.get(r.saleId) ?? 0) + r.principal);
  }
  for (const v of fusion.ventes) {
    const monnaie = monnaieDeLaVente(v.totalPrincipal, reglesParVente.get(v.id) ?? 0);
    if (monnaie > 0) caisse.push({ direction: "out", type: "change", principal: monnaie });
  }

  // Les règlements de ventes EXISTANTES, mis en file : surtout des dettes
  // encaissées hors ligne. Leur monnaie éventuelle sera calculée par le
  // serveur ; d'ici là, le remis compte entier.
  const reglementsSeuls = await reglementsEnFile(f, l.file, jour, l.versPrincipale);
  encaissements.push(...reglementsSeuls.map((r) => ({ moyen: r.moyen, principal: r.principal })));
  caisse.push(
    ...reglementsSeuls.map((r) => ({ direction: "in" as const, type: "sale", principal: r.principal }))
  );


  return {
    journee: agregerLaJournee({
      ventes,
      encaissements,
      depenses,
      caisse,
      stock,
      maintenant,
    }),
    ventesEnFile: {
      nombre: nouvelles.length,
      envoi: nouvelles.length > 0 ? pireEnvoi(nouvelles.map((v) => v.envoi)) : undefined,
    },
  };
}

// ─── Ventes ──────────────────────────────────────────────────────────────────

async function lireVentes(
  f: FiltrePerimetre,
  jour: { debut: Date; fin: Date },
  enFile: Awaited<ReturnType<typeof ventesEnAttenteDetaillees>>,
  monNom: string | null
): Promise<VenteDeLaJournee[]> {
  const tirees = await db
    .select({
      id: sales.id,
      reference: sales.reference,
      date: sales.saleDate,
      statut: sales.status,
      devise: sales.currency,
      total: sales.total,
      resteDu: sales.amountDue,
      taux: sales.exchangeRate,
      client: customers.name,
      prenom: users.firstName,
      nom: users.lastName,
      email: users.email,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(users, eq(users.id, sales.soldById))
    .where(
      and(
        gte(sales.saleDate, jour.debut),
        lt(sales.saleDate, jour.fin),
        eq(sales.isDeleted, false),
        notInArray(sales.status, ECARTEES),
        conditionEntrepot(sales.warehouseId, f, { inclureSansEntrepot: true }),
        f.utilisateur ? eq(sales.soldById, f.utilisateur) : undefined
      )
    )
    .orderBy(desc(sales.saleDate));

  const lignes: VenteDeLaJournee[] = tirees.map((v) => ({
    id: v.id,
    reference: v.reference,
    date: v.date ?? null,
    statut: v.statut,
    devise: deviseOuPrincipale(v.devise),
    total: nb(v.total),
    resteDu: nb(v.resteDu),
    taux: taux(v.taux),
    client: v.client ?? null,
    vendeur: nomDe(v.prenom, v.nom, v.email),
  }));

  for (const v of enFile) {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ LA VERSION DU TICKET DÉCIDE DE LA DEVISE DE SES MONTANTS.        │
    // │                                                                  │
    // │ Jusqu'à la version 2, le ticket rangeait des montants en         │
    // │ PRINCIPALE sous l'étiquette de la facture : on les lit alors     │
    // │ comme tels, au taux 1, sinon la vente compterait deux mille huit │
    // │ cents fois son prix. Voir `features/tableau-de-bord/en-file.ts`. │
    // └──────────────────────────────────────────────────────────────────┘
    const recente = v.versionDonnees >= 2;
    lignes.push({
      id: v.corps.id,
      reference: v.reference,
      date: v.date,
      statut: statutDeVente(v.resteAPayer),
      devise: recente ? deviseOuPrincipale(v.devise) : deviseOuPrincipale(null),
      total: v.total,
      resteDu: v.resteAPayer,
      taux: recente ? taux(v.corps.exchange_rate) : 1,
      client: v.client,
      vendeur: monNom,
      envoi: v.envoi,
    });
  }
  return lignes;
}

function nomDe(prenom: string | null, nom: string | null, email: string | null): string | null {
  const complet = `${prenom ?? ""} ${nom ?? ""}`.trim();
  return complet || email || null;
}

// ─── Encaissé ────────────────────────────────────────────────────────────────

async function lireEncaissements(
  f: FiltrePerimetre,
  _file: ContexteFile,
  jour: { debut: Date; fin: Date }
): Promise<EncaissementDeLaJournee[]> {
  const lignes = await db
    .select({
      montant: payments.amount,
      taux: sales.exchangeRate,
      moyen: paymentMethods.name,
    })
    .from(payments)
    .leftJoin(sales, eq(sales.id, payments.saleId))
    .leftJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId))
    .where(
      and(
        eq(payments.status, "completed"),
        gte(payments.paidAt, jour.debut),
        lt(payments.paidAt, jour.fin),
        or(
          isNull(paymentMethods.methodType),
          notInArray(paymentMethods.methodType, MOYENS_HORS_ENCAISSE)
        ),
        conditionEntrepot(sales.warehouseId, f, { inclureSansEntrepot: true }),
        // ⚠ L'AUTEUR D'UN ENCAISSEMENT EST CELUI QUI A REÇU L'ARGENT. Un
        // caissier qui encaisse la dette d'une vente faite par un collègue a
        // ces billets dans SON tiroir. Une ligne ancienne sans receveur
        // retombe sur le vendeur, comme le serveur.
        f.utilisateur
          ? or(
              eq(payments.receivedById, f.utilisateur),
              and(isNull(payments.receivedById), eq(sales.soldById, f.utilisateur))
            )
          : undefined
      )
    );
  return lignes.map((p) => ({
    moyen: p.moyen ?? "Autre",
    principal: nb(p.montant) * taux(p.taux),
  }));
}

async function nomsEtTypesDesMoyens(
  ids: (string | null)[]
): Promise<Map<string, { nom: string; type: string }>> {
  const utiles = [...new Set(ids.filter((x): x is string => !!x))];
  if (utiles.length === 0) return new Map();
  const lignes = await db
    .select({ id: paymentMethods.id, nom: paymentMethods.name, type: paymentMethods.methodType })
    .from(paymentMethods)
    .where(inArray(paymentMethods.id, utiles));
  return new Map(lignes.map((m) => [m.id, { nom: m.nom, type: m.type }]));
}

/** Le corps d'un `sale.add_payment`, tel que `features/ventes/actes.ts` l'écrit. */
interface CorpsReglement {
  sale: string;
  payment_method?: string;
  tendered_amount?: string;
  currency?: string;
}

async function reglementsEnFile(
  f: FiltrePerimetre,
  file: ContexteFile,
  jour: { debut: Date; fin: Date },
  versPrincipale: (montant: number, devise: string) => number
): Promise<{ moyen: string; principal: number }[]> {
  if (f.utilisateur && f.utilisateur !== file.moi) return [];
  const ops = (await enAttenteParType<CorpsReglement>("sale.add_payment", { avecBloquees: true }))
    .filter((o) => dansLeJour(o.occurredAt, jour));
  if (ops.length === 0) return [];

  // L'entrepôt d'un règlement est celui de sa VENTE, que la table tirée porte
  // quand elle est connue ; une vente encore en file ne le dit pas ici.
  const ventes = new Map(
    (
      await db
        .select({ id: sales.id, entrepot: sales.warehouseId })
        .from(sales)
        .where(inArray(sales.id, [...new Set(ops.map((o) => o.payload.sale))]))
    ).map((v) => [v.id, v.entrepot])
  );
  const moyens = await nomsEtTypesDesMoyens(ops.map((o) => o.payload.payment_method ?? null));

  const sortie: { moyen: string; principal: number }[] = [];
  for (const o of ops) {
    if (!retientEntrepot(ventes.get(o.payload.sale) ?? null, f, file.entrepotInconnuAdmis)) continue;
    const moyen = o.payload.payment_method ? moyens.get(o.payload.payment_method) : undefined;
    if (moyen && MOYENS_HORS_ENCAISSE.includes(moyen.type)) continue;
    const devise = deviseOuPrincipale(o.payload.currency);
    sortie.push({
      moyen: moyen?.nom ?? "Autre",
      principal: versPrincipale(nb(o.payload.tendered_amount), devise),
    });
  }
  return sortie;
}

// ─── Caisse ──────────────────────────────────────────────────────────────────

async function lireCaisse(
  f: FiltrePerimetre,
  file: ContexteFile,
  jour: { debut: Date; fin: Date },
  versPrincipale: (montant: number, devise: string) => number
): Promise<MouvementCaisseDeLaJournee[]> {
  const tirees = await db
    .select({
      direction: cashMovements.direction,
      type: cashMovements.movementType,
      montant: cashMovements.amount,
      taux: cashMovements.exchangeRate,
    })
    .from(cashMovements)
    .leftJoin(sales, eq(sales.id, cashMovements.saleId))
    .leftJoin(expenses, eq(expenses.id, cashMovements.expenseId))
    .leftJoin(registerSessions, eq(registerSessions.id, cashMovements.sessionId))
    .leftJoin(registers, eq(registers.id, registerSessions.registerId))
    .where(
      and(
        eq(cashMovements.isCancelled, false),
        gte(cashMovements.movementDate, jour.debut),
        lt(cashMovements.movementDate, jour.fin),
        // L'entrepôt se DÉRIVE par les trois chemins du serveur, et SANS
        // `isnull` : voir `conditionsCaisse` de `data/caisse.ts`.
        conditionEntrepot([sales.warehouseId, expenses.warehouseId, registers.warehouseId], f),
        f.utilisateur ? eq(cashMovements.createdById, f.utilisateur) : undefined
      )
    );

  const lignes: MouvementCaisseDeLaJournee[] = tirees.map((m) => ({
    direction: m.direction === "out" ? "out" : "in",
    type: m.type,
    principal: nb(m.montant) * taux(m.taux),
  }));

  if (!f.utilisateur || f.utilisateur === file.moi) {
    for (const m of await mouvementsEnFile()) {
      if (!dansLeJour(m.date, jour)) continue;
      // Un mouvement en file n'a pas d'entrepôt : INCONNU, jamais « tous ».
      if (!retientEntrepot(null, f, file.entrepotInconnuAdmis)) continue;
      lignes.push({
        direction: m.direction,
        type: m.type,
        principal: versPrincipale(m.montant, m.devise),
      });
    }
  }
  return lignes;
}

// ─── Dépenses ────────────────────────────────────────────────────────────────

async function lireDepenses(
  f: FiltrePerimetre,
  file: ContexteFile,
  jour: { debut: Date; fin: Date },
  versPrincipale: (montant: number, devise: string) => number
): Promise<DepenseDeLaJournee[]> {
  const tirees = await db
    .select({
      statut: expenses.status,
      montant: expenses.amount,
      taux: expenses.exchangeRate,
    })
    .from(expenses)
    .where(
      and(
        // ⚠ UNE COLONNE DATE EST RANGÉE EN MINUIT UTC : on la compare à la
        // valeur EXACTE de ce jour, jamais à des bornes locales.
        eq(expenses.expenseDate, minuitUTCDuJour(jour.debut)),
        notInArray(expenses.status, DEPENSES_ECARTEES),
        conditionEntrepot(expenses.warehouseId, f),
        f.utilisateur ? eq(expenses.createdById, f.utilisateur) : undefined
      )
    );

  const lignes: DepenseDeLaJournee[] = tirees.map((d) => ({
    statut: d.statut,
    principal: nb(d.montant) * taux(d.taux),
  }));

  if (!f.utilisateur || f.utilisateur === file.moi) {
    for (const d of await depensesEnFile()) {
      if (!dansLeJour(d.date, jour)) continue;
      if (!retientEntrepot(d.entrepot, f, file.entrepotInconnuAdmis)) continue;
      // Une dépense en file est un BROUILLON : le serveur l'enregistre ainsi.
      lignes.push({ statut: "draft", principal: versPrincipale(d.montant, d.devise) });
    }
  }
  return lignes;
}

// ─── Mouvements de stock ─────────────────────────────────────────────────────

/** Le corps d'une saisie de mouvement, tel que `payload-mouvement.ts` l'écrit. */
interface LigneDeSaisie {
  product?: string;
  quantity?: string;
  package_quantity?: string;
  loose_quantity?: string;
}
interface CorpsMouvement extends LigneDeSaisie {
  id: string;
  warehouse?: string;
  movement_type?: string;
  lines?: LigneDeSaisie[];
}

async function lireStock(
  f: FiltrePerimetre,
  file: ContexteFile,
  jour: { debut: Date; fin: Date }
): Promise<MouvementStockDeLaJournee[]> {
  // DEUX ALIAS : une seule jointure sur `units` ferait porter au contenant le
  // nom de l'unité de détail.
  const uniteDetail = alias(units, "unite_detail_journee");
  const uniteContenant = alias(units, "unite_contenant_journee");

  const tirees = await db
    .select({
      id: stockMovements.id,
      type: stockMovements.movementType,
      quantity: stockMovements.quantity,
      inputPackageQuantity: stockMovements.inputPackageQuantity,
      inputLooseQuantity: stockMovements.inputLooseQuantity,
      packagingFactor: stockMovements.packagingFactor,
      date: stockMovements.createdAt,
      produit: products.name,
      sellingMode: products.sellingMode,
      unite: uniteDetail.name,
      uniteContenant: uniteContenant.name,
      entrepot: warehouses.name,
    })
    .from(stockMovements)
    .leftJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .leftJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
    .where(
      and(
        gte(stockMovements.createdAt, jour.debut),
        lt(stockMovements.createdAt, jour.fin),
        notInArray(stockMovements.movementType, MOUVEMENTS_DES_VENTES),
        conditionEntrepot(stockMovements.warehouseId, f),
        f.utilisateur ? eq(stockMovements.createdById, f.utilisateur) : undefined
      )
    );

  const lignes: MouvementStockDeLaJournee[] = tirees.map((m) => {
    const t = TYPE_MOUVEMENT_STOCK[m.type] ?? { label: m.type, entree: true };
    return {
      id: m.id,
      date: m.date ?? null,
      produit: m.produit ?? "Produit supprimé",
      type: m.type,
      libelle: t.label,
      quantite: quantiteDuMouvement(m),
      entree: t.entree,
      entrepot: m.entrepot ?? null,
    };
  });

  if (f.utilisateur && f.utilisateur !== file.moi) return lignes;

  const ops = [
    ...(await enAttenteParType<CorpsMouvement>("stock_movement.create", { avecBloquees: true })),
    ...(await enAttenteParType<CorpsMouvement>("stock_movement.bulk_create", { avecBloquees: true })),
  ].filter(
    (o) =>
      dansLeJour(o.occurredAt, jour) &&
      !MOUVEMENTS_DES_VENTES.includes(o.payload.movement_type ?? "") &&
      retientEntrepot(o.payload.warehouse ?? null, f, file.entrepotInconnuAdmis)
  );
  if (ops.length === 0) return lignes;

  // Une livraison entière est UN acte de N lignes : chacune est un mouvement.
  const saisies = ops.flatMap((o) =>
    (o.payload.lines ?? [o.payload]).map((ligne, i) => ({ o, ligne, i }))
  );
  const catalogue = await profilsDesProduits(saisies.map((s) => s.ligne.product ?? null));
  const nomsEntrepots = await nomsDesEntrepots(ops.map((o) => o.payload.warehouse ?? null));

  for (const { o, ligne, i } of saisies) {
    const type = o.payload.movement_type ?? "";
    const t = TYPE_MOUVEMENT_STOCK[type] ?? { label: type, entree: true };
    const p = ligne.product ? catalogue.get(ligne.product) : undefined;
    lignes.push({
      id: `${o.payload.id}-${i}`,
      date: o.occurredAt ?? null,
      produit: p?.nom ?? "Article",
      type,
      libelle: t.label,
      quantite: quantiteSaisie(ligne, p),
      entree: t.entree,
      entrepot: o.payload.warehouse ? (nomsEntrepots.get(o.payload.warehouse) ?? null) : null,
      envoi: o.envoi,
    });
  }
  return lignes;
}

interface ProfilArticle {
  nom: string;
  sellingMode: string | null;
  unitsPerPackage: number | null;
  unite: string | null;
  uniteContenant: string | null;
}

async function profilsDesProduits(ids: (string | null)[]): Promise<Map<string, ProfilArticle>> {
  const utiles = [...new Set(ids.filter((x): x is string => !!x))];
  if (utiles.length === 0) return new Map();
  const uniteDetail = alias(units, "unite_detail_saisie");
  const uniteContenant = alias(units, "unite_contenant_saisie");
  const lignes = await db
    .select({
      id: products.id,
      nom: products.name,
      sellingMode: products.sellingMode,
      unitsPerPackage: products.unitsPerPackage,
      unite: uniteDetail.name,
      uniteContenant: uniteContenant.name,
    })
    .from(products)
    .leftJoin(uniteDetail, eq(uniteDetail.id, products.unitId))
    .leftJoin(uniteContenant, eq(uniteContenant.id, products.packagingUnitId))
    .where(inArray(products.id, utiles));
  return new Map(lignes.map(({ id, ...p }) => [id, p]));
}

async function nomsDesEntrepots(ids: (string | null)[]): Promise<Map<string, string>> {
  const utiles = [...new Set(ids.filter((x): x is string => !!x))];
  if (utiles.length === 0) return new Map();
  const lignes = await db
    .select({ id: warehouses.id, nom: warehouses.name })
    .from(warehouses)
    .where(inArray(warehouses.id, utiles));
  return new Map(lignes.map((w) => [w.id, w.nom]));
}

/** La quantité d'une saisie encore en file, dans ses termes. */
function quantiteSaisie(ligne: LigneDeSaisie, p: ProfilArticle | undefined): string {
  const paquets = nb(ligne.package_quantity);
  const vrac = nb(ligne.loose_quantity);
  const conditionnement = p
    ? getPackaging({
        selling_mode: p.sellingMode,
        units_per_package: p.unitsPerPackage,
        unit_name: p.unite,
        packaging_unit_name: p.uniteContenant,
      })
    : null;
  if (conditionnement && (paquets > 0 || vrac > 0)) {
    return formatPackagedSplit(conditionnement, paquets, vrac);
  }
  return formatUnitQuantity(Math.abs(nb(ligne.quantity)), p?.unite ?? "unité");
}
