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
  customer_loyalty: "Cagnottes de fidélité",
  loyalty_transactions: "Mouvements de cagnotte",
  registers: "Caisses",
  register_sessions: "Sessions de caisse",
  sales: "Ventes",
  stock_movements: "Mouvements de stock",
  income_categories: "Catégories de recettes",
  expense_categories: "Catégories de dépenses",
  expenses: "Dépenses",
  cash_movements: "Mouvements de caisse",
  // ⚠ CES HUIT-LÀ S'AFFICHAIENT SOUS LEUR CODE TECHNIQUE, et personne ne le
  //   signalait : « stock_transfers : 12 / 12 » au milieu de trente-neuf
  //   lignes lisibles. Le garde-fou ci-contre les a nommées.
  users: "Comptes",
  devices: "Appareils",
  sale_returns: "Retours de vente",
  quotations: "Devis",
  requisitions: "Réquisitions",
  stock_transfers: "Transferts",
  stock_adjustments: "Ajustements",
  inventory_sessions: "Inventaires",
  // Les ENFANTS, tirés imbriqués dans leur parent. Ils n'ont pas de ligne dans
  // `sync_state`, donc l'écran ne les liste pas aujourd'hui - ils sont nommés
  // quand même pour que la règle n'ait AUCUNE exception : une règle sans
  // exception se tient, une règle à huit exceptions se négocie. Et le jour où
  // l'un d'eux passe au manifeste, il est déjà lisible.
  sale_items: "Lignes de vente",
  payments: "Règlements",
  sale_return_items: "Lignes de retour",
  quotation_items: "Lignes de devis",
  requisition_items: "Lignes de réquisition",
  stock_transfer_items: "Lignes de transfert",
  stock_adjustment_items: "Lignes d'ajustement",
  inventory_counts: "Lignes de comptage",
};

export const labelFor = (table: string) => TABLE_LABELS[table] ?? table;
