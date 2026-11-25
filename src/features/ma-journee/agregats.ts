/**
 * « Ma journée » sur le terminal : l'agrégation, sans base de données.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES DÉFINITIONS SONT CELLES DU SERVEUR (`reports/ma_journee.py`).       │
 * │                                                                          │
 * │ - Ventes : ni brouillon ni annulées, crédit COMPRIS ; « à crédit » est   │
 * │   le reste dû. Total converti au taux figé de chaque vente.              │
 * │ - Encaissé : les billets REMIS, par moyen, hors cagnotte et avance ; la  │
 * │   monnaie rendue s'en retire pour donner le NET, ce qui reste au tiroir. │
 * │ - Caisse : entrées et sorties du tiroir, monnaie rendue comprise.        │
 * │ - Heures : seaux vides conservés jusqu'à l'heure courante, aucun après.  │
 * │                                                                          │
 * │ Le terminal calcule sa journée HORS LIGNE, ventes en file comprises :   │
 * │ c'est l'écran qu'un caissier ouvre avant de compter son tiroir, et le    │
 * │ réseau n'y est pas toujours. Une seconde arithmétique qui divergerait    │
 * │ du serveur ferait lire deux chiffres pour la même journée : ce module    │
 * │ suit la sienne, cas par cas, et ses tests le tiennent.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ `null` NE SE LIT JAMAIS COMME ZÉRO : une vente en file dont le ticket est
 * introuvable est COMPTÉE sans être additionnée.
 */
import type { DayReportData, ReceiptChrome } from "@vente-facile/core/receipt";

import type { EtatEnvoi } from "@/sync";

export interface VenteDeLaJournee {
  id: string;
  reference: string;
  date: Date | null;
  statut: string;
  /** La devise de SA facture. */
  devise: string;
  /** En devise de facture. `null` : ticket introuvable, montant INCONNU. */
  total: number | null;
  /** En devise de facture. */
  resteDu: number;
  /** Facture -> principale, figé sur la vente. */
  taux: number;
  client: string | null;
  vendeur: string | null;
  /** Présent pour une vente encore dans le journal. */
  envoi?: EtatEnvoi;
}

export interface EncaissementDeLaJournee {
  moyen: string;
  /** Le billet remis, ramené en principale. */
  principal: number;
}

export interface DepenseDeLaJournee {
  statut: string;
  principal: number;
}

export interface MouvementCaisseDeLaJournee {
  direction: "in" | "out";
  /** `change` : la monnaie rendue. */
  type: string;
  principal: number;
}

export interface MouvementStockDeLaJournee {
  id: string;
  date: Date | null;
  produit: string;
  type: string;
  libelle: string;
  /** Déjà lisible : « 2 BOITES + 5 AMPOULES ». */
  quantite: string;
  entree: boolean;
  entrepot: string | null;
  envoi?: EtatEnvoi;
}

export interface EntreesJournee {
  ventes: VenteDeLaJournee[];
  encaissements: EncaissementDeLaJournee[];
  depenses: DepenseDeLaJournee[];
  caisse: MouvementCaisseDeLaJournee[];
  /** `null` : le membre ne lit pas les mouvements de stock. */
  stock: MouvementStockDeLaJournee[] | null;
  maintenant: Date;
}

export interface SeauHoraire {
  heure: number;
  nombre: number;
  total: number;
}

export interface JourneeLocale {
  ventes: {
    nombre: number;
    /** En principale. */
    total: number;
    aCredit: number;
    nombreACredit: number;
    /** Ventes dont le montant est inconnu (ticket introuvable). */
    sansMontant: number;
    /** Les plus récentes d'abord. */
    lignes: VenteDeLaJournee[];
  };
  encaisse: {
    /** Remis, tous moyens confondus. */
    total: number;
    monnaie: number;
    net: number;
    parMoyen: { moyen: string; nombre: number; total: number }[];
  };
  depenses: { nombre: number; total: number; payees: number };
  caisse: { entrees: number; sorties: number; net: number };
  heures: SeauHoraire[];
  stock: {
    nombre: number;
    parType: { type: string; libelle: string; nombre: number }[];
    /** Les plus récents d'abord. */
    lignes: MouvementStockDeLaJournee[];
  } | null;
}

const MONNAIE = "change";

/** Arrondi au centime : un montant converti porte douze décimales de taux. */
const sou = (n: number): number => Math.round(n * 100) / 100;

const recentEnTete = (a: { date: Date | null }, b: { date: Date | null }) =>
  (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);

function memeJour(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Les ventes heure par heure, de la première heure vendue à l'heure courante.
 *
 * ⚠ AUCUN SEAU AU-DELÀ : un écran ouvert à 9 h ne dessine pas quinze heures à
 * venir, qui se liraient comme un effondrement.
 */
export function seauxHoraires(
  ventes: readonly VenteDeLaJournee[],
  maintenant: Date
): SeauHoraire[] {
  const par = new Map<number, { nombre: number; total: number }>();
  for (const v of ventes) {
    if (!v.date) continue;
    const h = v.date.getHours();
    const s = par.get(h) ?? { nombre: 0, total: 0 };
    s.nombre += 1;
    if (v.total !== null) s.total += v.total * v.taux;
    par.set(h, s);
  }
  if (par.size === 0) return [];
  const heures = [...par.keys()];
  const premiere = Math.min(...heures);
  let derniere = Math.max(...heures);
  const datees = ventes.filter((v) => v.date);
  if (datees.length > 0 && memeJour(datees[0].date as Date, maintenant)) {
    derniere = Math.max(derniere, maintenant.getHours());
  }
  const sortie: SeauHoraire[] = [];
  for (let h = premiere; h <= derniere; h++) {
    const s = par.get(h);
    sortie.push({ heure: h, nombre: s?.nombre ?? 0, total: sou(s?.total ?? 0) });
  }
  return sortie;
}

export function agregerLaJournee(e: EntreesJournee): JourneeLocale {
  // ── Ventes ──────────────────────────────────────────────────────────────
  let total = 0;
  let aCredit = 0;
  let nombreACredit = 0;
  let sansMontant = 0;
  for (const v of e.ventes) {
    if (v.total === null) sansMontant += 1;
    else total += v.total * v.taux;
    if (v.resteDu > 0.005) {
      aCredit += v.resteDu * v.taux;
      nombreACredit += 1;
    }
  }

  // ── Encaissé ────────────────────────────────────────────────────────────
  const moyens = new Map<string, { nombre: number; total: number }>();
  for (const p of e.encaissements) {
    const s = moyens.get(p.moyen) ?? { nombre: 0, total: 0 };
    s.nombre += 1;
    s.total += p.principal;
    moyens.set(p.moyen, s);
  }
  const parMoyen = [...moyens.entries()]
    .map(([moyen, s]) => ({ moyen, nombre: s.nombre, total: sou(s.total) }))
    .sort((a, b) => b.total - a.total);
  const remis = parMoyen.reduce((t, m) => t + m.total, 0);

  // ── Caisse ──────────────────────────────────────────────────────────────
  let entrees = 0;
  let sorties = 0;
  let monnaie = 0;
  for (const c of e.caisse) {
    if (c.direction === "in") entrees += c.principal;
    else sorties += c.principal;
    if (c.type === MONNAIE && c.direction === "out") monnaie += c.principal;
  }

  // ── Stock ───────────────────────────────────────────────────────────────
  let stock: JourneeLocale["stock"] = null;
  if (e.stock) {
    const types = new Map<string, { libelle: string; nombre: number }>();
    for (const mv of e.stock) {
      const s = types.get(mv.type) ?? { libelle: mv.libelle, nombre: 0 };
      s.nombre += 1;
      types.set(mv.type, s);
    }
    stock = {
      nombre: e.stock.length,
      parType: [...types.entries()]
        .map(([type, s]) => ({ type, libelle: s.libelle, nombre: s.nombre }))
        .sort((a, b) => b.nombre - a.nombre || a.type.localeCompare(b.type)),
      lignes: [...e.stock].sort(recentEnTete),
    };
  }

  return {
    ventes: {
      nombre: e.ventes.length,
      total: sou(total),
      aCredit: sou(aCredit),
      nombreACredit,
      sansMontant,
      lignes: [...e.ventes].sort(recentEnTete),
    },
    encaisse: {
      total: sou(remis),
      monnaie: sou(monnaie),
      net: sou(remis - monnaie),
      parMoyen,
    },
    depenses: {
      nombre: e.depenses.length,
      total: sou(e.depenses.reduce((t, d) => t + d.principal, 0)),
      payees: sou(
        e.depenses.filter((d) => d.statut === "paid").reduce((t, d) => t + d.principal, 0)
      ),
    },
    caisse: { entrees: sou(entrees), sorties: sou(sorties), net: sou(entrees - sorties) },
    heures: seauxHoraires(e.ventes, e.maintenant),
    stock,
  };
}

/**
 * La monnaie rendue sur une vente encore dans le journal, en principale.
 *
 * Le serveur la créera à la poussée (un mouvement « change ») : d'ici là, elle
 * vaut ce que les règlements dépassent du total. Sans elle, une vente payée en
 * gros billets gonflerait l'encaissé net de la journée hors ligne.
 */
export function monnaieDeLaVente(totalPrincipal: number | null, reglesPrincipal: number): number {
  if (totalPrincipal === null) return 0;
  return Math.max(0, sou(reglesPrincipal - totalPrincipal));
}

/**
 * Le ticket thermique de la journée.
 *
 * ⚠ CE N'EST PAS UN Z : aucun numéro, et rien n'est rangé dans `print_jobs`.
 */
export function ticketDeLaJournee(
  j: JourneeLocale,
  c: {
    chrome: ReceiptChrome;
    jour: string;
    arreteA: string;
    portee: string;
    devise: string;
    imprimePar?: string;
    /** Le membre lit-il les ventes ? Sinon la section n'existe pas. */
    listeVentes: boolean;
  }
): DayReportData {
  return {
    kind: "day_report",
    chrome: c.chrome,
    day: c.jour,
    closedAt: c.arreteA,
    scope: c.portee,
    printedBy: c.imprimePar,
    currency: c.devise,
    sales: { count: j.ventes.nombre, total: j.ventes.total, onCredit: j.ventes.aCredit },
    payments: [
      ...j.encaisse.parMoyen.map((p) => ({ method: p.moyen, total: p.total })),
      ...(j.encaisse.monnaie > 0.005
        ? [{ method: "Monnaie rendue", total: -j.encaisse.monnaie }]
        : []),
    ],
    expenses: { count: j.depenses.nombre, total: j.depenses.total },
    cash: { cashIn: j.caisse.entrees, cashOut: j.caisse.sorties, net: j.caisse.net },
    stock: j.stock ? j.stock.parType.map((t) => ({ label: t.libelle, count: t.nombre })) : null,
    // Le ticket se lit de la plus ancienne à la plus récente.
    lines: c.listeVentes
      ? [...j.ventes.lignes].reverse().map((v) => ({
          time: v.date
            ? `${String(v.date.getHours()).padStart(2, "0")}:${String(v.date.getMinutes()).padStart(2, "0")}`
            : "--:--",
          reference: v.reference,
          amount: v.total ?? 0,
          currency: v.devise,
          note: v.total === null ? "montant inconnu" : v.resteDu > 0.005 ? "crédit" : undefined,
        }))
      : null,
  };
}
