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
import { formatFixedFr, formatNumberFr } from "@vente-facile/core";

import { deviseOuRepli } from "./devise-principale";
import type { TonStatut } from "./statuts-vente";

export type OngletRapport =
  | "overview"
  | "daily-cash"
  | "sales"
  | "products"
  | "customers"
  | "stock"
  | "profits"
  | "user-activity";

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES CHEMINS SONT SOULIGNÉS, ET SEPT SUR HUIT ÉTAIENT ÉCRITS AVEC UN      │
 * │ TIRET. SEPT ONGLETS SUR HUIT RÉPONDAIENT DONC 404.                      │
 * │                                                                          │
 * │ `@action` sans `url_path` laisse le nom de la MÉTHODE tel quel et ne     │
 * │ remplace les soulignés que dans `url_name` : le chemin réel est          │
 * │ `sales_by_category`, jamais `sales-by-category`. Le piège est écrit      │
 * │ ailleurs dans ce dépôt, il avait coûté un 404 sans corps à des tests     │
 * │ backend - il a coûté ici toute la rubrique.                              │
 * │                                                                          │
 * │ Les chemins vivent donc dans UNE table, et `rapports-chemins.test.ts`    │
 * │ la croise avec la liste réelle du serveur. Écrits au fil des appels, ils │
 * │ étaient invérifiables : un 404 ne se distingue pas d'une rubrique vide   │
 * │ pour qui lit le code.                                                    │
 * │                                                                          │
 * │ `sales-by-packaging` est le SEUL à porter un tiret, parce qu'il est le   │
 * │ seul à déclarer un `url_path` explicite. Il n'est pas consommé ici.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Régénérer la liste de référence :
 *   docker compose exec -T vf_backend python manage.py shell -c \
 *     "from apps.reports.views import StatisticsViewSet as V; \
 *      print(sorted(a.url_path for a in V.get_extra_actions()))"
 */
export const CHEMINS_STATISTIQUES: Record<OngletRapport, string> = {
  overview: "summary",
  "daily-cash": "daily_cash_report",
  sales: "sales_by_category",
  products: "top_products",
  customers: "top_customers",
  stock: "stock_details",
  profits: "product_profits",
  "user-activity": "user_activity",
};

/**
 * Les créances sont une RUBRIQUE à elles seules, pas un onglet de rapport :
 * elles ont leur écran, leur cadran et leur liste de relance. Leur chemin vit
 * quand même ici, pour que le garde-fou de `rapports-chemins.test.ts` le
 * couvre - un chemin écrit à la main dans un appel est précisément ce qui a
 * fait répondre 404 à sept rubriques sur huit.
 */
export const CHEMIN_CREANCES = "receivables";

/**
 * L'export d'un onglet, fabriqué par le serveur.
 *
 * Il vit dans cette table pour la même raison que les autres : un chemin écrit
 * à la main dans un appel est ce qui a fait répondre 404 à sept rubriques sur
 * huit, et `rapports-chemins.test.ts` le croise avec la liste du serveur.
 */
export const CHEMIN_EXPORT = "export";

/** Le chemin complet d'un export, pour l'écran qui télécharge. */
export const URL_EXPORT = `/reports/statistics/${CHEMIN_EXPORT}/`;


/** Vingt lignes par page, comme le back-office. */
export const TAILLE_PAGE = 20;

const nb = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Un sous-objet de réponse, sans jamais supposer qu'il est là. */
const bloc = (d: Record<string, unknown>, cle: string): Record<string, unknown> => {
  const v = d[cle];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
};

/** `{results: [...]}`, une liste nue, ou rien. Les trois formes existent. */
const listeDe = (d: unknown): any[] => {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object" && Array.isArray((d as any).results)) {
    return (d as any).results;
  }
  return [];
};

/**
 * Le nombre TOTAL de lignes du périmètre, pas celui de la page.
 *
 * Le back-office écrit « (347 produits) » dans son titre et pagine par vingt :
 * lire la longueur de la page annoncerait « (20 produits) » sur un périmètre
 * qui en compte trois cent quarante-sept, et le marchand conclurait que le
 * reste a disparu.
 */
const totalDe = (d: unknown): number => {
  if (d && typeof d === "object" && !Array.isArray(d) && (d as any).count != null) {
    return nb((d as any).count);
  }
  return listeDe(d).length;
};

export interface ContexteRapport {
  organisation: string;
  /** `money.money`, pour que les montants suivent les décimales de leur devise. */
  money: (montant: number | string, devise: string) => string;
  devisePrincipale: string;
  /** Bornes INCLUSIVES, au format `AAAA-MM-JJ`. */
  debut?: string;
  fin?: string;
  /** « Grouper par » du back-office : jour, semaine ou mois. */
  groupBy?: "day" | "week" | "month";
  /** Page courante de chaque tableau, indexée par la clé de sa section. */
  pages?: Record<string, number>;
  /**
   * L'employé dont on veut l'activité. **Obligatoire** pour `user-activity` :
   * le serveur répond 400 sans lui, et cet onglet n'a pas de « tous ».
   */
  utilisateur?: string;
  /**
   * Le PÉRIMÈTRE de l'écran, appliqué à TOUS les onglets.
   *
   * ⚠ Distinct de `utilisateur` juste au-dessus, et les confondre serait un
   * défaut : celui-là est le SUJET de l'onglet « Par utilisateur », qui n'a pas
   * de « tous » ; celui-ci est un filtre facultatif que les huit onglets
   * partagent. Le serveur les lit sous deux noms différents pour cette raison.
   */
  perimetre?: { entrepot: string | null; utilisateur: string | null };
  /** Granularité de l'activité par employé. */
  granularite?: "day" | "hour";
  /**
   * La date du RAPPORT JOURNALIER, distincte de la période générale.
   *
   * Le back-office lui donne son propre champ : on consulte le Z d'hier sans
   * changer la fenêtre de tous les autres onglets.
   */
  dateJournaliere?: string;
}

function entetes(ctx: ContexteRapport) {
  return { headers: { "X-Organization-ID": ctx.organisation } };
}

/**
 * La chaîne de requête.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON ENVOIE TOUJOURS DES DATES EXPLICITES.                                 │
 * │                                                                          │
 * │ Sans elles, le serveur retombait sur son défaut. Relevé le 2 septembre   │
 * │ sur les vraies données : la fenêtre couvrait deux jours, l'établissement │
 * │ n'avait rien vendu depuis le 31 août, et les huit onglets annonçaient    │
 * │ « Aucune donnée » - pendant que la même base rendait 18 ventes sur       │
 * │ trente jours. Une fenêtre calculée ici est une fenêtre qu'on peut        │
 * │ afficher, tester et comparer au web.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function periode(
  ctx: ContexteRapport,
  opts?: { page?: number; sansPeriode?: boolean }
): string {
  const p = new URLSearchParams();
  // Le stock est un ÉTAT : le borner dans le temps n'a pas de sens, et le
  // back-office ne le fait pas non plus.
  if (!opts?.sansPeriode) {
    if (ctx.debut) p.set("date_from", ctx.debut);
    if (ctx.fin) p.set("date_to", ctx.fin);
  }
  // ⚠ LE PÉRIMÈTRE ENTRE ICI, ET NULLE PART AILLEURS. C'est le seul
  // constructeur de requête des huit onglets : l'ajouter onglet par onglet
  // garantirait qu'un onglet en manque, et un onglet qui ignore la puce
  // affichée à deux centimètres est le défaut que ce fichier a déjà payé.
  if (ctx.perimetre?.entrepot) p.set("warehouse", ctx.perimetre.entrepot);
  if (ctx.perimetre?.utilisateur) p.set("user", ctx.perimetre.utilisateur);
  if (ctx.groupBy) p.set("group_by", ctx.groupBy);
  if (opts?.page !== undefined) {
    p.set("page", String(opts.page));
    p.set("page_size", String(TAILLE_PAGE));
  }
  const q = p.toString();
  return q ? `?${q}` : "";
}

/**
 * Une ligne de LISTE (pas de tableau) : là où le back-office rend une liste
 * plutôt qu'un tableau, comme ses deux palmarès de clients.
 */
export interface LigneRapport {
  cle: string;
  titre: string;
  detail: string | null;
  valeur: string;
  sousValeur: string | null;
  /** Pastille de rang, comme les palmarès du back-office. */
  rang?: number;
  /** Ton de la sous-valeur. « Doit : X » s'écrit en rouge sur le web. */
  tonSousValeur?: TonStatut;
}

/** Une cellule de tableau. Déjà FORMATÉE : la couche data n'affiche pas. */
export interface CelluleTableau {
  texte: string;
  /** Sous-ligne en sourdine : « 1 612 au total ». */
  sous?: string | null;
  /** Pastille d'état, comme la colonne « Statut » ou le badge de marge. */
  badge?: { texte: string; ton: TonStatut };
  /** Pastille de rang, colonne « # ». */
  rang?: number;
}

export interface ColonneRapport {
  cle: string;
  entete: string;
  largeur: number;
  /** Range à droite, en chasse fixe. Voir `KIND_MEASURE` du serveur. */
  mesure?: boolean;
}

export interface TableauRapport {
  colonnes: ColonneRapport[];
  lignes: { cle: string; cellules: CelluleTableau[] }[];
  /** Nombre TOTAL de lignes sur le périmètre, pour la pagination. */
  total: number;
  page: number;
  taille: number;
}

/**
 * Une lecture graphique.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN GRAPHIQUE NE MÊLE JAMAIS DEUX DEVISES.                               │
 * │                                                                          │
 * │ Il porte donc la sienne, et l'appelant formate avec elle. C'est la règle │
 * │ déjà posée sur le `BarChart` du tableau de bord : empiler des francs et  │
 * │ des dollars dessine une courbe qui ne veut rien dire, et un graphique la │
 * │ rend plus facile à enfreindre sans qu'on s'en aperçoive.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface GrapheRapport {
  type: "aire" | "barres" | "barres-horizontales";
  devise: string;
  points: {
    cle: string;
    label: string;
    valeur: number;
    /** Seconde barre du créneau : les sorties, face aux entrées. */
    valeurSecondaire?: number;
  }[];
  /** Nomme les deux séries d'un graphique groupé. */
  legende?: { principale: string; secondaire: string };
}

/** Une tuile colorée, comme les quatre du back-office. */
export interface TuileRapport {
  cle: string;
  label: string;
  valeur: string;
  ton: TonStatut;
}

/** Une carte de synthèse, comme les quatre du rapport journalier. */
export interface CarteRapport {
  cle: string;
  label: string;
  valeur: string;
  /** Ligne d'appoint : « 18 ventes », « Marge : 32,2 % ». */
  detail?: string | null;
  ton?: TonStatut;
}

/**
 * Une SECTION du rapport : ce que le back-office met dans une carte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TERMINAL NE RENDAIT QU'UN SEUL TABLEAU PAR ONGLET.                   │
 * │                                                                          │
 * │ Le back-office en rend jusqu'à QUATRE, avec leurs graphiques : l'onglet  │
 * │ « Ventes » y porte les articles, les catégories, l'évolution ET les      │
 * │ modes de paiement. Un marchand qui compare les deux surfaces conclut     │
 * │ que le terminal a perdu des données.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface SectionRapport {
  cle: string;
  titre: string;
  sousTitre?: string | null;
  /** Décomptes affichés à droite du titre (« 2 ruptures », « 1 bas »). */
  badges?: { texte: string; ton: TonStatut }[];
  cartes?: CarteRapport[];
  tuiles?: TuileRapport[];
  graphe?: GrapheRapport;
  tableau?: TableauRapport;
  lignes?: LigneRapport[];
  /** Ce qui s'écrit quand la section n'a rien. Jamais un blanc. */
  vide: string;
}

export interface Rapport {
  sections: SectionRapport[];
}

/**
 * Les dix relevés GLOBAUX, ceux que le back-office pose au-dessus des onglets.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ILS SONT GLOBAUX, ET LE TERMINAL LES AVAIT DISPERSÉS.                   │
 * │                                                                          │
 * │ Le web les affiche quel que soit l'onglet ouvert : quatre cartes         │
 * │ principales et six relevés secondaires. Le terminal en avait mis une     │
 * │ partie DANS l'onglet « Vue d'ensemble », si bien que le chiffre          │
 * │ d'affaires disparaissait dès qu'on regardait le stock - alors que c'est  │
 * │ précisément le chiffre auquel on rapporte tout le reste.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface RelevesGlobaux {
  devise: string;
  chiffreAffaires: number;
  nbVentes: number;
  /** `sales_growth` : variation contre la période précédente. `null` si le
   *  serveur ne la fournit pas (période précédente sans vente). */
  variation: number | null;
  panierMoyen: number;
  articlesVendus: number;
  soldeCaisse: number;
  /** Le tiroir réel. Rendu SEULEMENT s'il y a plus d'une devise, comme le web. */
  soldesParDevise: { devise: string; montant: number }[];
  fluxNet: number;
  creances: number;
  clientsAvecDette: number;
  produitsActifs: number;
  valeurStock: number;
  stockBas: number;
  ruptures: number;
  clients: number;
  nouveauxClients: number;
}

export async function chargerReleves(ctx: ContexteRapport): Promise<RelevesGlobaux> {
  const d = await api.get<Record<string, unknown>>(
    `/reports/statistics/${CHEMINS_STATISTIQUES.overview}/${periode(ctx)}`,
    entetes(ctx)
  );
  const ventes = bloc(d, "sales");
  const stock = bloc(d, "stock");
  const clients = bloc(d, "customers");
  const caisse = bloc(d, "cashbook");
  const soldes: any[] = Array.isArray(caisse.balance_by_currency)
    ? (caisse.balance_by_currency as any[])
    : [];

  return {
    devise: ctx.devisePrincipale,
    chiffreAffaires: nb(ventes.total_sales),
    nbVentes: nb(ventes.total_orders),
    // `null` et non zéro : « pas de comparaison possible » n'est pas « aucune
    // évolution ». Le web ne dessine alors aucune flèche.
    variation: ventes.sales_growth == null ? null : nb(ventes.sales_growth),
    panierMoyen: nb(ventes.average_order_value),
    articlesVendus: nb(ventes.total_items_sold),
    soldeCaisse: nb(caisse.current_balance),
    soldesParDevise: soldes.map((c) => ({
      devise: deviseOuRepli(c.currency, ctx.devisePrincipale),
      montant: nb(c.balance),
    })),
    fluxNet: nb(caisse.net_flow),
    creances: nb(clients.total_receivables),
    clientsAvecDette: nb(clients.customers_with_debt),
    produitsActifs: nb(stock.total_products),
    valeurStock: nb(stock.total_stock_value),
    stockBas: nb(stock.low_stock_count),
    ruptures: nb(stock.out_of_stock_count),
    clients: nb(clients.total_customers),
    nouveauxClients: nb(clients.new_customers_period),
  };
}

/** « 09/08 » : un axe de graphique n'a pas la place d'une année. */
function etiquetteJour(iso: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}` : String(iso ?? "");
}

/**
 * « 23 BOITES + 14 AMPOULES » et, dessous, « 658 au total ».
 *
 * Le rappel du total en unités n'a de sens que pour un produit vendu PAR
 * CONTENANT, et le web le conditionne à `packaging_factor` - jamais à la
 * présence d'un « + » dans le libellé, qui manquerait « 3 casiers » tout ronds.
 */
function cellulePackagee(l: any, affichage: unknown, brut: unknown): CelluleTableau {
  return {
    texte: String(affichage ?? "").trim() || formatNumberFr(nb(brut), 0),
    sous:
      l.packaging_factor != null ? `${formatNumberFr(nb(brut), 0)} au total` : null,
  };
}

/**
 * Charge un onglet.
 *
 * Chaque onglet appelle les endpoints que le back-office appelle, et se
 * contente de RÉÉTIQUETER : aucune somme n'est refaite ici. Une addition
 * écrite dans ce fichier serait exactement la divergence qu'il existe pour
 * empêcher.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES APPELS D'UN ONGLET PARTENT EN PARALLÈLE.                            │
 * │                                                                          │
 * │ Ils ne dépendent pas les uns des autres : les enchaîner ferait quatre    │
 * │ allers-retours au lieu d'un sur une 2G congolaise, où la latence est le  │
 * │ coût dominant. Toutes les actions de ce ViewSet partagent la permission  │
 * │ `reports.view`, donc une seule ne peut échouer que par le réseau.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES NOMS DE CHAMPS SONT CEUX DU SERVEUR, ET CINQ ÉTAIENT INVENTÉS.      │
 * │                                                                          │
 * │ `total_sales` sur une catégorie (c'est `total_revenue`), `purchase_count`│
 * │ sur un client (`order_count`), `margin_percent` sur un profit            │
 * │ (`margin_percentage`), `quantity_display` sur une ligne de stock         │
 * │ (`stock_display`), et des clés à plat sur la réponse imbriquée de        │
 * │ `summary`. `nb(undefined)` rend ZÉRO : les colonnes s'affichaient donc à │
 * │ « 0 » sous des totaux justes, sans une erreur.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function chargerRapport(
  onglet: OngletRapport,
  ctx: ContexteRapport
): Promise<Rapport> {
  const D = ctx.devisePrincipale;
  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ TOUS LES MONTANTS DE CET ÉCRAN SONT CONVERTIS EN DEVISE PRINCIPALE,  │
  // │ au taux FIGÉ SUR CHAQUE FACTURE (`primary_sum` côté serveur).        │
  // │                                                                      │
  // │ Une phrase le disait sous chaque onglet ; elle est retirée sur       │
  // │ demande, et le back-office ne l'écrit pas non plus - la retirer est  │
  // │ donc aussi de la parité. La règle, elle, ne bouge pas : le seul bloc │
  // │ NATIF de la rubrique est le solde de caisse ventilé par devise, et   │
  // │ il porte son code de devise sur chaque ligne.                        │
  // └──────────────────────────────────────────────────────────────────────┘
  const m = (v: unknown) => ctx.money(nb(v), D);
  const page = (cle: string) => ctx.pages?.[cle] ?? 1;
  const lire = <T,>(chemin: string, opts?: { page?: string; sansPeriode?: boolean }) =>
    api.get<T>(
      `/reports/statistics/${chemin}/${periode(ctx, {
        page: opts?.page ? page(opts.page) : undefined,
        sansPeriode: opts?.sansPeriode,
      })}`,
      entetes(ctx)
    );

  switch (onglet) {
    // ───────────────────────────────────────────────────────────── VUE D'ENSEMBLE
    case "overview": {
      const [flux, clients] = await Promise.all([
        lire<unknown>("cash_flow"),
        lire<unknown>(CHEMINS_STATISTIQUES.customers),
      ]);
      const fluxLignes = listeDe(flux);

      return {
        sections: [
          {
            cle: "flux",
            titre: "Flux de trésorerie",
            graphe: {
              type: "barres",
              devise: D,
              legende: { principale: "Entrées", secondaire: "Sorties" },
              points: fluxLignes.map((l, i) => ({
                cle: String(l.period ?? i),
                label: etiquetteJour(l.period),
                valeur: nb(l.income),
                valeurSecondaire: nb(l.expenses),
              })),
            },
            // ┌──────────────────────────────────────────────────────────────┐
            // │ LES CHIFFRES SOUS LE GRAPHIQUE SONT L'INFOBULLE DU WEB.      │
            // │                                                              │
            // │ Le back-office lit ses valeurs au SURVOL. Il n'y a pas de    │
            // │ survol sur un téléphone, et une valeur qu'on ne peut lire    │
            // │ qu'en gardant le doigt posé n'est pas lisible du tout -      │
            // │ c'est la raison déjà écrite dans `DonutChart`, dont la       │
            // │ légende porte les montants là où le web les cache.           │
            // └──────────────────────────────────────────────────────────────┘
            lignes: fluxLignes.map((l, i) => ({
              cle: String(l.period ?? i),
              titre: etiquetteJour(l.period),
              detail: `Entrées ${m(l.income)} · Sorties ${m(l.expenses)}`,
              valeur: m(l.net),
              sousValeur: "Net",
            })),
            vide: "Aucun mouvement de caisse sur cette période.",
          },
          {
            cle: "meilleurs-clients",
            titre: "Meilleurs clients",
            // Cinq, comme le back-office : au-delà, ce n'est plus un palmarès,
            // c'est la liste des clients, et elle a son propre onglet.
            lignes: listeDe(clients)
              .slice(0, 5)
              .map((l, i) => ({
                cle: String(l.customer_id ?? i),
                rang: i + 1,
                titre: String(l.customer_name ?? "Client"),
                detail: `${nb(l.order_count)} commandes`,
                valeur: m(l.total_purchases),
                sousValeur: null,
              })),
            vide: "Aucune donnée pour cette période",
          },
        ],
      };
    }

    // ─────────────────────────────────────────────────────── RAPPORT JOURNALIER
    case "daily-cash": {
      // Cet onglet a sa PROPRE date, comme le web : on consulte le Z d'hier
      // sans changer la période de tous les autres onglets.
      const q = new URLSearchParams({ date: ctx.dateJournaliere ?? ctx.fin ?? "" });
      q.set("page", String(page("mouvements")));
      q.set("page_size", String(TAILLE_PAGE));
      const d = await api.get<Record<string, unknown>>(
        `/reports/statistics/${CHEMINS_STATISTIQUES["daily-cash"]}/?${q.toString()}`,
        entetes(ctx)
      );
      const r = bloc(d, "report");
      const mouvements = bloc(d, "movements");
      const lignes = listeDe(mouvements);

      return {
        sections: [
          {
            cle: "synthese",
            titre: "Synthèse du jour",
            cartes: [
              { cle: "ouverture", label: "Solde d'ouverture", valeur: m(r.opening_balance) },
              { cle: "cloture", label: "Solde de clôture", valeur: m(r.closing_balance) },
              {
                cle: "ventes",
                label: "Ventes du jour",
                valeur: m(r.total_sales),
                detail: `${nb(r.total_sales_count)} ventes`,
                ton: "success",
              },
              {
                cle: "depenses",
                label: "Dépenses",
                valeur: m(r.expenses),
                detail: `${nb(r.expenses_count)} dépenses`,
                ton: "destructive",
              },
            ],
            vide: "Aucun mouvement pour cette date",
          },
          {
            cle: "moyens",
            titre: "Répartition des paiements",
            // QUATRE TUILES, comme le web - et non un anneau. Elles restent
            // affichées même à zéro : « aucune vente à crédit aujourd'hui »
            // est une information, et une tuile retirée ne la donne pas.
            tuiles: [
              { cle: "cash", label: "Espèces", valeur: m(r.cash_sales), ton: "success" },
              { cle: "mobile", label: "Mobile Money", valeur: m(r.mobile_money_sales), ton: "primary" },
              { cle: "card", label: "Carte", valeur: m(r.card_sales), ton: "neutral" },
              { cle: "credit", label: "Crédit", valeur: m(r.credit_sales), ton: "warning" },
            ],
            vide: "Aucun encaissement aujourd'hui.",
          },
          {
            cle: "mouvements",
            titre: "Mouvements du jour",
            tableau: {
              colonnes: [
                // 62 points coupaient « 02:58:22 » en deux lignes : relevé à l'écran.
                { cle: "heure", entete: "Heure", largeur: 80 },
                { cle: "type", entete: "Type", largeur: 132 },
                { cle: "desc", entete: "Description", largeur: 190 },
                { cle: "in", entete: "Entrée", largeur: 104, mesure: true },
                { cle: "out", entete: "Sortie", largeur: 104, mesure: true },
                { cle: "solde", entete: "Solde", largeur: 112, mesure: true },
              ],
              lignes: lignes.map((l, i) => ({
                cle: String(l.id ?? i),
                cellules: [
                  { texte: String(l.time ?? "").slice(0, 8) },
                  {
                    texte: "",
                    badge: {
                      texte: String(l.type_display ?? l.type ?? "Mouvement"),
                      ton: l.direction === "in" ? "primary" : "destructive",
                    },
                  },
                  { texte: String(l.description ?? "-") },
                  // ENTRÉE et SORTIE dans DEUX colonnes, comme le web : un
                  // montant signé demande de lire le signe, deux colonnes se
                  // balaient. Une cellule vide dit « ce n'en est pas une ».
                  { texte: l.direction === "in" ? m(l.amount) : "" },
                  { texte: l.direction === "out" ? m(l.amount) : "" },
                  // `balance_after` n'était lu NULLE PART : c'est le solde
                  // courant du tiroir, ligne à ligne, et c'est lui qu'on suit
                  // du doigt quand on cherche où le compte a dérapé.
                  { texte: m(l.balance_after) },
                ],
              })),
              total: nb(mouvements.count),
              page: page("mouvements"),
              taille: TAILLE_PAGE,
            },
            vide: "Aucun mouvement pour cette date",
          },
        ],
      };
    }

    // ─────────────────────────────────────────────────────────────────── VENTES
    case "sales": {
      const [articles, categories, evolution, moyens] = await Promise.all([
        lire<unknown>(CHEMINS_STATISTIQUES.products, { page: "articles" }),
        lire<unknown>(CHEMINS_STATISTIQUES.sales, { page: "categories" }),
        lire<unknown>("sales_by_period"),
        lire<unknown>("sales_by_payment_method"),
      ]);
      const lArticles = listeDe(articles);
      const lCategories = listeDe(categories);
      const pts = listeDe(evolution);
      const lMoyens = listeDe(moyens);
      const depart = (page("articles") - 1) * TAILLE_PAGE;

      return {
        // L'ORDRE est celui du web : les deux tableaux, puis les deux
        // graphiques. Un marchand qui passe d'un écran à l'autre ne doit pas
        // avoir à chercher où est passé son tableau.
        sections: [
          {
            cle: "articles",
            titre: `Ventes par article (${totalDe(articles)} articles)`,
            tableau: {
              colonnes: [
                { cle: "rang", entete: "#", largeur: 40 },
                { cle: "article", entete: "Article", largeur: 160 },
                { cle: "sku", entete: "SKU", largeur: 100 },
                { cle: "qte", entete: "Quantité", largeur: 132, mesure: true },
                { cle: "revenus", entete: "Revenus", largeur: 112, mesure: true },
              ],
              lignes: lArticles.map((l, i) => ({
                cle: String(l.product_id ?? i),
                cellules: [
                  { texte: "", rang: depart + i + 1 },
                  { texte: String(l.product_name ?? "Produit") },
                  { texte: String(l.product_sku ?? "") },
                  cellulePackagee(l, l.quantity_display, l.quantity_sold),
                  { texte: m(l.total_revenue) },
                ],
              })),
              total: totalDe(articles),
              page: page("articles"),
              taille: TAILLE_PAGE,
            },
            vide: "Aucune donnée pour cette période",
          },
          {
            cle: "categories",
            titre: `Ventes par catégorie (${totalDe(categories)} catégories)`,
            tableau: {
              colonnes: [
                { cle: "cat", entete: "Catégorie", largeur: 170 },
                { cle: "qte", entete: "Quantité", largeur: 112, mesure: true },
                { cle: "revenus", entete: "Revenus", largeur: 118, mesure: true },
                { cle: "part", entete: "% du total", largeur: 92, mesure: true },
              ],
              lignes: lCategories.map((l, i) => ({
                cle: String(l.category_id ?? i),
                cellules: [
                  { texte: String(l.category_name ?? "Sans catégorie") },
                  { texte: `${formatNumberFr(nb(l.quantity_sold), 0)} unités` },
                  { texte: m(l.total_revenue) },
                  { texte: `${formatFixedFr(nb(l.percentage), 2)}%` },
                ],
              })),
              total: totalDe(categories),
              page: page("categories"),
              taille: TAILLE_PAGE,
            },
            vide: "Aucune donnée pour cette période",
          },
          {
            cle: "evolution",
            titre: "Évolution des ventes",
            graphe: {
              type: "aire",
              devise: D,
              points: pts.map((l, i) => ({
                cle: String(l.period ?? i),
                label: etiquetteJour(l.period),
                valeur: nb(l.total),
              })),
            },
            lignes: pts.map((l, i) => ({
              cle: String(l.period ?? i),
              titre: etiquetteJour(l.period),
              detail: `${nb(l.count)} ventes`,
              valeur: m(l.total),
              sousValeur: null,
            })),
            vide: "Aucune vente sur cette période.",
          },
          {
            cle: "moyens",
            titre: "Ventes par mode de paiement",
            // BARRES HORIZONTALES, comme le web (`BarChart layout="vertical"`
            // de recharts). Le terminal y avait mis un anneau : deux lectures
            // pour la même donnée, et le marchand ne retrouve pas son
            // graphique en passant d'un écran à l'autre.
            graphe: {
              type: "barres-horizontales",
              devise: D,
              points: lMoyens.map((l, i) => ({
                cle: String(l.payment_method ?? i),
                label: String(l.payment_method_name ?? "Moyen inconnu"),
                valeur: nb(l.total),
              })),
            },
            vide: "Aucun règlement sur cette période.",
          },
        ],
      };
    }

    // ───────────────────────────────────────────────────────────────── PRODUITS
    case "products": {
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ TROIS SOURCES, JOINTES COMME LE WEB LES JOINT.                   │
      // │                                                                  │
      // │ Le back-office croise `top_products` avec `stock_details` et      │
      // │ `product_supplies` pour rendre sept colonnes. Le terminal n'en    │
      // │ rendait que trois, et les quatre autres - stock de départ,        │
      // │ approvisionnement, quantité et valeur restantes - manquaient.     │
      // │                                                                  │
      // │ `stock_details` est demandé SANS période : le stock est un ÉTAT.  │
      // └──────────────────────────────────────────────────────────────────┘
      const [produits, stocks, approvs] = await Promise.all([
        lire<unknown>(CHEMINS_STATISTIQUES.products, { page: "produits" }),
        lire<unknown>(CHEMINS_STATISTIQUES.stock, { sansPeriode: true }),
        lire<Record<string, any>>("product_supplies"),
      ]);
      const lProduits = listeDe(produits);
      const parProduit = new Map<string, any>(
        listeDe(stocks).map((s) => [String(s.product_id), s])
      );

      return {
        sections: [
          {
            cle: "produits",
            titre: `Détails des produits vendus (${totalDe(produits)} produits)`,
            sousTitre:
              "Stock départ reconstitué (restant + vendu), en unités de détail",
            tableau: {
              colonnes: [
                { cle: "produit", entete: "Produit", largeur: 165 },
                { cle: "depart", entete: "Stock départ", largeur: 104, mesure: true },
                { cle: "approv", entete: "Approv.", largeur: 132, mesure: true },
                { cle: "vendue", entete: "Qté vendue", largeur: 132, mesure: true },
                { cle: "valvendue", entete: "Valeur vendue", largeur: 118, mesure: true },
                { cle: "restante", entete: "Qté restante", largeur: 132, mesure: true },
                { cle: "valrestante", entete: "Valeur restante", largeur: 122, mesure: true },
              ],
              lignes: lProduits.map((l, i) => {
                const s = parProduit.get(String(l.product_id));
                const restant = nb(s?.current_stock);
                // La reconstitution du web, recopiée et non réinventée : son
                // partage scellé/vrac d'alors n'est enregistré nulle part, il
                // se compte donc en unités de détail.
                const depart = restant + nb(l.quantity_sold);
                const a = approvs?.[String(l.product_id)];
                return {
                  cle: String(l.product_id ?? i),
                  cellules: [
                    {
                      texte: String(l.product_name ?? "Produit"),
                      sous: String(l.product_sku ?? "") || null,
                    },
                    { texte: formatNumberFr(depart, 0) },
                    {
                      texte:
                        a && nb(a.quantity) > 0
                          ? String(a.display ?? "").trim() ||
                            formatNumberFr(nb(a.quantity), 0)
                          : "-",
                    },
                    cellulePackagee(l, l.quantity_display, l.quantity_sold),
                    { texte: m(l.total_revenue) },
                    {
                      texte:
                        String(s?.stock_display ?? "").trim() ||
                        formatNumberFr(restant, 0),
                      sous:
                        s?.packaging_factor != null
                          ? `${formatNumberFr(restant, 0)} au total`
                          : null,
                    },
                    { texte: m(s?.stock_value) },
                  ],
                };
              }),
              total: totalDe(produits),
              page: page("produits"),
              taille: TAILLE_PAGE,
            },
            vide: "Aucun produit vendu pour cette période",
          },
        ],
      };
    }

    // ────────────────────────────────────────────────────────────────── CLIENTS
    case "customers": {
      const d = await lire<unknown>(CHEMINS_STATISTIQUES.customers);
      const lignes = listeDe(d);

      return {
        sections: [
          {
            cle: "meilleurs",
            titre: "Meilleurs clients",
            lignes: lignes.map((l, i) => ({
              cle: String(l.customer_id ?? i),
              rang: i + 1,
              titre: String(l.customer_name ?? "Client"),
              detail: `${nb(l.order_count)} commandes`,
              valeur: m(l.total_purchases),
              sousValeur:
                nb(l.current_balance) > 0 ? `Doit: ${m(l.current_balance)}` : null,
              tonSousValeur: "destructive",
            })),
            vide: "Aucune donnée pour cette période",
          },
          {
            cle: "achats",
            titre: "Achats par client",
            graphe: {
              type: "barres-horizontales",
              devise: D,
              // Cinq, comme le web (`topCustomers.slice(0, 5)`).
              points: lignes.slice(0, 5).map((l, i) => ({
                cle: String(l.customer_id ?? i),
                label: String(l.customer_name ?? "Client"),
                valeur: nb(l.total_purchases),
              })),
            },
            vide: "Aucune donnée pour cette période",
          },
        ],
      };
    }

    // ──────────────────────────────────────────────────────────────────── STOCK
    case "stock": {
      const [resume, details] = await Promise.all([
        lire<Record<string, unknown>>("stock_movements_summary"),
        lire<unknown>(CHEMINS_STATISTIQUES.stock, { page: "etat", sansPeriode: true }),
      ]);
      const lignes = listeDe(details);
      const ruptures = lignes.filter((s) => s.status === "out_of_stock").length;
      const bas = lignes.filter((s) => s.status === "low_stock").length;

      return {
        sections: [
          {
            cle: "resume",
            titre: "Résumé des mouvements de stock",
            sousTitre: "En unités de détail, tous produits confondus",
            // Les QUATRE du web, et pas les huit du serveur : ce sont celles
            // qu'il montre, et en montrer plus est aussi une divergence.
            tuiles: [
              { cle: "in", label: "Entrées totales", valeur: formatNumberFr(nb(resume.total_in), 0), ton: "success" },
              { cle: "out", label: "Sorties totales", valeur: formatNumberFr(nb(resume.total_out), 0), ton: "destructive" },
              { cle: "ventes", label: "Ventes", valeur: formatNumberFr(nb(resume.sales_out), 0), ton: "primary" },
              { cle: "retours", label: "Retours", valeur: formatNumberFr(nb(resume.returns_in), 0), ton: "neutral" },
            ],
            vide: "Aucun mouvement sur cette période.",
          },
          {
            cle: "etat",
            titre: `État du stock (${totalDe(details)} produits)`,
            badges: [
              { texte: `${ruptures} ruptures`, ton: "destructive" },
              { texte: `${bas} bas`, ton: "warning" },
            ],
            tableau: {
              colonnes: [
                { cle: "produit", entete: "Produit", largeur: 165 },
                { cle: "cat", entete: "Catégorie", largeur: 118 },
                { cle: "stock", entete: "Stock", largeur: 132, mesure: true },
                { cle: "dispo", entete: "Disponible", largeur: 132, mesure: true },
                { cle: "valeur", entete: "Valeur", largeur: 112, mesure: true },
                { cle: "statut", entete: "Statut", largeur: 88 },
              ],
              lignes: lignes.map((s, i) => ({
                cle: String(s.product_id ?? i),
                cellules: [
                  {
                    texte: String(s.product_name ?? "Produit"),
                    sous: String(s.product_sku ?? "") || null,
                  },
                  { texte: String(s.category_name ?? "-") },
                  {
                    texte:
                      String(s.stock_display ?? "").trim() ||
                      formatNumberFr(nb(s.current_stock), 0),
                    sous:
                      s.packaging_factor != null
                        ? `${formatNumberFr(nb(s.current_stock), 0)} au total`
                        : null,
                  },
                  {
                    texte:
                      String(s.available_display ?? "").trim() ||
                      formatNumberFr(nb(s.available_stock), 0),
                  },
                  { texte: m(s.stock_value) },
                  { texte: "", badge: badgeStatutStock(String(s.status ?? "")) },
                ],
              })),
              total: totalDe(details),
              page: page("etat"),
              taille: TAILLE_PAGE,
            },
            vide: "Aucun article en stock.",
          },
        ],
      };
    }

    // ──────────────────────────────────────────────────────────────── BÉNÉFICES
    case "profits": {
      const [marges, produits] = await Promise.all([
        lire<Record<string, unknown>>("profit_margins"),
        lire<unknown>(CHEMINS_STATISTIQUES.profits, { page: "produits" }),
      ]);

      return {
        sections: [
          {
            cle: "marges",
            titre: "Marges",
            // La phrase du back-office, mot pour mot : sans elle, personne ne
            // sait si le bénéfice est avant ou après remises et dépenses.
            sousTitre:
              "Marges calculées sur le CA hors TVA, après remises (lignes et globale). Le bénéfice net déduit les dépenses enregistrées comme payées sur la période.",
            cartes: [
              { cle: "ca", label: "CA (HT net)", valeur: m(marges.total_revenue) },
              { cle: "cout", label: "Coût des marchandises", valeur: m(marges.total_cost) },
              {
                cle: "brut",
                label: "Bénéfice brut",
                valeur: m(marges.gross_profit),
                detail: `Marge: ${formatFixedFr(nb(marges.gross_margin_percentage), 2)}%`,
                ton: "success",
              },
              {
                cle: "net",
                label: "Bénéfice net",
                valeur: m(marges.net_profit),
                detail: `Marge: ${formatFixedFr(nb(marges.net_margin_percentage), 2)}%`,
                ton: "primary",
              },
            ],
            vide: "Aucune donnée pour cette période",
          },
          {
            cle: "produits",
            titre: `Bénéfices par produit (${totalDe(produits)} produits)`,
            tableau: {
              colonnes: [
                { cle: "produit", entete: "Produit", largeur: 165 },
                { cle: "qte", entete: "Qté vendue", largeur: 132, mesure: true },
                { cle: "ca", entete: "CA (HT)", largeur: 112, mesure: true },
                { cle: "cout", entete: "Coût", largeur: 112, mesure: true },
                { cle: "benef", entete: "Bénéfice", largeur: 112, mesure: true },
                { cle: "marge", entete: "Marge", largeur: 80, mesure: true },
              ],
              lignes: listeDe(produits).map((l, i) => ({
                cle: String(l.product_id ?? i),
                cellules: [
                  {
                    texte: String(l.product_name ?? "Produit"),
                    sous: String(l.product_sku ?? "") || null,
                  },
                  cellulePackagee(l, l.quantity_display, l.quantity_sold),
                  { texte: m(l.total_revenue) },
                  { texte: m(l.total_cost) },
                  { texte: m(l.profit) },
                  { texte: "", badge: badgeMarge(nb(l.margin_percentage)) },
                ],
              })),
              total: totalDe(produits),
              page: page("produits"),
              taille: TAILLE_PAGE,
            },
            vide: "Aucune donnée pour cette période",
          },
        ],
      };
    }

    // ───────────────────────────────────────────────────────────── PAR UTILISATEUR
    case "user-activity": {
      // Le serveur répond 400 sans `user` : cet onglet n'a pas de « tous », et
      // l'écran le dit plutôt que d'envoyer une requête qu'il sait refusée.
      //
      // ⚠ La phrase du web est « Sélectionnez un utilisateur puis cliquez sur
      // « Générer » », parce que sa requête est MANUELLE. Ici l'écran recharge
      // dès qu'un filtre bouge, donc le bouton n'existe pas : promettre un
      // bouton absent laisserait le marchand le chercher.
      if (!ctx.utilisateur) {
        return {
          sections: [
            {
              cle: "choix",
              titre: "Rapport par utilisateur",
              vide: "Sélectionnez un utilisateur pour voir son activité.",
            },
          ],
        };
      }

      const q = periode(ctx);
      const d = await api.get<Record<string, any>>(
        `/reports/statistics/${CHEMINS_STATISTIQUES["user-activity"]}/${q}${
          q ? "&" : "?"
        }user=${encodeURIComponent(ctx.utilisateur)}&group_by=${
          ctx.granularite ?? "day"
        }`,
        entetes(ctx)
      );
      const ventes = bloc(d, "sales");
      const depenses = bloc(d, "expenses");
      const caisse = bloc(d, "cash");
      const detail: any[] = Array.isArray(d.breakdown) ? d.breakdown : [];
      const parHeure = bloc(d, "period").group_by === "hour";

      return {
        sections: [
          {
            cle: "synthese",
            titre: "Synthèse",
            cartes: [
              {
                cle: "ventes",
                label: "Ventes",
                valeur: m(ventes.total),
                detail: `${nb(ventes.count)} ventes`,
                ton: "success",
              },
              {
                cle: "depenses",
                label: "Dépenses créées",
                valeur: m(depenses.total),
                detail: `${nb(depenses.count)} dépenses`,
                ton: "destructive",
              },
              {
                cle: "caisse",
                label: "Entrées / Sorties caisse",
                valeur: `+${m(caisse.cash_in)} / -${m(caisse.cash_out)}`,
              },
              { cle: "net", label: "Caisse nette", valeur: m(caisse.net) },
            ],
            vide: "Aucune donnée pour cette période",
          },
          {
            cle: "detail",
            titre: `Détail des ventes (${parHeure ? "par heure" : "par jour"})`,
            graphe: {
              type: "barres",
              devise: D,
              points: detail.map((b, i) => ({
                cle: String(b.bucket ?? i),
                label: parHeure ? String(b.bucket) : etiquetteJour(b.bucket),
                valeur: nb(b.total),
              })),
            },
            tableau: {
              colonnes: [
                { cle: "bucket", entete: parHeure ? "Heure" : "Jour", largeur: 130 },
                { cle: "n", entete: "Ventes", largeur: 96, mesure: true },
                { cle: "total", entete: "Total", largeur: 130, mesure: true },
              ],
              lignes: detail.map((b, i) => ({
                cle: String(b.bucket ?? i),
                cellules: [
                  { texte: String(b.bucket ?? "") },
                  { texte: formatNumberFr(nb(b.count), 0) },
                  { texte: m(b.total) },
                ],
              })),
              total: detail.length,
              page: 1,
              taille: TAILLE_PAGE,
            },
            vide: "Aucune vente sur la période.",
          },
        ],
      };
    }
  }
}

/** Les trois seuils du back-office : ≥ 30 vert, ≥ 15 jaune, sinon rouge. */
function badgeMarge(pct: number): { texte: string; ton: TonStatut } {
  return {
    texte: `${formatFixedFr(pct, 2)}%`,
    ton: pct >= 30 ? "success" : pct >= 15 ? "warning" : "destructive",
  };
}

/** « Rupture » / « Bas » / « OK », et leurs tons, comme le back-office. */
function badgeStatutStock(statut: string): { texte: string; ton: TonStatut } {
  if (statut === "out_of_stock") return { texte: "Rupture", ton: "destructive" };
  if (statut === "low_stock") return { texte: "Bas", ton: "warning" };
  return { texte: "OK", ton: "success" };
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
  /**
   * Le téléphone, JOINT DEPUIS LA BASE LOCALE, jamais rendu par le rapport.
   *
   * Un écran de créances existe pour RELANCER, et relancer se fait au
   * téléphone : sans numéro, le marchand lit un nom puis rouvre la fiche du
   * client pour y trouver ce qu'il cherchait. La jointure est une lecture
   * d'IDENTITÉ sur `customers`, pas un calcul : aucun montant n'en sort, donc
   * la règle « les agrégats ne se recalculent pas sur le terminal » tient.
   *
   * `null` quand le client n'a pas de numéro enregistré, ou qu'il n'est pas
   * encore descendu sur ce terminal. L'écran retire alors le bouton plutôt
   * que d'ouvrir un composeur vide.
   */
  telephone: string | null;
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
  /**
   * Le jour où le serveur a arrêté ce rapport (`as_of`).
   *
   * Il n'était pas lu, et c'est un manque propre au terminal : le back-office
   * est en ligne par construction, celui-ci ne l'est pas. Un marchand qui
   * regarde une balance âgée doit savoir de QUAND elle date, faute de quoi il
   * relance sur des chiffres d'avant-hier sans le savoir. Même règle que le
   * verrou d'inventaire du comptoir, qui dit « état arrêté à 14:07 ».
   */
  arreteAu: string | null;
  /**
   * Les DEUX SEULS chiffres convertis, et ils sont nommés comme tels.
   *
   * Ils étaient rendus par le serveur (`total_primary`, `overdue_primary`) et
   * jetés ici, si bien que le cadran ne portait que des DÉCOMPTES : combien de
   * clients, combien de factures. La première question qu'on se pose devant un
   * écran de créances est « combien me doit-on », et elle n'avait pas de
   * réponse - il fallait lire les cartes par devise et faire la somme de tête,
   * c'est-à-dire faire soi-même l'addition inter-devises que tout le reste de
   * l'écran interdit.
   */
  totalPrincipal: number;
  echuPrincipal: number;
  /** La devise dans laquelle les deux chiffres ci-dessus sont exprimés. */
  devisePrincipale: string;
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
  // ⚠ `periode(ctx, { sansPeriode: true })` et non une chaîne nue : une créance
  // est due AUJOURD'HUI, elle n'a pas de fenêtre - mais elle a bien un
  // PÉRIMÈTRE, et c'est ce constructeur qui le pose.
  const d = await api.get<any>(
    `/reports/statistics/${CHEMIN_CREANCES}/${periode(ctx, { sansPeriode: true })}`,
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
    arreteAu: typeof d.as_of === "string" && d.as_of ? d.as_of : null,
    totalPrincipal: nb(d.total_primary),
    echuPrincipal: nb(d.overdue_primary),
    devisePrincipale: deviseOuRepli(d.primary_currency, ctx.devisePrincipale),
    nbDebiteurs: nb(d.debtor_count),
    nbFactures: nb(d.invoice_count),
    parDevise: parDevise.map((c) => ({
      // `?? ` ne se déclenche pas sur une chaîne VIDE renvoyée par l'API :
      // seul `null` et `undefined` l'activent, et le serveur peut rendre "".
      devise: deviseOuRepli(c.currency, ctx.devisePrincipale),
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
      // Renseigné après coup par l'appelant, depuis la base locale : cette
      // fonction ne parle qu'au serveur, et le serveur ne rend pas les
      // numéros - à raison, un rapport n'a pas à transporter un annuaire.
      telephone: null,
      devise: deviseOuRepli(b.currency, ctx.devisePrincipale),
      montant: nb(b.amount_due),
      echu: nb(b.overdue_amount),
      nbFactures: nb(b.invoice_count),
      plusAncienneJours: nb(b.oldest_days),
    })),
  };
}
