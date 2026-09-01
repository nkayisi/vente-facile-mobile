/**
 * Rapports et statistiques, servis par le SERVEUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES AGRÉGATS NE SE RECALCULENT PAS SUR LE TERMINAL.                     │
 * │                                                                          │
 * │ Le back-office les tire de `/reports/statistics/*`, dont les définitions │
 * │ sont subtiles : périmètre entrepôt, portée par créateur pour un          │
 * │ caissier, bornes de dates en heure locale, conversions inter-devises.    │
 * │ Les réécrire ici produirait deux chiffres pour le même établissement, et │
 * │ le marchand n'aurait aucun moyen de savoir lequel a raison. Le lot 5bis  │
 * │ a déjà montré ce que ça coûte.                                          │
 * │                                                                          │
 * │ CONSÉQUENCE ASSUMÉE : les rapports EXIGENT le réseau. C'est acceptable - │
 * │ un rapport est un outil d'analyse, pas un geste de comptoir. Ce qui doit │
 * │ marcher hors ligne, c'est vendre et encaisser, et cela marche.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { api } from "@/api/client";

export type OngletRapport =
  | "overview"
  | "daily-cash"
  | "sales"
  | "products"
  | "customers"
  | "stock"
  | "profits"
  | "user-activity";

/** Une ligne de tableau, telle qu'un rapport la rend. */
export interface LigneRapport {
  cle: string;
  titre: string;
  detail: string | null;
  valeur: string;
  sousValeur: string | null;
}

export interface Rapport {
  /** Cartes de synthèse, en tête. */
  releves: { label: string; valeur: string }[];
  lignes: LigneRapport[];
  /** Ce que le tableau liste, au singulier et au pluriel. */
  quoi: string;
}

const nb = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

interface ContexteRapport {
  organisation: string;
  /** `money.money`, pour que les montants suivent les décimales de leur devise. */
  money: (montant: number | string, devise: string) => string;
  devisePrincipale: string;
  debut?: string;
  fin?: string;
}

function entetes(ctx: ContexteRapport) {
  return { headers: { "X-Organization-ID": ctx.organisation } };
}

function periode(ctx: ContexteRapport): string {
  const p = new URLSearchParams();
  if (ctx.debut) p.set("date_from", ctx.debut);
  if (ctx.fin) p.set("date_to", ctx.fin);
  const q = p.toString();
  return q ? `?${q}` : "";
}

/**
 * Charge un onglet.
 *
 * Chaque onglet appelle l'endpoint que le back-office appelle, et se contente
 * de RÉÉTIQUETER : aucune somme n'est refaite ici. Une addition écrite dans ce
 * fichier serait exactement la divergence qu'il existe pour empêcher.
 */
export async function chargerRapport(
  onglet: OngletRapport,
  ctx: ContexteRapport
): Promise<Rapport> {
  const q = periode(ctx);

  switch (onglet) {
    case "overview": {
      const d = await api.get<Record<string, unknown>>(
        `/reports/statistics/summary/${q}`,
        entetes(ctx)
      );
      return {
        quoi: "indicateur",
        releves: [
          { label: "Ventes", valeur: ctx.money(nb(d.total_sales), ctx.devisePrincipale) },
          { label: "Transactions", valeur: String(nb(d.total_transactions)) },
          { label: "Clients", valeur: String(nb(d.total_customers)) },
          { label: "Produits", valeur: String(nb(d.total_products)) },
        ],
        lignes: [],
      };
    }

    case "daily-cash": {
      const d = await api.get<Record<string, any>>(
        `/reports/statistics/daily-cash-report/${q}`,
        entetes(ctx)
      );
      const parDevise: any[] = Array.isArray(d.currencies) ? d.currencies : [];
      return {
        quoi: "devise",
        releves: [
          { label: "Ventes du jour", valeur: String(nb(d.sales_count)) },
        ],
        lignes: parDevise.map((c) => ({
          cle: String(c.currency),
          titre: String(c.currency),
          detail: `Ouverture ${ctx.money(nb(c.opening_balance), c.currency)}`,
          valeur: ctx.money(nb(c.closing_balance ?? c.expected_balance), c.currency),
          sousValeur: "Solde",
        })),
      };
    }

    case "sales": {
      const d = await api.get<any>(
        `/reports/statistics/sales-by-category/${q}`,
        entetes(ctx)
      );
      const lignes: any[] = Array.isArray(d) ? d : (d.results ?? []);
      return {
        quoi: "catégorie",
        releves: [],
        lignes: lignes.map((l, i) => ({
          cle: String(l.category_id ?? i),
          titre: String(l.category_name ?? "Sans catégorie"),
          detail: `${nb(l.quantity_sold)} vendus`,
          valeur: ctx.money(nb(l.total_sales), ctx.devisePrincipale),
          sousValeur: null,
        })),
      };
    }

    case "products": {
      const d = await api.get<any>(
        `/reports/statistics/top-products/${q}`,
        entetes(ctx)
      );
      const lignes: any[] = Array.isArray(d) ? d : (d.results ?? []);
      return {
        quoi: "produit",
        releves: [],
        lignes: lignes.map((l, i) => ({
          cle: String(l.product_id ?? i),
          titre: String(l.product_name ?? "Produit"),
          // `quantity_display` porte la lecture en contenants quand le serveur
          // la connaît : la refaire ici la ferait diverger.
          detail: String(l.quantity_display ?? `${nb(l.quantity_sold)} vendus`),
          valeur: ctx.money(nb(l.total_revenue ?? l.total_sales), ctx.devisePrincipale),
          sousValeur: null,
        })),
      };
    }

    case "customers": {
      const d = await api.get<any>(
        `/reports/statistics/top-customers/${q}`,
        entetes(ctx)
      );
      const lignes: any[] = Array.isArray(d) ? d : (d.results ?? []);
      return {
        quoi: "client",
        releves: [],
        lignes: lignes.map((l, i) => ({
          cle: String(l.customer_id ?? i),
          titre: String(l.customer_name ?? "Client"),
          detail: `${nb(l.purchase_count)} achats`,
          valeur: ctx.money(nb(l.total_purchases), ctx.devisePrincipale),
          sousValeur: null,
        })),
      };
    }

    case "stock": {
      const d = await api.get<any>(
        `/reports/statistics/stock-details/`,
        entetes(ctx)
      );
      const lignes: any[] = Array.isArray(d) ? d : (d.results ?? []);
      return {
        quoi: "article",
        releves: [],
        lignes: lignes.slice(0, 100).map((l, i) => ({
          cle: String(l.product_id ?? i),
          titre: String(l.product_name ?? "Produit"),
          detail: String(l.warehouse_name ?? ""),
          valeur: String(l.quantity_display ?? nb(l.quantity)),
          sousValeur: ctx.money(nb(l.stock_value), ctx.devisePrincipale),
        })),
      };
    }

    case "profits": {
      const d = await api.get<any>(
        `/reports/statistics/product-profits/${q}`,
        entetes(ctx)
      );
      const lignes: any[] = Array.isArray(d) ? d : (d.results ?? []);
      return {
        quoi: "produit",
        releves: [],
        lignes: lignes.map((l, i) => ({
          cle: String(l.product_id ?? i),
          titre: String(l.product_name ?? "Produit"),
          detail:
            l.margin_percent != null ? `Marge ${nb(l.margin_percent).toFixed(1)} %` : null,
          valeur: ctx.money(nb(l.profit), ctx.devisePrincipale),
          sousValeur: null,
        })),
      };
    }

    case "user-activity": {
      const d = await api.get<any>(
        `/reports/statistics/user-activity/${q}`,
        entetes(ctx)
      );
      const lignes: any[] = Array.isArray(d) ? d : (d.results ?? []);
      return {
        quoi: "utilisateur",
        releves: [],
        lignes: lignes.map((l, i) => ({
          cle: String(l.user_id ?? i),
          titre: String(l.user_name ?? l.full_name ?? "Utilisateur"),
          detail: `${nb(l.sales_count)} ventes`,
          valeur: ctx.money(nb(l.total_sales), ctx.devisePrincipale),
          sousValeur: null,
        })),
      };
    }
  }
}

/**
 * Créances, ventilées par devise ET par ancienneté.
 *
 * Le rapport le plus important pour un marchand qui vend à crédit, et celui
 * que le back-office a mis le plus longtemps à obtenir juste : additionner
 * des dettes en francs et en dollars produit un nombre qui n'existe pas.
 */
/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES CINQ TRANCHES SONT CELLES DU SERVEUR, ET ELLES ONT SES NOMS.        │
 * │                                                                          │
 * │ Cette lecture inventait quatre champs - `days_30_60`, `days_60_90`,      │
 * │ `days_90_plus` - qui n'existent nulle part : le serveur rend `current`,  │
 * │ `d1_30`, `d31_60`, `d61_90`, `d90_plus`. Trois tranches sur quatre       │
 * │ valaient donc `undefined`, que `nb()` rend ZÉRO.                         │
 * │                                                                          │
 * │ Relevé à l'écran : « 9 923,43 $ » de créances, et les quatre tranches à  │
 * │ « 0 $ ». C'est-à-dire, pour qui le lit, « rien n'est en retard » - très  │
 * │ exactement le contraire de la vérité, sur le seul écran dont le métier   │
 * │ est de dire qui relancer. Un chiffre faux crie ; quatre zéros sous un    │
 * │ total juste ne se remarquent pas.                                        │
 * │                                                                          │
 * │ La quatrième était fausse autrement : « 0-30 j » lisait `current`, qui   │
 * │ est le PAS ENCORE ÉCHU. Une facture en retard de dix jours n'apparaissait│
 * │ donc dans aucune tranche, et confondre « pas encore dû » avec « en       │
 * │ retard d'un mois » est la distinction même que ce rapport existe pour    │
 * │ porter. Les cinq clés et leurs libellés sont ceux du back-office, mot    │
 * │ pour mot (`AGING_BUCKET_LABELS`).                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type CleTranche = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";

const LIBELLES_TRANCHES: Record<CleTranche, string> = {
  current: "Pas encore échu",
  d1_30: "1 à 30 j",
  d31_60: "31 à 60 j",
  d61_90: "61 à 90 j",
  d90_plus: "Plus de 90 j",
};

const ORDRE_TRANCHES: CleTranche[] = ["current", "d1_30", "d31_60", "d61_90", "d90_plus"];

export interface Debiteur {
  clientId: string;
  nom: string;
  devise: string;
  /** Tout ce qu'il doit dans cette devise, échu ou non. */
  montant: number;
  /** La part déjà échue. Zéro : il doit, mais rien n'est en retard. */
  echu: number;
  nbFactures: number;
  /** Jours de retard de sa facture la plus ancienne. Zéro : rien n'est échu. */
  plusAncienneJours: number;
}

export interface Creances {
  parDevise: {
    devise: string;
    total: number;
    tranches: { cle: CleTranche; label: string; montant: number }[];
  }[];
  /** Qui doit, et depuis quand. C'est la liste avec laquelle on relance. */
  debiteurs: Debiteur[];
  nbDebiteurs: number;
  nbFactures: number;
}

export async function chargerCreances(ctx: ContexteRapport): Promise<Creances> {
  const d = await api.get<any>(
    `/reports/statistics/receivables/`,
    entetes(ctx)
  );
  const parDevise: any[] = Array.isArray(d.by_currency)
    ? d.by_currency
    : Array.isArray(d)
      ? d
      : [];

  // Le serveur DIT ses tranches et leur ordre ; on ne les redécide pas ici.
  // Le repli n'est là que pour une réponse tronquée : il porte les mêmes clés.
  const cles: CleTranche[] = Array.isArray(d.buckets)
    ? d.buckets.filter((b: unknown): b is CleTranche => typeof b === "string" && b in LIBELLES_TRANCHES)
    : ORDRE_TRANCHES;

  const debiteurs: any[] = Array.isArray(d.by_customer) ? d.by_customer : [];

  return {
    nbDebiteurs: nb(d.debtor_count),
    nbFactures: nb(d.invoice_count),
    parDevise: parDevise.map((c) => ({
      devise: String(c.currency ?? ctx.devisePrincipale),
      total: nb(c.total),
      tranches: cles.map((cle) => ({
        cle,
        label: LIBELLES_TRANCHES[cle],
        montant: nb(c[cle]),
      })),
    })),
    debiteurs: debiteurs.map((b) => ({
      clientId: String(b.customer_id ?? ""),
      nom: String(b.customer_name ?? "Client"),
      devise: String(b.currency ?? ctx.devisePrincipale),
      montant: nb(b.amount_due),
      echu: nb(b.overdue_amount),
      nbFactures: nb(b.invoice_count),
      plusAncienneJours: nb(b.oldest_days),
    })),
  };
}
