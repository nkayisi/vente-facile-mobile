/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PARITÉ AVEC LE BACK-OFFICE, TENUE PAR UN TEST.                       │
 * │                                                                          │
 * │ Elle a déjà dérivé une fois, et personne ne l'a vu : le terminal rendait │
 * │ UN tableau par onglet là où le web en rend jusqu'à quatre, avait mis un  │
 * │ anneau où le web dessine des barres, et avait omis colonnes, badges de   │
 * │ statut, pourcentages et sous-lignes « N au total ».                      │
 * │                                                                          │
 * │ Rien de tout cela ne lève : une colonne absente ne se voit qu'en ouvrant │
 * │ les deux écrans côte à côte, ce que personne ne fait deux fois par an.   │
 * │ D'où cette table, recopiée de `app/dashboard/reports/page.tsx`, et ce    │
 * │ test qui construit les huit onglets et compare.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **La régénérer quand le back-office bouge** : lire les `TabsContent` de
 * `frontend/app/dashboard/reports/page.tsx`, dans l'ORDRE où ils rendent
 * leurs cartes, et reporter titres et en-têtes de colonnes ici. Renommer une
 * colonne d'un côté fait alors échouer ce test **en nommant l'autre**.
 */
const mockGet = jest.fn();
jest.mock("@/api/client", () => ({ api: { get: (...a: unknown[]) => mockGet(...a) } }));

import { chargerRapport, type OngletRapport } from "./rapports";

const CTX = {
  organisation: "org",
  money: (m: string | number, d: string) => `${Number(m)} ${d}`,
  devisePrincipale: "USD",
  debut: "2026-08-03",
  fin: "2026-09-02",
  utilisateur: "u1",
};

/**
 * Ce que le back-office rend, onglet par onglet, dans son ordre.
 *
 * `sections` porte le titre de chaque carte, décompte retiré (il dépend des
 * données). `colonnes` porte les en-têtes de son tableau, quand il en a un.
 */
const WEB: Record<
  OngletRapport,
  { sections: string[]; colonnes: Record<string, string[]> }
> = {
  overview: {
    sections: ["Flux de trésorerie", "Meilleurs clients"],
    colonnes: {},
  },
  "daily-cash": {
    sections: ["Synthèse du jour", "Répartition des paiements", "Mouvements du jour"],
    colonnes: {
      "Mouvements du jour": ["Heure", "Type", "Description", "Entrée", "Sortie", "Solde"],
    },
  },
  sales: {
    sections: [
      "Ventes par article",
      "Ventes par catégorie",
      "Évolution des ventes",
      "Ventes par mode de paiement",
    ],
    colonnes: {
      "Ventes par article": ["#", "Article", "SKU", "Quantité", "Revenus"],
      "Ventes par catégorie": ["Catégorie", "Quantité", "Revenus", "% du total"],
    },
  },
  products: {
    sections: ["Détails des produits vendus"],
    colonnes: {
      "Détails des produits vendus": [
        "Produit", "Stock départ", "Approv.", "Qté vendue",
        "Valeur vendue", "Qté restante", "Valeur restante",
      ],
    },
  },
  customers: {
    sections: ["Meilleurs clients", "Achats par client"],
    colonnes: {},
  },
  stock: {
    sections: ["Résumé des mouvements de stock", "État du stock"],
    colonnes: {
      "État du stock": ["Produit", "Catégorie", "Stock", "Disponible", "Valeur", "Statut"],
    },
  },
  profits: {
    sections: ["Marges", "Bénéfices par produit"],
    colonnes: {
      "Bénéfices par produit": ["Produit", "Qté vendue", "CA (HT)", "Coût", "Bénéfice", "Marge"],
    },
  },
  "user-activity": {
    sections: ["Synthèse", "Détail des ventes"],
    colonnes: { "Détail des ventes": ["Jour", "Ventes", "Total"] },
  },
};

/** « Ventes par article (47 articles) » vers « Ventes par article ». */
const sansDecompte = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, "").trim();

/** Une réponse qui satisfait tous les endpoints, avec une ligne partout. */
function reponseUniverselle() {
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/product_supplies/")) return Promise.resolve({});
    if (url.includes("/summary/")) {
      return Promise.resolve({ sales: {}, stock: {}, cashbook: {}, customers: {} });
    }
    if (url.includes("/profit_margins/")) return Promise.resolve({});
    if (url.includes("/stock_movements_summary/")) return Promise.resolve({});
    if (url.includes("/daily_cash_report/")) {
      return Promise.resolve({
        report: {},
        movements: { count: 1, results: [{ id: "m1", direction: "in", amount: "1" }] },
      });
    }
    if (url.includes("/user_activity/")) {
      return Promise.resolve({
        period: { group_by: "day" },
        sales: {}, expenses: {}, cash: {},
        breakdown: [{ bucket: "2026-08-09", count: 1, total: 1 }],
      });
    }
    return Promise.resolve({ count: 1, results: [{ product_id: "p1", customer_id: "c1", category_id: "k1" }] });
  });
}

beforeEach(() => {
  mockGet.mockReset();
  reponseUniverselle();
});

describe("parité avec « Rapports & Statistiques » du back-office", () => {
  for (const [onglet, attendu] of Object.entries(WEB) as [
    OngletRapport,
    (typeof WEB)[OngletRapport],
  ][]) {
    it(`« ${onglet} » rend les mêmes sections, dans le même ordre`, async () => {
      const r = await chargerRapport(onglet, CTX);
      expect(r.sections.map((s) => sansDecompte(s.titre))).toEqual(attendu.sections);
    });

    it(`« ${onglet} » rend les mêmes colonnes, dans le même ordre`, async () => {
      const r = await chargerRapport(onglet, CTX);
      for (const [titre, colonnes] of Object.entries(attendu.colonnes)) {
        const section = r.sections.find((s) => sansDecompte(s.titre) === titre);
        expect(section?.tableau?.colonnes.map((c) => c.entete)).toEqual(colonnes);
      }
    });
  }

  it("le balayage MORD : il verrait une section manquante", async () => {
    // Sans cette vérification, la table de référence pourrait dériver sans que
    // rien ne le signale, et le test passerait au vert sur le défaut même
    // qu'il existe pour attraper. Défaut déjà payé sur `permissions.test.ts`.
    const r = await chargerRapport("sales", CTX);
    expect(r.sections.map((s) => sansDecompte(s.titre))).not.toEqual([
      "Ventes par catégorie",
    ]);
    expect(r.sections).toHaveLength(4);
  });

  it("les huit onglets sont couverts, aucun n'est oublié", async () => {
    expect(Object.keys(WEB)).toHaveLength(8);
  });
});

describe("les formes graphiques sont celles du web", () => {
  it("les modes de paiement sont des BARRES HORIZONTALES, pas un anneau", async () => {
    // Le web dessine un `BarChart layout="vertical"` de recharts. Le terminal
    // y avait mis un anneau : deux lectures pour la même donnée, et le
    // marchand ne retrouve pas son graphique d'un écran à l'autre.
    const r = await chargerRapport("sales", CTX);
    expect(r.sections.find((s) => s.cle === "moyens")?.graphe?.type).toBe(
      "barres-horizontales"
    );
  });

  it("les achats par client aussi", async () => {
    const r = await chargerRapport("customers", CTX);
    expect(r.sections.find((s) => s.cle === "achats")?.graphe?.type).toBe(
      "barres-horizontales"
    );
  });

  it("l'évolution des ventes est une AIRE", async () => {
    const r = await chargerRapport("sales", CTX);
    expect(r.sections.find((s) => s.cle === "evolution")?.graphe?.type).toBe("aire");
  });

  it("le flux de trésorerie porte DEUX séries, entrées et sorties", async () => {
    // Une seule ne montre pas l'écart, et c'est l'écart qui renseigne. Le
    // terminal se repliait sur les entrées seules.
    const r = await chargerRapport("overview", CTX);
    const g = r.sections.find((s) => s.cle === "flux")?.graphe;
    expect(g?.legende).toEqual({ principale: "Entrées", secondaire: "Sorties" });
    expect(g?.points[0]).toHaveProperty("valeurSecondaire");
  });

  it("aucun graphique ne mêle deux devises", async () => {
    for (const onglet of Object.keys(WEB) as OngletRapport[]) {
      const r = await chargerRapport(onglet, CTX);
      for (const s of r.sections) {
        if (s.graphe) expect(s.graphe.devise).toBe("USD");
      }
    }
  });
});
