import { nomsDesTables, tablesLocales, tablesTirees } from "./tables";
import * as locales from "./schema/local";
import * as tirees from "./schema/pulled";

describe("la dérivation des noms de tables", () => {
  it("balaie réellement quelque chose", () => {
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien. Ce dépôt
    // l'a déjà payé trois fois.
    expect(tablesTirees().length).toBeGreaterThan(30);
    expect(tablesLocales().length).toBeGreaterThan(3);
  });

  it("rend les 45 tables tirées, enfants compris", () => {
    // 38 tables de tête au manifeste, plus les 7 enfants tirés imbriqués dans
    // leur parent (`sale_items`, `payments`, `inventory_counts`…).
    expect(tablesTirees()).toHaveLength(45);
  });

  it("nomme les tables qui portent l'argent", () => {
    expect(tablesTirees()).toEqual(
      expect.arrayContaining([
        "sales",
        "sale_items",
        "payments",
        "customers",
        "customer_balances",
        "stocks",
        "cash_movements",
        "expenses",
      ])
    );
  });

  it("rend les 6 tables locales", () => {
    expect(tablesLocales()).toEqual([
      "local_settings",
      "outbox_operations",
      "parked_carts",
      "pending_product_photos",
      "print_jobs",
      "sync_state",
    ]);
  });

  /**
   * ⚠ Effacer `__drizzle_migrations` ferait rejouer TOUT le journal de
   * migrations au démarrage suivant, sur une base qui porte déjà les tables.
   * Elle n'est pas dans le schéma, donc elle ne peut pas y entrer - ce test dit
   * pourquoi on dérive plutôt que d'interroger `sqlite_master`.
   */
  it("ne rend jamais la table des migrations", () => {
    expect(tablesTirees()).not.toContain("__drizzle_migrations");
    expect(tablesLocales()).not.toContain("__drizzle_migrations");
  });

  it("ne mélange jamais les deux familles", () => {
    const communes = tablesTirees().filter((t) => tablesLocales().includes(t));
    expect(communes).toEqual([]);
  });

  it("ignore ce qui n'est pas une table", () => {
    expect(nomsDesTables({ x: 1, y: "deux", z: () => null })).toEqual([]);
  });

  it("dérive bien du module et non d'une liste tenue à part", () => {
    // Si quelqu'un remplaçait la dérivation par un tableau littéral, ce test
    // continuerait de passer - d'où le garde-fou de doctrine « aucun nom de
    // table écrit à la main ». Ici on ne vérifie que la mécanique.
    expect(nomsDesTables(tirees)).toEqual(tablesTirees());
    expect(nomsDesTables(locales)).toEqual(tablesLocales());
  });
});
