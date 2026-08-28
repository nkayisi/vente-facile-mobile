/**
 * Noms des tables, en français.
 *
 * L'écran d'attente affiche ce qui se télécharge. « products : 4 200 / 18 000 »
 * ne dit rien à un commerçant ; « Articles » si.
 */
export const TABLE_LABELS: Record<string, string> = {
  organizations: "Établissement",
  organization_settings: "Paramètres",
  currencies: "Devises",
  organization_currencies: "Taux de change",
  memberships: "Utilisateurs",
  units: "Unités",
  categories: "Catégories",
  brands: "Marques",
  warehouses: "Entrepôts",
  stock_locations: "Emplacements",
  payment_methods: "Moyens de paiement",
  products: "Articles",
  product_variants: "Déclinaisons",
  price_lists: "Listes de prix",
  product_prices: "Prix",
  stocks: "Stocks",
  stock_batches: "Lots",
  customers: "Clients",
  customer_balances: "Soldes clients",
  customer_transactions: "Mouvements clients",
  suppliers: "Fournisseurs",
  loyalty_programs: "Programme de fidélité",
  customer_loyalty: "Points de fidélité",
  registers: "Caisses",
  register_sessions: "Sessions de caisse",
  sales: "Ventes",
  stock_movements: "Mouvements de stock",
  income_categories: "Catégories de recettes",
  expense_categories: "Catégories de dépenses",
  expenses: "Dépenses",
  cash_movements: "Mouvements de caisse",
};

export const labelFor = (table: string) => TABLE_LABELS[table] ?? table;
