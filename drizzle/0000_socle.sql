CREATE TABLE `local_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outbox_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`seq` integer NOT NULL,
	`payload` text NOT NULL,
	`depends_on` text DEFAULT '[]' NOT NULL,
	`local_ids` text DEFAULT '{}' NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`error_code` text,
	`occurred_at` integer NOT NULL,
	`batch_id` text
);
--> statement-breakpoint
CREATE INDEX `outbox_state_idx` ON `outbox_operations` (`state`);--> statement-breakpoint
CREATE INDEX `outbox_next_attempt_idx` ON `outbox_operations` (`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `outbox_seq_idx` ON `outbox_operations` (`seq`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`table` text PRIMARY KEY NOT NULL,
	`cursor` text,
	`deleted_cursor` text,
	`has_more` integer DEFAULT false NOT NULL,
	`last_full_sync_at` integer,
	`last_error` text,
	`row_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`is_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cash_movements` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`direction` text NOT NULL,
	`movement_type` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`exchange_rate` text NOT NULL,
	`description` text NOT NULL,
	`payment_method_id` text,
	`income_category_id` text,
	`expense_category_id` text,
	`sale_id` text,
	`expense_id` text,
	`purchase_order_id` text,
	`customer_id` text,
	`supplier_id` text,
	`session_id` text,
	`balance_after` text NOT NULL,
	`movement_date` integer NOT NULL,
	`notes` text NOT NULL,
	`created_by_id` text,
	`is_cancelled` integer NOT NULL,
	`cancelled_at` integer,
	`cancelled_by_id` text,
	`cancel_reason` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cash_movements_movement_date_idx` ON `cash_movements` (`movement_date`);--> statement-breakpoint
CREATE TABLE `categories` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text NOT NULL,
	`parent_id` text,
	`image` text,
	`sort_order` integer NOT NULL,
	`is_active` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `categories_parent_id_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE TABLE `currencies` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`decimal_places` integer NOT NULL,
	`is_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_balances` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`currency` text NOT NULL,
	`amount` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_balances_customer_id_idx` ON `customer_balances` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customer_loyalty` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`total_points_earned` text NOT NULL,
	`total_points_redeemed` text NOT NULL,
	`current_points` text NOT NULL,
	`tier` text NOT NULL,
	`last_points_earned_at` integer,
	`last_points_redeemed_at` integer
);
--> statement-breakpoint
CREATE INDEX `customer_loyalty_customer_id_idx` ON `customer_loyalty` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customer_transactions` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`transaction_type` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`exchange_rate` text NOT NULL,
	`balance_before` text NOT NULL,
	`balance_after` text NOT NULL,
	`reference` text NOT NULL,
	`receipt_number` text NOT NULL,
	`sale_id` text,
	`payment_method` text NOT NULL,
	`notes` text NOT NULL,
	`created_by_id` text
);
--> statement-breakpoint
CREATE INDEX `customer_transactions_customer_id_idx` ON `customer_transactions` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`sync_updated_at` integer,
	`synced_from_client` integer NOT NULL,
	`code` text NOT NULL,
	`customer_type` text NOT NULL,
	`name` text NOT NULL,
	`company_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`tax_id` text NOT NULL,
	`allow_credit` integer NOT NULL,
	`credit_limit` text NOT NULL,
	`current_balance` text NOT NULL,
	`notes` text NOT NULL,
	`is_active` integer NOT NULL,
	`created_by_id` text
);
--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `customers_is_active_idx` ON `customers` (`is_active`);--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`description` text NOT NULL,
	`color` text NOT NULL,
	`icon` text NOT NULL,
	`is_active` integer NOT NULL,
	`budget_monthly` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`category_id` text NOT NULL,
	`warehouse_id` text,
	`description` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`exchange_rate` text NOT NULL,
	`status` text NOT NULL,
	`beneficiary` text NOT NULL,
	`payment_method_id` text,
	`payment_reference` text NOT NULL,
	`expense_date` integer NOT NULL,
	`due_date` integer,
	`paid_date` integer,
	`is_recurring` integer NOT NULL,
	`recurrence_period` text NOT NULL,
	`notes` text NOT NULL,
	`attachment` text,
	`created_by_id` text,
	`approved_by_id` text
);
--> statement-breakpoint
CREATE INDEX `expenses_expense_date_idx` ON `expenses` (`expense_date`);--> statement-breakpoint
CREATE INDEX `expenses_status_idx` ON `expenses` (`status`);--> statement-breakpoint
CREATE TABLE `income_categories` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`description` text NOT NULL,
	`color` text NOT NULL,
	`icon` text NOT NULL,
	`is_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `loyalty_programs` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_active` integer NOT NULL,
	`points_calculation_type` text NOT NULL,
	`points_per_unit` integer NOT NULL,
	`amount_per_unit` text NOT NULL,
	`points_percentage` text NOT NULL,
	`point_value` text NOT NULL,
	`min_points_to_redeem` integer NOT NULL,
	`max_redemption_percent` text NOT NULL,
	`points_expiry_days` integer NOT NULL,
	`only_registered_customers` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`is_active` integer NOT NULL,
	`invited_by_id` text,
	`joined_at` integer NOT NULL,
	`extra_permissions` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organization_currencies` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`currency_id` text NOT NULL,
	`is_primary` integer NOT NULL,
	`exchange_rate` text NOT NULL,
	`is_active` integer NOT NULL,
	`last_rate_update` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `organization_currencies_currency_id_idx` ON `organization_currencies` (`currency_id`);--> statement-breakpoint
CREATE TABLE `organization_settings` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`receipt_header` text NOT NULL,
	`receipt_footer` text NOT NULL,
	`receipt_paper_width` integer NOT NULL,
	`show_loyalty_points_on_receipt` integer NOT NULL,
	`low_stock_threshold` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`business_type` text NOT NULL,
	`logo` text,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`tax_id` text NOT NULL,
	`rccm` text NOT NULL,
	`id_nat` text NOT NULL,
	`currency` text NOT NULL,
	`timezone` text NOT NULL,
	`is_active` integer NOT NULL,
	`subscription_floor_tier` integer NOT NULL,
	`settings` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_methods` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`method_type` text NOT NULL,
	`is_active` integer NOT NULL,
	`is_default` integer NOT NULL,
	`requires_reference` integer NOT NULL,
	`icon` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`sync_updated_at` integer,
	`synced_from_client` integer NOT NULL,
	`sale_id` text NOT NULL,
	`payment_method_id` text,
	`amount` text NOT NULL,
	`tendered_amount` text,
	`currency` text NOT NULL,
	`exchange_rate` text NOT NULL,
	`reference` text NOT NULL,
	`receipt_number` text NOT NULL,
	`status` text NOT NULL,
	`received_by_id` text,
	`paid_at` integer NOT NULL,
	`notes` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payments_sale_id_idx` ON `payments` (`sale_id`);--> statement-breakpoint
CREATE TABLE `price_lists` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`description` text NOT NULL,
	`is_default` integer NOT NULL,
	`is_active` integer NOT NULL,
	`valid_from` integer,
	`valid_until` integer,
	`discount_percentage` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_prices` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`price_list_id` text NOT NULL,
	`price` text NOT NULL,
	`min_quantity` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_variants` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`sync_updated_at` integer,
	`synced_from_client` integer NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text NOT NULL,
	`barcode` text NOT NULL,
	`cost_price` text,
	`selling_price` text,
	`attributes` text NOT NULL,
	`image` text,
	`is_active` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_variants_product_id_idx` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE INDEX `product_variants_barcode_idx` ON `product_variants` (`barcode`);--> statement-breakpoint
CREATE TABLE `products` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`sync_updated_at` integer,
	`synced_from_client` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sku` text NOT NULL,
	`barcode` text NOT NULL,
	`short_description` text NOT NULL,
	`category_id` text,
	`brand_id` text,
	`unit_id` text,
	`selling_mode` text NOT NULL,
	`packaging_unit_id` text,
	`units_per_package` integer,
	`allow_auto_unpacking` integer NOT NULL,
	`cost_price` text NOT NULL,
	`selling_price` text NOT NULL,
	`wholesale_price` text,
	`package_cost_price` text,
	`tax_rate` text NOT NULL,
	`is_taxable` integer NOT NULL,
	`track_inventory` integer NOT NULL,
	`allow_negative_stock` integer NOT NULL,
	`has_expiry_date` integer NOT NULL,
	`min_stock_level` integer NOT NULL,
	`max_stock_level` integer,
	`reorder_point` integer NOT NULL,
	`reorder_quantity` integer NOT NULL,
	`weight` text,
	`dimensions` text NOT NULL,
	`image` text,
	`is_active` integer NOT NULL,
	`is_featured` integer NOT NULL,
	`is_sellable` integer NOT NULL,
	`is_purchasable` integer NOT NULL,
	`expiry_tracking` integer NOT NULL,
	`batch_tracking` integer NOT NULL,
	`serial_tracking` integer NOT NULL,
	`attributes` text NOT NULL,
	`created_by_id` text
);
--> statement-breakpoint
CREATE INDEX `products_barcode_idx` ON `products` (`barcode`);--> statement-breakpoint
CREATE INDEX `products_sku_idx` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_is_active_idx` ON `products` (`is_active`);--> statement-breakpoint
CREATE TABLE `register_sessions` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`register_id` text NOT NULL,
	`opened_by_id` text NOT NULL,
	`closed_by_id` text,
	`status` text NOT NULL,
	`opening_balance` text NOT NULL,
	`closing_balance` text,
	`expected_balance` text,
	`counted_balance` text,
	`difference` text,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`notes` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `register_sessions_register_id_idx` ON `register_sessions` (`register_id`);--> statement-breakpoint
CREATE INDEX `register_sessions_status_idx` ON `register_sessions` (`status`);--> statement-breakpoint
CREATE TABLE `registers` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`branch_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`is_active` integer NOT NULL,
	`receipt_header` text NOT NULL,
	`receipt_footer` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sale_items` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`sync_updated_at` integer,
	`synced_from_client` integer NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`batch_id` text,
	`description` text NOT NULL,
	`quantity` text NOT NULL,
	`unit_price` text NOT NULL,
	`package_quantity` text NOT NULL,
	`package_unit_price` text,
	`packaging_factor` integer,
	`cost_price` text NOT NULL,
	`discount_amount` text NOT NULL,
	`discount_percentage` text NOT NULL,
	`tax_rate` text NOT NULL,
	`tax_amount` text NOT NULL,
	`subtotal` text NOT NULL,
	`total` text NOT NULL,
	`notes` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sale_items_sale_id_idx` ON `sale_items` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_items_product_id_idx` ON `sale_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`sync_updated_at` integer,
	`synced_from_client` integer NOT NULL,
	`reference` text NOT NULL,
	`session_id` text,
	`register_id` text,
	`warehouse_id` text,
	`customer_id` text,
	`sale_type` text NOT NULL,
	`status` text NOT NULL,
	`price_list_id` text,
	`subtotal` text NOT NULL,
	`tax_amount` text NOT NULL,
	`discount_amount` text NOT NULL,
	`discount_percentage` text NOT NULL,
	`loyalty_redemption_amount` text NOT NULL,
	`total` text NOT NULL,
	`amount_paid` text NOT NULL,
	`amount_due` text NOT NULL,
	`change_amount` text NOT NULL,
	`change_currency` text NOT NULL,
	`currency` text NOT NULL,
	`exchange_rate` text NOT NULL,
	`notes` text NOT NULL,
	`internal_notes` text NOT NULL,
	`sold_by_id` text,
	`sale_date` integer NOT NULL,
	`due_date` integer,
	`is_pos` integer NOT NULL,
	`receipt_printed` integer NOT NULL,
	`stock_reserved` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sales_status_idx` ON `sales` (`status`);--> statement-breakpoint
CREATE INDEX `sales_customer_id_idx` ON `sales` (`customer_id`);--> statement-breakpoint
CREATE INDEX `sales_sale_date_idx` ON `sales` (`sale_date`);--> statement-breakpoint
CREATE INDEX `sales_register_id_idx` ON `sales` (`register_id`);--> statement-breakpoint
CREATE TABLE `stock_batches` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`warehouse_id` text NOT NULL,
	`location_id` text,
	`batch_number` text NOT NULL,
	`quantity` text NOT NULL,
	`cost_price` text NOT NULL,
	`manufacturing_date` integer,
	`expiry_date` integer,
	`received_at` integer NOT NULL,
	`notes` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_batches_product_id_warehouse_id_idx` ON `stock_batches` (`product_id`,`warehouse_id`);--> statement-breakpoint
CREATE INDEX `stock_batches_expiry_date_idx` ON `stock_batches` (`expiry_date`);--> statement-breakpoint
CREATE TABLE `stock_locations` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`warehouse_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`parent_id` text,
	`is_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`sync_updated_at` integer,
	`synced_from_client` integer NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`warehouse_id` text NOT NULL,
	`batch_id` text,
	`movement_type` text NOT NULL,
	`quantity` text NOT NULL,
	`unit_cost` text NOT NULL,
	`quantity_before` text NOT NULL,
	`quantity_after` text NOT NULL,
	`input_package_quantity` text NOT NULL,
	`input_loose_quantity` text NOT NULL,
	`packaging_factor` integer,
	`input_package_unit_cost` text,
	`input_loose_unit_cost` text,
	`reference_type` text NOT NULL,
	`reference_id` text,
	`notes` text NOT NULL,
	`created_by_id` text
);
--> statement-breakpoint
CREATE INDEX `stock_movements_product_id_idx` ON `stock_movements` (`product_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_warehouse_id_idx` ON `stock_movements` (`warehouse_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_created_at_idx` ON `stock_movements` (`created_at`);--> statement-breakpoint
CREATE TABLE `stocks` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`warehouse_id` text NOT NULL,
	`location_id` text,
	`quantity` text NOT NULL,
	`reserved_quantity` text NOT NULL,
	`package_quantity` text NOT NULL,
	`loose_quantity` text NOT NULL,
	`avg_cost` text NOT NULL,
	`last_counted_at` integer,
	`last_movement_at` integer
);
--> statement-breakpoint
CREATE INDEX `stocks_product_id_warehouse_id_idx` ON `stocks` (`product_id`,`warehouse_id`);--> statement-breakpoint
CREATE INDEX `stocks_warehouse_id_idx` ON `stocks` (`warehouse_id`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`sync_updated_at` integer,
	`synced_from_client` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`company_name` text NOT NULL,
	`contact_person` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`website` text NOT NULL,
	`address` text NOT NULL,
	`tax_id` text NOT NULL,
	`currency` text NOT NULL,
	`current_balance` text NOT NULL,
	`bank_name` text NOT NULL,
	`bank_account` text NOT NULL,
	`is_active` integer NOT NULL,
	`created_by_id` text
);
--> statement-breakpoint
CREATE TABLE `units` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`base_unit_id` text,
	`conversion_factor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`branch_id` text,
	`address` text NOT NULL,
	`manager_id` text,
	`is_default` integer NOT NULL,
	`is_active` integer NOT NULL,
	`allow_negative_stock` integer NOT NULL
);
