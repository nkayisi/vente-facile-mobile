PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_product_prices` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`price_list_id` text NOT NULL,
	`price` text NOT NULL,
	`min_quantity` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_product_prices`("created_at", "updated_at", "id", "product_id", "variant_id", "price_list_id", "price", "min_quantity") SELECT "created_at", "updated_at", "id", "product_id", "variant_id", "price_list_id", "price", "min_quantity" FROM `product_prices`;--> statement-breakpoint
DROP TABLE `product_prices`;--> statement-breakpoint
ALTER TABLE `__new_product_prices` RENAME TO `product_prices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_products` (
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
	`min_stock_level` text NOT NULL,
	`max_stock_level` text,
	`reorder_point` text NOT NULL,
	`reorder_quantity` text NOT NULL,
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
INSERT INTO `__new_products`("created_at", "updated_at", "id", "is_deleted", "deleted_at", "sync_updated_at", "synced_from_client", "name", "slug", "sku", "barcode", "short_description", "category_id", "brand_id", "unit_id", "selling_mode", "packaging_unit_id", "units_per_package", "allow_auto_unpacking", "cost_price", "selling_price", "wholesale_price", "package_cost_price", "tax_rate", "is_taxable", "track_inventory", "allow_negative_stock", "has_expiry_date", "min_stock_level", "max_stock_level", "reorder_point", "reorder_quantity", "weight", "dimensions", "image", "is_active", "is_featured", "is_sellable", "is_purchasable", "expiry_tracking", "batch_tracking", "serial_tracking", "attributes", "created_by_id") SELECT "created_at", "updated_at", "id", "is_deleted", "deleted_at", "sync_updated_at", "synced_from_client", "name", "slug", "sku", "barcode", "short_description", "category_id", "brand_id", "unit_id", "selling_mode", "packaging_unit_id", "units_per_package", "allow_auto_unpacking", "cost_price", "selling_price", "wholesale_price", "package_cost_price", "tax_rate", "is_taxable", "track_inventory", "allow_negative_stock", "has_expiry_date", "min_stock_level", "max_stock_level", "reorder_point", "reorder_quantity", "weight", "dimensions", "image", "is_active", "is_featured", "is_sellable", "is_purchasable", "expiry_tracking", "batch_tracking", "serial_tracking", "attributes", "created_by_id" FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
CREATE INDEX `products_barcode_idx` ON `products` (`barcode`);--> statement-breakpoint
CREATE INDEX `products_sku_idx` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_is_active_idx` ON `products` (`is_active`);