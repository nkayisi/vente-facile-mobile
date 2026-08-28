/**
 * Tables tirées du serveur. FICHIER ENGENDRÉ, ne pas modifier à la main.
 *
 *   pnpm db:pull-schema
 *
 * Ces tables sont en LECTURE SEULE côté client : elles reflètent l'état du
 * serveur, et toute écriture locale passe par le journal d'opérations. Les
 * modifier ici ferait diverger le schéma de ce que le serveur envoie, en
 * silence, jusqu'au premier écran qui affiche une valeur absente.
 *
 * Contrat de tirage : version 1
 * 31 tables, 464 colonnes.
 */
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable("organizations", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  businessType: text("business_type").notNull(),
  logo: text("logo"),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  taxId: text("tax_id").notNull(),
  rccm: text("rccm").notNull(),
  idNat: text("id_nat").notNull(),
  currency: text("currency").notNull(),
  timezone: text("timezone").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  subscriptionFloorTier: integer("subscription_floor_tier").notNull(),
  settings: text("settings").notNull(),
});

export type OrganizationsRow =
  typeof organizations.$inferSelect;

export const organizationSettings = sqliteTable("organization_settings", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  receiptHeader: text("receipt_header").notNull(),
  receiptFooter: text("receipt_footer").notNull(),
  receiptPaperWidth: integer("receipt_paper_width").notNull(),
  showLoyaltyPointsOnReceipt: integer("show_loyalty_points_on_receipt", { mode: "boolean" }).notNull(),
  lowStockThreshold: integer("low_stock_threshold").notNull(),
});

export type OrganizationSettingsRow =
  typeof organizationSettings.$inferSelect;

export const currencies = sqliteTable("currencies", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  decimalPlaces: integer("decimal_places").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
});

export type CurrenciesRow =
  typeof currencies.$inferSelect;

export const organizationCurrencies = sqliteTable("organization_currencies", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  currencyId: text("currency_id").notNull(),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull(),
  exchangeRate: text("exchange_rate").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  lastRateUpdate: integer("last_rate_update", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
    index("organization_currencies_currency_id_idx").on(t.currencyId),
]);

export type OrganizationCurrenciesRow =
  typeof organizationCurrencies.$inferSelect;

export const memberships = sqliteTable("memberships", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  invitedById: text("invited_by_id"),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  extraPermissions: text("extra_permissions").notNull(),
});

export type MembershipsRow =
  typeof memberships.$inferSelect;

export const units = sqliteTable("units", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  baseUnitId: text("base_unit_id"),
  conversionFactor: text("conversion_factor").notNull(),
});

export type UnitsRow =
  typeof units.$inferSelect;

export const categories = sqliteTable("categories", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description").notNull(),
  parentId: text("parent_id"),
  image: text("image"),
  sortOrder: integer("sort_order").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
}, (t) => [
    index("categories_parent_id_idx").on(t.parentId),
]);

export type CategoriesRow =
  typeof categories.$inferSelect;

export const brands = sqliteTable("brands", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logo: text("logo"),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
});

export type BrandsRow =
  typeof brands.$inferSelect;

export const warehouses = sqliteTable("warehouses", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  branchId: text("branch_id"),
  address: text("address").notNull(),
  managerId: text("manager_id"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  allowNegativeStock: integer("allow_negative_stock", { mode: "boolean" }).notNull(),
});

export type WarehousesRow =
  typeof warehouses.$inferSelect;

export const stockLocations = sqliteTable("stock_locations", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  warehouseId: text("warehouse_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  parentId: text("parent_id"),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
});

export type StockLocationsRow =
  typeof stockLocations.$inferSelect;

export const paymentMethods = sqliteTable("payment_methods", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  methodType: text("method_type").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull(),
  requiresReference: integer("requires_reference", { mode: "boolean" }).notNull(),
  icon: text("icon").notNull(),
});

export type PaymentMethodsRow =
  typeof paymentMethods.$inferSelect;

export const products = sqliteTable("products", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  syncUpdatedAt: integer("sync_updated_at", { mode: "timestamp_ms" }),
  syncedFromClient: integer("synced_from_client", { mode: "boolean" }).notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sku: text("sku").notNull(),
  barcode: text("barcode").notNull(),
  shortDescription: text("short_description").notNull(),
  categoryId: text("category_id"),
  brandId: text("brand_id"),
  unitId: text("unit_id"),
  sellingMode: text("selling_mode").notNull(),
  packagingUnitId: text("packaging_unit_id"),
  unitsPerPackage: integer("units_per_package"),
  allowAutoUnpacking: integer("allow_auto_unpacking", { mode: "boolean" }).notNull(),
  costPrice: text("cost_price").notNull(),
  sellingPrice: text("selling_price").notNull(),
  wholesalePrice: text("wholesale_price"),
  packageCostPrice: text("package_cost_price"),
  taxRate: text("tax_rate").notNull(),
  isTaxable: integer("is_taxable", { mode: "boolean" }).notNull(),
  trackInventory: integer("track_inventory", { mode: "boolean" }).notNull(),
  allowNegativeStock: integer("allow_negative_stock", { mode: "boolean" }).notNull(),
  hasExpiryDate: integer("has_expiry_date", { mode: "boolean" }).notNull(),
  minStockLevel: integer("min_stock_level").notNull(),
  maxStockLevel: integer("max_stock_level"),
  reorderPoint: integer("reorder_point").notNull(),
  reorderQuantity: integer("reorder_quantity").notNull(),
  weight: text("weight"),
  dimensions: text("dimensions").notNull(),
  image: text("image"),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  isFeatured: integer("is_featured", { mode: "boolean" }).notNull(),
  isSellable: integer("is_sellable", { mode: "boolean" }).notNull(),
  isPurchasable: integer("is_purchasable", { mode: "boolean" }).notNull(),
  expiryTracking: integer("expiry_tracking", { mode: "boolean" }).notNull(),
  batchTracking: integer("batch_tracking", { mode: "boolean" }).notNull(),
  serialTracking: integer("serial_tracking", { mode: "boolean" }).notNull(),
  attributes: text("attributes").notNull(),
  createdById: text("created_by_id"),
}, (t) => [
    index("products_barcode_idx").on(t.barcode),
    index("products_sku_idx").on(t.sku),
    index("products_name_idx").on(t.name),
    index("products_category_id_idx").on(t.categoryId),
    index("products_is_active_idx").on(t.isActive),
]);

export type ProductsRow =
  typeof products.$inferSelect;

export const productVariants = sqliteTable("product_variants", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  syncUpdatedAt: integer("sync_updated_at", { mode: "timestamp_ms" }),
  syncedFromClient: integer("synced_from_client", { mode: "boolean" }).notNull(),
  productId: text("product_id").notNull(),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  barcode: text("barcode").notNull(),
  costPrice: text("cost_price"),
  sellingPrice: text("selling_price"),
  attributes: text("attributes").notNull(),
  image: text("image"),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
}, (t) => [
    index("product_variants_product_id_idx").on(t.productId),
    index("product_variants_barcode_idx").on(t.barcode),
]);

export type ProductVariantsRow =
  typeof productVariants.$inferSelect;

export const priceLists = sqliteTable("price_lists", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  description: text("description").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  validFrom: integer("valid_from", { mode: "timestamp_ms" }),
  validUntil: integer("valid_until", { mode: "timestamp_ms" }),
  discountPercentage: text("discount_percentage").notNull(),
});

export type PriceListsRow =
  typeof priceLists.$inferSelect;

export const productPrices = sqliteTable("product_prices", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  variantId: text("variant_id"),
  priceListId: text("price_list_id").notNull(),
  price: text("price").notNull(),
  minQuantity: integer("min_quantity").notNull(),
});

export type ProductPricesRow =
  typeof productPrices.$inferSelect;

export const stocks = sqliteTable("stocks", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  variantId: text("variant_id"),
  warehouseId: text("warehouse_id").notNull(),
  locationId: text("location_id"),
  quantity: text("quantity").notNull(),
  reservedQuantity: text("reserved_quantity").notNull(),
  packageQuantity: text("package_quantity").notNull(),
  looseQuantity: text("loose_quantity").notNull(),
  avgCost: text("avg_cost").notNull(),
  lastCountedAt: integer("last_counted_at", { mode: "timestamp_ms" }),
  lastMovementAt: integer("last_movement_at", { mode: "timestamp_ms" }),
}, (t) => [
    index("stocks_product_id_warehouse_id_idx").on(t.productId, t.warehouseId),
    index("stocks_warehouse_id_idx").on(t.warehouseId),
]);

export type StocksRow =
  typeof stocks.$inferSelect;

export const stockBatches = sqliteTable("stock_batches", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  variantId: text("variant_id"),
  warehouseId: text("warehouse_id").notNull(),
  locationId: text("location_id"),
  batchNumber: text("batch_number").notNull(),
  quantity: text("quantity").notNull(),
  costPrice: text("cost_price").notNull(),
  manufacturingDate: integer("manufacturing_date", { mode: "timestamp_ms" }),
  expiryDate: integer("expiry_date", { mode: "timestamp_ms" }),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  notes: text("notes").notNull(),
}, (t) => [
    index("stock_batches_product_id_warehouse_id_idx").on(t.productId, t.warehouseId),
    index("stock_batches_expiry_date_idx").on(t.expiryDate),
]);

export type StockBatchesRow =
  typeof stockBatches.$inferSelect;

export const customers = sqliteTable("customers", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  syncUpdatedAt: integer("sync_updated_at", { mode: "timestamp_ms" }),
  syncedFromClient: integer("synced_from_client", { mode: "boolean" }).notNull(),
  code: text("code").notNull(),
  customerType: text("customer_type").notNull(),
  name: text("name").notNull(),
  companyName: text("company_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  taxId: text("tax_id").notNull(),
  allowCredit: integer("allow_credit", { mode: "boolean" }).notNull(),
  creditLimit: text("credit_limit").notNull(),
  currentBalance: text("current_balance").notNull(),
  notes: text("notes").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  createdById: text("created_by_id"),
}, (t) => [
    index("customers_phone_idx").on(t.phone),
    index("customers_name_idx").on(t.name),
    index("customers_is_active_idx").on(t.isActive),
]);

export type CustomersRow =
  typeof customers.$inferSelect;

export const customerBalances = sqliteTable("customer_balances", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  currency: text("currency").notNull(),
  amount: text("amount").notNull(),
}, (t) => [
    index("customer_balances_customer_id_idx").on(t.customerId),
]);

export type CustomerBalancesRow =
  typeof customerBalances.$inferSelect;

export const customerTransactions = sqliteTable("customer_transactions", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  transactionType: text("transaction_type").notNull(),
  amount: text("amount").notNull(),
  currency: text("currency").notNull(),
  exchangeRate: text("exchange_rate").notNull(),
  balanceBefore: text("balance_before").notNull(),
  balanceAfter: text("balance_after").notNull(),
  reference: text("reference").notNull(),
  receiptNumber: text("receipt_number").notNull(),
  saleId: text("sale_id"),
  paymentMethod: text("payment_method").notNull(),
  notes: text("notes").notNull(),
  createdById: text("created_by_id"),
}, (t) => [
    index("customer_transactions_customer_id_idx").on(t.customerId),
]);

export type CustomerTransactionsRow =
  typeof customerTransactions.$inferSelect;

export const suppliers = sqliteTable("suppliers", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  syncUpdatedAt: integer("sync_updated_at", { mode: "timestamp_ms" }),
  syncedFromClient: integer("synced_from_client", { mode: "boolean" }).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  companyName: text("company_name").notNull(),
  contactPerson: text("contact_person").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  website: text("website").notNull(),
  address: text("address").notNull(),
  taxId: text("tax_id").notNull(),
  currency: text("currency").notNull(),
  currentBalance: text("current_balance").notNull(),
  bankName: text("bank_name").notNull(),
  bankAccount: text("bank_account").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  createdById: text("created_by_id"),
});

export type SuppliersRow =
  typeof suppliers.$inferSelect;

export const loyaltyPrograms = sqliteTable("loyalty_programs", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  pointsCalculationType: text("points_calculation_type").notNull(),
  pointsPerUnit: integer("points_per_unit").notNull(),
  amountPerUnit: text("amount_per_unit").notNull(),
  pointsPercentage: text("points_percentage").notNull(),
  pointValue: text("point_value").notNull(),
  minPointsToRedeem: integer("min_points_to_redeem").notNull(),
  maxRedemptionPercent: text("max_redemption_percent").notNull(),
  pointsExpiryDays: integer("points_expiry_days").notNull(),
  onlyRegisteredCustomers: integer("only_registered_customers", { mode: "boolean" }).notNull(),
});

export type LoyaltyProgramsRow =
  typeof loyaltyPrograms.$inferSelect;

export const customerLoyalty = sqliteTable("customer_loyalty", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  totalPointsEarned: text("total_points_earned").notNull(),
  totalPointsRedeemed: text("total_points_redeemed").notNull(),
  currentPoints: text("current_points").notNull(),
  tier: text("tier").notNull(),
  lastPointsEarnedAt: integer("last_points_earned_at", { mode: "timestamp_ms" }),
  lastPointsRedeemedAt: integer("last_points_redeemed_at", { mode: "timestamp_ms" }),
}, (t) => [
    index("customer_loyalty_customer_id_idx").on(t.customerId),
]);

export type CustomerLoyaltyRow =
  typeof customerLoyalty.$inferSelect;

export const registers = sqliteTable("registers", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  branchId: text("branch_id").notNull(),
  warehouseId: text("warehouse_id").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  receiptHeader: text("receipt_header").notNull(),
  receiptFooter: text("receipt_footer").notNull(),
});

export type RegistersRow =
  typeof registers.$inferSelect;

export const registerSessions = sqliteTable("register_sessions", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  registerId: text("register_id").notNull(),
  openedById: text("opened_by_id").notNull(),
  closedById: text("closed_by_id"),
  status: text("status").notNull(),
  openingBalance: text("opening_balance").notNull(),
  closingBalance: text("closing_balance"),
  expectedBalance: text("expected_balance"),
  countedBalance: text("counted_balance"),
  difference: text("difference"),
  openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
  closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  notes: text("notes").notNull(),
}, (t) => [
    index("register_sessions_register_id_idx").on(t.registerId),
    index("register_sessions_status_idx").on(t.status),
]);

export type RegisterSessionsRow =
  typeof registerSessions.$inferSelect;

export const sales = sqliteTable("sales", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  syncUpdatedAt: integer("sync_updated_at", { mode: "timestamp_ms" }),
  syncedFromClient: integer("synced_from_client", { mode: "boolean" }).notNull(),
  reference: text("reference").notNull(),
  sessionId: text("session_id"),
  registerId: text("register_id"),
  warehouseId: text("warehouse_id"),
  customerId: text("customer_id"),
  saleType: text("sale_type").notNull(),
  status: text("status").notNull(),
  priceListId: text("price_list_id"),
  subtotal: text("subtotal").notNull(),
  taxAmount: text("tax_amount").notNull(),
  discountAmount: text("discount_amount").notNull(),
  discountPercentage: text("discount_percentage").notNull(),
  loyaltyRedemptionAmount: text("loyalty_redemption_amount").notNull(),
  total: text("total").notNull(),
  amountPaid: text("amount_paid").notNull(),
  amountDue: text("amount_due").notNull(),
  changeAmount: text("change_amount").notNull(),
  changeCurrency: text("change_currency").notNull(),
  currency: text("currency").notNull(),
  exchangeRate: text("exchange_rate").notNull(),
  notes: text("notes").notNull(),
  internalNotes: text("internal_notes").notNull(),
  soldById: text("sold_by_id"),
  saleDate: integer("sale_date", { mode: "timestamp_ms" }).notNull(),
  dueDate: integer("due_date", { mode: "timestamp_ms" }),
  isPos: integer("is_pos", { mode: "boolean" }).notNull(),
  receiptPrinted: integer("receipt_printed", { mode: "boolean" }).notNull(),
  stockReserved: integer("stock_reserved", { mode: "boolean" }).notNull(),
}, (t) => [
    index("sales_status_idx").on(t.status),
    index("sales_customer_id_idx").on(t.customerId),
    index("sales_sale_date_idx").on(t.saleDate),
    index("sales_register_id_idx").on(t.registerId),
]);

export type SalesRow =
  typeof sales.$inferSelect;

export const saleItems = sqliteTable("sale_items", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  syncUpdatedAt: integer("sync_updated_at", { mode: "timestamp_ms" }),
  syncedFromClient: integer("synced_from_client", { mode: "boolean" }).notNull(),
  saleId: text("sale_id").notNull(),
  productId: text("product_id").notNull(),
  variantId: text("variant_id"),
  batchId: text("batch_id"),
  description: text("description").notNull(),
  quantity: text("quantity").notNull(),
  unitPrice: text("unit_price").notNull(),
  packageQuantity: text("package_quantity").notNull(),
  packageUnitPrice: text("package_unit_price"),
  packagingFactor: integer("packaging_factor"),
  costPrice: text("cost_price").notNull(),
  discountAmount: text("discount_amount").notNull(),
  discountPercentage: text("discount_percentage").notNull(),
  taxRate: text("tax_rate").notNull(),
  taxAmount: text("tax_amount").notNull(),
  subtotal: text("subtotal").notNull(),
  total: text("total").notNull(),
  notes: text("notes").notNull(),
}, (t) => [
    index("sale_items_sale_id_idx").on(t.saleId),
    index("sale_items_product_id_idx").on(t.productId),
]);

export type SaleItemsRow =
  typeof saleItems.$inferSelect;

export const payments = sqliteTable("payments", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  syncUpdatedAt: integer("sync_updated_at", { mode: "timestamp_ms" }),
  syncedFromClient: integer("synced_from_client", { mode: "boolean" }).notNull(),
  saleId: text("sale_id").notNull(),
  paymentMethodId: text("payment_method_id"),
  amount: text("amount").notNull(),
  tenderedAmount: text("tendered_amount"),
  currency: text("currency").notNull(),
  exchangeRate: text("exchange_rate").notNull(),
  reference: text("reference").notNull(),
  receiptNumber: text("receipt_number").notNull(),
  status: text("status").notNull(),
  receivedById: text("received_by_id"),
  paidAt: integer("paid_at", { mode: "timestamp_ms" }).notNull(),
  notes: text("notes").notNull(),
}, (t) => [
    index("payments_sale_id_idx").on(t.saleId),
]);

export type PaymentsRow =
  typeof payments.$inferSelect;

export const stockMovements = sqliteTable("stock_movements", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  syncUpdatedAt: integer("sync_updated_at", { mode: "timestamp_ms" }),
  syncedFromClient: integer("synced_from_client", { mode: "boolean" }).notNull(),
  productId: text("product_id").notNull(),
  variantId: text("variant_id"),
  warehouseId: text("warehouse_id").notNull(),
  batchId: text("batch_id"),
  movementType: text("movement_type").notNull(),
  quantity: text("quantity").notNull(),
  unitCost: text("unit_cost").notNull(),
  quantityBefore: text("quantity_before").notNull(),
  quantityAfter: text("quantity_after").notNull(),
  inputPackageQuantity: text("input_package_quantity").notNull(),
  inputLooseQuantity: text("input_loose_quantity").notNull(),
  packagingFactor: integer("packaging_factor"),
  inputPackageUnitCost: text("input_package_unit_cost"),
  inputLooseUnitCost: text("input_loose_unit_cost"),
  referenceType: text("reference_type").notNull(),
  referenceId: text("reference_id"),
  notes: text("notes").notNull(),
  createdById: text("created_by_id"),
}, (t) => [
    index("stock_movements_product_id_idx").on(t.productId),
    index("stock_movements_warehouse_id_idx").on(t.warehouseId),
    index("stock_movements_created_at_idx").on(t.createdAt),
]);

export type StockMovementsRow =
  typeof stockMovements.$inferSelect;

export const incomeCategories = sqliteTable("income_categories", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  description: text("description").notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
});

export type IncomeCategoriesRow =
  typeof incomeCategories.$inferSelect;

export const expenseCategories = sqliteTable("expense_categories", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  description: text("description").notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  budgetMonthly: text("budget_monthly").notNull(),
});

export type ExpenseCategoriesRow =
  typeof expenseCategories.$inferSelect;

export const expenses = sqliteTable("expenses", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  categoryId: text("category_id").notNull(),
  warehouseId: text("warehouse_id"),
  description: text("description").notNull(),
  amount: text("amount").notNull(),
  currency: text("currency").notNull(),
  exchangeRate: text("exchange_rate").notNull(),
  status: text("status").notNull(),
  beneficiary: text("beneficiary").notNull(),
  paymentMethodId: text("payment_method_id"),
  paymentReference: text("payment_reference").notNull(),
  expenseDate: integer("expense_date", { mode: "timestamp_ms" }).notNull(),
  dueDate: integer("due_date", { mode: "timestamp_ms" }),
  paidDate: integer("paid_date", { mode: "timestamp_ms" }),
  isRecurring: integer("is_recurring", { mode: "boolean" }).notNull(),
  recurrencePeriod: text("recurrence_period").notNull(),
  notes: text("notes").notNull(),
  attachment: text("attachment"),
  createdById: text("created_by_id"),
  approvedById: text("approved_by_id"),
}, (t) => [
    index("expenses_expense_date_idx").on(t.expenseDate),
    index("expenses_status_idx").on(t.status),
]);

export type ExpensesRow =
  typeof expenses.$inferSelect;

export const cashMovements = sqliteTable("cash_movements", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  direction: text("direction").notNull(),
  movementType: text("movement_type").notNull(),
  amount: text("amount").notNull(),
  currency: text("currency").notNull(),
  exchangeRate: text("exchange_rate").notNull(),
  description: text("description").notNull(),
  paymentMethodId: text("payment_method_id"),
  incomeCategoryId: text("income_category_id"),
  expenseCategoryId: text("expense_category_id"),
  saleId: text("sale_id"),
  expenseId: text("expense_id"),
  purchaseOrderId: text("purchase_order_id"),
  customerId: text("customer_id"),
  supplierId: text("supplier_id"),
  sessionId: text("session_id"),
  balanceAfter: text("balance_after").notNull(),
  movementDate: integer("movement_date", { mode: "timestamp_ms" }).notNull(),
  notes: text("notes").notNull(),
  createdById: text("created_by_id"),
  isCancelled: integer("is_cancelled", { mode: "boolean" }).notNull(),
  cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
  cancelledById: text("cancelled_by_id"),
  cancelReason: text("cancel_reason").notNull(),
}, (t) => [
    index("cash_movements_movement_date_idx").on(t.movementDate),
]);

export type CashMovementsRow =
  typeof cashMovements.$inferSelect;
