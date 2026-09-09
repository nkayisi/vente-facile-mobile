/**
 * Les huit rubriques, contre les VRAIES réponses du serveur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CES TESTS DÉFENDENT : DES CHAMPS INVENTÉS, ET `nb(undefined)`.   │
 * │                                                                          │
 * │ Cinq noms de champs étaient inventés, et `nb(undefined)` rend ZÉRO : les │
 * │ colonnes s'affichaient donc à « 0 » sous des totaux justes, SANS UNE     │
 * │ ERREUR. La vue d'ensemble lisait des clés à plat sur une réponse         │
 * │ imbriquée et rendait quatre zéros ; les catégories lisaient              │
 * │ `total_sales` (c'est `total_revenue`), les clients `purchase_count`      │
 * │ (`order_count`), les profits `margin_percent` (`margin_percentage`), le  │
 * │ stock `quantity_display` (`stock_display`).                              │
 * │                                                                          │
 * │ Les charges utiles sont RELEVÉES sur le vrai serveur, jamais inventées : │
 * │ un test écrit sur une réponse imaginée valide l'imagination, et c'est    │
 * │ exactement ce qui a laissé passer les cinq champs faux.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const mockGet = jest.fn();
jest.mock("@/api/client", () => ({ api: { get: (...a: unknown[]) => mockGet(...a) } }));

import { chargerRapport, chargerReleves } from "./rapports";

const CTX = {
  organisation: "org",
  money: (m: string | number, d: string) => `${Number(m)} ${d}`,
  devisePrincipale: "USD",
  debut: "2026-08-03",
  fin: "2026-09-02",
  groupBy: "day" as const,
  utilisateur: "u1",
};

/** Relevé sur `GET /reports/statistics/summary/`. IMBRIQUÉ, en quatre groupes. */
const SUMMARY = {
  sales: {
    total_sales: "560740.70",
    total_orders: 18,
    average_order_value: "31152.26",
    total_items_sold: 901,
    sales_growth: "12.50",
  },
  stock: {
    total_products: 100,
    total_stock_value: "2006013.72",
    low_stock_count: 3,
    out_of_stock_count: 2,
  },
  cashbook: {
    current_balance: "618909.65",
    net_flow: "550827.95",
    balance_by_currency: [
      { currency: "CDF", balance: "18178626.40" },
      { currency: "USD", balance: "611005.90" },
    ],
  },
  customers: {
    total_customers: 1,
    total_receivables: "9907.43",
    customers_with_debt: 1,
    new_customers_period: 1,
  },
};

const TOP_PRODUCTS = {
  count: 47,
  results: [
    {
      product_id: "p1",
      product_name: "Autre test gros",
      product_sku: "AUTRET-0639",
      quantity_sold: 658,
      quantity_display: "23 BOITES + 14 AMPOULES",
      packaging_factor: 28,
      total_revenue: "658.00",
    },
  ],
};

const STOCK_DETAILS = {
  count: 6,
  results: [
    {
      product_id: "p1",
      product_name: "Autre test gros",
      product_sku: "AUTRET-0639",
      category_name: "F",
      current_stock: "296.000",
      stock_display: "8 BOITES + 72 AMPOULES",
      available_stock: "296.000",
      available_display: "8 BOITES + 72 AMPOULES",
      packaging_factor: 28,
      stock_value: "242.72",
      status: "out_of_stock",
    },
  ],
};

function repondre(parChemin: Record<string, unknown>) {
  mockGet.mockImplementation((url: string) => {
    for (const [chemin, corps] of Object.entries(parChemin)) {
      if (url.includes(`/statistics/${chemin}/`)) return Promise.resolve(corps);
    }
    return Promise.reject(new Error(`chemin non prévu par le test : ${url}`));
  });
}

beforeEach(() => mockGet.mockReset());

describe("les requêtes", () => {
  it("aucune rubrique n'appelle un chemin à tirets", async () => {
    // Sept sur huit répondaient 404.
    const onglets = [
      "overview", "daily-cash", "sales", "products",
      "customers", "stock", "profits", "user-activity",
    ] as const;
    for (const onglet of onglets) {
      mockGet.mockReset();
      mockGet.mockResolvedValue({ results: [] });
      await chargerRapport(onglet, CTX);
      for (const appel of mockGet.mock.calls) {
        const chemin = String(appel[0]).split("/statistics/")[1].split("/")[0];
        expect(chemin).not.toMatch(/-/);
      }
    }
  });

  it("les dates et le groupement partent EXPLICITEMENT", async () => {
    // Sans dates, le serveur retombait sur `period=month`, calendaire : deux
    // jours le 2 du mois, donc « Aucune donnée » sur toutes les rubriques.
    mockGet.mockResolvedValue({ results: [] });
    await chargerRapport("sales", CTX);
    for (const appel of mockGet.mock.calls) {
      expect(String(appel[0])).toContain("date_from=2026-08-03");
      expect(String(appel[0])).toContain("date_to=2026-09-02");
      expect(String(appel[0])).toContain("group_by=day");
    }
  });

  it("le STOCK n'est PAS borné dans le temps : c'est un état", async () => {
    mockGet.mockResolvedValue({ results: [] });
    await chargerRapport("stock", CTX);
    const appelStock = mockGet.mock.calls.find((a) =>
      String(a[0]).includes("stock_details")
    );
    expect(String(appelStock?.[0])).not.toContain("date_from");
  });

  it("l'employé n'est envoyé QUE là où le serveur l'exige", async () => {
    mockGet.mockResolvedValue({ sales: {}, expenses: {}, cash: {}, period: {} });
    await chargerRapport("user-activity", CTX);
    expect(String(mockGet.mock.calls[0][0])).toContain("user=u1");

    mockGet.mockReset();
    mockGet.mockResolvedValue({ results: [] });
    await chargerRapport("products", CTX);
    for (const a of mockGet.mock.calls) expect(String(a[0])).not.toContain("user=");
  });

  it("les tableaux paginés demandent VINGT lignes, à leur page", async () => {
    mockGet.mockResolvedValue({ results: [], count: 0 });
    await chargerRapport("sales", { ...CTX, pages: { articles: 3 } });
    const appel = mockGet.mock.calls.find((a) => String(a[0]).includes("top_products"));
    expect(String(appel?.[0])).toContain("page=3");
    expect(String(appel?.[0])).toContain("page_size=20");
  });
});

describe("les relevés globaux", () => {
  it("lisent les groupes IMBRIQUÉS, et non des clés à plat", async () => {
    mockGet.mockResolvedValue(SUMMARY);
    const r = await chargerReleves(CTX);
    // Quatre zéros s'affichaient ici, indéfiniment, sans une erreur.
    expect(r.chiffreAffaires).toBe(560740.7);
    expect(r.nbVentes).toBe(18);
    expect(r.panierMoyen).toBe(31152.26);
    expect(r.articlesVendus).toBe(901);
    expect(r.produitsActifs).toBe(100);
    expect(r.clients).toBe(1);
  });

  it("portent les SIX relevés secondaires du back-office", async () => {
    mockGet.mockResolvedValue(SUMMARY);
    const r = await chargerReleves(CTX);
    expect(r.valeurStock).toBe(2006013.72);
    expect(r.stockBas).toBe(3);
    expect(r.ruptures).toBe(2);
    expect(r.nouveauxClients).toBe(1);
    expect(r.creances).toBe(9907.43);
    expect(r.clientsAvecDette).toBe(1);
  });

  it("rendent les soldes de caisse dans LEUR devise, jamais convertis", async () => {
    // Un tiroir contient des liasses distinctes ; les additionner, ou les
    // réétiqueter en devise principale, ne décrit aucun tiroir.
    mockGet.mockResolvedValue(SUMMARY);
    const r = await chargerReleves(CTX);
    expect(r.soldesParDevise).toEqual([
      { devise: "CDF", montant: 18178626.4 },
      { devise: "USD", montant: 611005.9 },
    ]);
  });

  it("une variation absente reste `null`, jamais zéro", async () => {
    // « Pas de comparaison possible » n'est pas « aucune évolution » : le web
    // ne dessine alors aucune flèche, et un zéro en inventerait une.
    mockGet.mockResolvedValue({
      ...SUMMARY,
      sales: { ...SUMMARY.sales, sales_growth: null },
    });
    expect((await chargerReleves(CTX)).variation).toBeNull();
  });
});

describe("les noms de champs sont ceux du serveur", () => {
  it("une catégorie porte `total_revenue`, pas `total_sales`", async () => {
    repondre({
      sales_by_period: { results: [] },
      sales_by_category: {
        count: 2,
        results: [
          {
            category_id: "k1",
            category_name: "SPECIALITE",
            total_revenue: "560287.70",
            quantity_sold: "243.00",
            percentage: "99.88",
          },
        ],
      },
      sales_by_payment_method: { results: [] },
      top_products: { results: [], count: 0 },
    });
    const r = await chargerRapport("sales", CTX);
    const t = r.sections.find((s) => s.cle === "categories")!.tableau!;
    // La colonne s'affichait « 0 USD » sous un total juste.
    expect(t.lignes[0].cellules[2].texte).toBe("560287.7 USD");
    expect(t.lignes[0].cellules[3].texte).toBe("99,88%");
  });

  it("un client porte `order_count`, pas `purchase_count`", async () => {
    repondre({
      top_customers: {
        results: [
          {
            customer_id: "c1",
            customer_name: "Nelly Kayisi",
            total_purchases: "106195.40",
            order_count: 11,
            current_balance: "9907.43",
          },
        ],
      },
    });
    const r = await chargerRapport("customers", CTX);
    const l = r.sections[0].lignes![0];
    // « 0 commandes » s'affichait à côté d'un total juste.
    expect(l.detail).toBe("11 commandes");
    expect(l.rang).toBe(1);
    expect(l.sousValeur).toBe("Doit: 9907.43 USD");
  });

  it("un profit porte `margin_percentage`, et son badge a trois seuils", async () => {
    repondre({
      profit_margins: {
        total_revenue: "560672.70",
        total_cost: "380301.46",
        gross_profit: "180371.24",
        gross_margin_percentage: "32.17",
        total_expenses: "1.52",
        net_profit: "180369.72",
        net_margin_percentage: "32.17",
      },
      product_profits: {
        count: 3,
        results: [
          { product_id: "a", product_name: "Vert", profit: "1", total_revenue: "1", total_cost: "0", margin_percentage: "42.94" },
          { product_id: "b", product_name: "Jaune", profit: "1", total_revenue: "1", total_cost: "0", margin_percentage: "18.00" },
          { product_id: "c", product_name: "Rouge", profit: "1", total_revenue: "1", total_cost: "0", margin_percentage: "9.50" },
        ],
      },
    });
    const r = await chargerRapport("profits", CTX);
    const t = r.sections.find((s) => s.cle === "produits")!.tableau!;
    // La marge était simplement ABSENTE de chaque ligne.
    expect(t.lignes.map((l) => l.cellules[5].badge)).toEqual([
      { texte: "42,94%", ton: "success" },
      { texte: "18,00%", ton: "warning" },
      { texte: "9,50%", ton: "destructive" },
    ]);
    // Et les marges globales n'étaient pas rendues du tout.
    const cartes = r.sections.find((s) => s.cle === "marges")!.cartes!;
    expect(cartes.map((c) => c.label)).toEqual([
      "CA (HT net)", "Coût des marchandises", "Bénéfice brut", "Bénéfice net",
    ]);
    expect(cartes[2].detail).toBe("Marge: 32,17%");
  });

  it("une ligne de stock porte `stock_display`, et son statut est un badge", async () => {
    repondre({
      stock_movements_summary: { total_in: "1184.000", total_out: "-895.000", sales_out: "-895.000", returns_in: "2.000" },
      stock_details: STOCK_DETAILS,
    });
    const r = await chargerRapport("stock", CTX);
    const t = r.sections.find((s) => s.cle === "etat")!.tableau!;
    // La colonne rendait la quantité brute pour tous les articles.
    expect(t.lignes[0].cellules[2].texte).toBe("8 BOITES + 72 AMPOULES");
    expect(t.lignes[0].cellules[2].sous).toBe("296 au total");
    // `available_display` n'était lu nulle part.
    expect(t.lignes[0].cellules[3].texte).toBe("8 BOITES + 72 AMPOULES");
    expect(t.lignes[0].cellules[5].badge).toEqual({ texte: "Rupture", ton: "destructive" });
  });

  it("le rapport journalier lit `report` et `movements`, pas `currencies`", async () => {
    repondre({
      daily_cash_report: {
        report: {
          total_sales_count: 0, total_sales: "0.00",
          cash_sales: "0.00", mobile_money_sales: "0.00",
          card_sales: "0.00", credit_sales: "0.00",
          expenses: "2.00", expenses_count: 1, net_cash_flow: "-2.00",
          opening_balance: "618911.65", closing_balance: "618909.65",
        },
        movements: {
          count: 1,
          results: [
            {
              id: "m1", type_display: "Remboursement client",
              description: "Remboursement retour RET20260830-0001",
              amount: "2.00", direction: "out",
              balance_after: "611005.90", time: "02:58:22.295000",
            },
          ],
        },
      },
    });
    const r = await chargerRapport("daily-cash", CTX);
    const t = r.sections.find((s) => s.cle === "mouvements")!.tableau!;
    // ENTRÉE et SORTIE dans DEUX colonnes, comme le web : une cellule vide dit
    // « ce n'en est pas une », là où un montant signé demande de lire le signe.
    expect(t.lignes[0].cellules[3].texte).toBe("");
    expect(t.lignes[0].cellules[4].texte).toBe("2 USD");
    // `balance_after` n'était lu NULLE PART : c'est le solde du tiroir ligne à
    // ligne, celui qu'on suit du doigt quand on cherche où le compte a dérapé.
    expect(t.lignes[0].cellules[5].texte).toBe("611005.9 USD");
    expect(t.lignes[0].cellules[0].texte).toBe("02:58:22");
  });

  it("l'activité par utilisateur est un OBJET, pas une liste", async () => {
    repondre({
      user_activity: {
        user: { id: "u1", name: "Nelson" },
        period: { group_by: "day" },
        sales: { count: 18, total: 560740.7 },
        expenses: { count: 1, total: 1.52 },
        cash: { cash_in: 550836.47, cash_out: 3.52, net: 550832.95 },
        breakdown: [{ bucket: "2026-08-09", count: 1, total: 7509.5 }],
      },
    });
    const r = await chargerRapport("user-activity", CTX);
    // La lecture attendait un tableau et rendait donc TOUJOURS vide.
    const cartes = r.sections.find((s) => s.cle === "synthese")!.cartes!;
    expect(cartes[0]).toMatchObject({ label: "Ventes", detail: "18 ventes" });
    expect(cartes[2].valeur).toBe("+550836.47 USD / -3.52 USD");
    expect(r.sections.find((s) => s.cle === "detail")!.tableau!.lignes).toHaveLength(1);
  });

  it("sans utilisateur choisi, on n'appelle même pas le serveur", async () => {
    // Il répond 400 : l'écran le DIT plutôt que d'envoyer une requête qu'il
    // sait refusée, et de traduire ce refus en bandeau d'erreur rouge.
    const r = await chargerRapport("user-activity", { ...CTX, utilisateur: undefined });
    expect(mockGet).not.toHaveBeenCalled();
    expect(r.sections[0].vide).toContain("Sélectionnez un utilisateur");
  });
});

describe("l'onglet Produits joint trois sources, comme le web", () => {
  it("reconstitue le stock de départ et rend les sept colonnes", async () => {
    repondre({
      top_products: TOP_PRODUCTS,
      stock_details: STOCK_DETAILS,
      product_supplies: {
        p1: { quantity: 954, display: "34 BOITES + 2 AMPOULES", packages: 34, loose: 2 },
      },
    });
    const r = await chargerRapport("products", CTX);
    const t = r.sections[0].tableau!;
    expect(t.colonnes.map((c) => c.entete)).toEqual([
      "Produit", "Stock départ", "Approv.", "Qté vendue",
      "Valeur vendue", "Qté restante", "Valeur restante",
    ]);
    const c = t.lignes[0].cellules;
    expect(c[0]).toEqual({ texte: "Autre test gros", sous: "AUTRET-0639" });
    // 296 restants + 658 vendus : la reconstitution du web, recopiée.
    expect(c[1].texte).toBe("954");
    expect(c[2].texte).toBe("34 BOITES + 2 AMPOULES");
    expect(c[3]).toEqual({ texte: "23 BOITES + 14 AMPOULES", sous: "658 au total" });
    expect(c[5]).toEqual({ texte: "8 BOITES + 72 AMPOULES", sous: "296 au total" });
    expect(c[6].texte).toBe("242.72 USD");
  });

  it("un produit sans approvisionnement porte un tiret, pas un zéro", async () => {
    // « 0 » affirmerait qu'on n'a rien reçu ; le tiret dit qu'il n'y a rien à
    // dire. Le web écrit le même tiret.
    repondre({
      top_products: TOP_PRODUCTS,
      stock_details: STOCK_DETAILS,
      product_supplies: {},
    });
    const r = await chargerRapport("products", CTX);
    expect(r.sections[0].tableau!.lignes[0].cellules[2].texte).toBe("-");
  });

  it("un produit absent du stock n'invente pas de valeur restante", async () => {
    repondre({
      top_products: TOP_PRODUCTS,
      stock_details: { count: 0, results: [] },
      product_supplies: {},
    });
    const c = (await chargerRapport("products", CTX)).sections[0].tableau!.lignes[0].cellules;
    // Stock départ = 0 restant + 658 vendus. On ne fabrique pas un restant.
    expect(c[1].texte).toBe("658");
    expect(c[5].texte).toBe("0");
  });
});

describe("les décomptes des titres portent le PÉRIMÈTRE, pas la page", () => {
  it("le titre annonce le total du serveur", async () => {
    // Le back-office écrit « (47 articles) » et pagine par vingt : lire la
    // longueur de la page annoncerait « (1 article) » sur un périmètre qui en
    // compte quarante-sept, et le marchand conclurait que le reste a disparu.
    repondre({
      top_products: TOP_PRODUCTS,
      sales_by_category: { count: 2, results: [] },
      sales_by_period: { results: [] },
      sales_by_payment_method: { results: [] },
    });
    const r = await chargerRapport("sales", CTX);
    expect(r.sections.find((s) => s.cle === "articles")!.titre).toBe(
      "Ventes par article (47 articles)"
    );
    expect(r.sections.find((s) => s.cle === "articles")!.tableau!.total).toBe(47);
  });
});
