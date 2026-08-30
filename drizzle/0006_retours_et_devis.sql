CREATE TABLE `quotation_items` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`quotation_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`description` text NOT NULL,
	`quantity` text NOT NULL,
	`unit_price` text NOT NULL,
	`discount_percentage` text NOT NULL,
	`tax_rate` text NOT NULL,
	`total` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quotations` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`reference` text NOT NULL,
	`customer_id` text,
	`status` text NOT NULL,
	`subtotal` text NOT NULL,
	`tax_amount` text NOT NULL,
	`discount_amount` text NOT NULL,
	`total` text NOT NULL,
	`valid_until` integer NOT NULL,
	`notes` text NOT NULL,
	`terms` text NOT NULL,
	`created_by_id` text,
	`converted_sale_id` text
);
--> statement-breakpoint
CREATE TABLE `sale_return_items` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`sale_return_id` text NOT NULL,
	`original_item_id` text NOT NULL,
	`quantity` text NOT NULL,
	`unit_price` text NOT NULL,
	`total` text NOT NULL,
	`reason` text NOT NULL,
	`restock` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sale_returns` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`reference` text NOT NULL,
	`original_sale_id` text NOT NULL,
	`return_type` text NOT NULL,
	`status` text NOT NULL,
	`total_amount` text NOT NULL,
	`refund_amount` text NOT NULL,
	`reason` text NOT NULL,
	`created_by_id` text,
	`approved_by_id` text,
	`return_date` integer NOT NULL,
	`approved_at` integer
);
