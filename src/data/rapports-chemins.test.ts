/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CE TEST DÉFEND : SEPT ONGLETS SUR HUIT RÉPONDAIENT 404.          │
 * │                                                                          │
 * │ Les chemins étaient écrits AU FIL DES APPELS, avec des tirets :          │
 * │ `sales-by-category`, `top-products`, `stock-details`... Or `@action`     │
 * │ sans `url_path` laisse le nom de la MÉTHODE tel quel et ne remplace les  │
 * │ soulignés que dans `url_name` : le chemin réel est `sales_by_category`.  │
 * │                                                                          │
 * │ Relevé sur le vrai serveur : sept des huit rubriques rendaient 404, la   │
 * │ huitième des zéros. Et rien ne le disait à la lecture du code - un 404   │
 * │ ne se distingue pas d'une rubrique vide quand on relit un `switch`.      │
 * │                                                                          │
 * │ Le même piège avait déjà coûté un 404 sans corps à des tests backend, et │
 * │ il est écrit dans CLAUDE.md depuis. L'écrire ne suffit pas : on le       │
 * │ mesure.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La liste de référence est celle du serveur, recopiée. **La régénérer quand
 * le serveur bouge**, par la commande ci-dessous ; côté serveur,
 * `apps/reports/tests/test_statistics_paths.py` la fige dans l'autre sens, si
 * bien qu'un renommage casse les deux tests plutôt que l'application.
 *
 *   docker compose exec -T vf_backend python manage.py shell -c \
 *     "from apps.reports.views import StatisticsViewSet as V; \
 *      print(sorted(a.url_path for a in V.get_extra_actions()))"
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CHEMIN_CREANCES, CHEMIN_EXPORT, CHEMINS_STATISTIQUES } from "./rapports";

/** Relevé le 2026-09-03 sur `StatisticsViewSet.get_extra_actions()`. */
const CHEMINS_DU_SERVEUR = [
  "cash_flow",
  "cashbook",
  "customers",
  "daily_cash_report",
  "export",
  "product_profits",
  "product_supplies",
  "profit_margins",
  "receivables",
  "sales",
  "sales-by-packaging",
  "sales_by_category",
  "sales_by_payment_method",
  "sales_by_period",
  "stock",
  "stock_details",
  "stock_movements_summary",
  "summary",
  "top_customers",
  "top_products",
  "user_activity",
];

describe("les chemins des rapports existent sur le serveur", () => {
  it("chaque onglet vise une action que le serveur route", () => {
    const inconnus = Object.entries({
      ...CHEMINS_STATISTIQUES,
      creances: CHEMIN_CREANCES,
      export: CHEMIN_EXPORT,
    })
      .filter(([, chemin]) => !CHEMINS_DU_SERVEUR.includes(chemin))
      .map(([onglet, chemin]) => `${onglet} -> ${chemin}`);
    expect(inconnus).toEqual([]);
  });

  it("le garde-fou VOIT un tiret là où le serveur veut un souligné", () => {
    // Sans cette vérification, la liste de référence pourrait dériver sans que
    // rien ne le signale, et le test passerait au vert sur le défaut même
    // qu'il existe pour attraper.
    expect(CHEMINS_DU_SERVEUR).not.toContain("sales-by-category");
    expect(CHEMINS_DU_SERVEUR).toContain("sales_by_category");
    expect(CHEMINS_DU_SERVEUR).not.toContain("top-products");
    expect(CHEMINS_DU_SERVEUR).not.toContain("daily-cash-report");
    expect(CHEMINS_DU_SERVEUR).not.toContain("user-activity");
  });

  it("aucun chemin n'est écrit ailleurs que dans la table", () => {
    // Un chemin composé à la main dans un `case` échapperait au test ci-dessus
    // et rouvrirait le défaut par le côté.
    const source = readFileSync(join(__dirname, "rapports.ts"), "utf8");
    const enDur = [...source.matchAll(/\/reports\/statistics\/([a-z_-]+)\//g)].map(
      (m) => m[1]
    );
    expect(enDur).toEqual([]);
  });

  it("les huit onglets ont un chemin, et ils sont tous distincts", () => {
    const chemins = Object.values(CHEMINS_STATISTIQUES);
    expect(chemins).toHaveLength(8);
    expect(new Set(chemins).size).toBe(8);
  });
});
