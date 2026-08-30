CREATE TABLE `stock_adjustment_items` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`adjustment_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`batch_id` text,
	`quantity_counted` text NOT NULL,
	`quantity_expected` text NOT NULL,
	`quantity_difference` text NOT NULL,
	`counted_loose_quantity` text,
	`expected_loose_quantity` text,
	`counted_package_quantity` text,
	`packaging_factor` integer,
	`unit_cost` text NOT NULL,
	`notes` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_adjustments` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`reference` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`adjustment_type` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`created_by_id` text,
	`approved_by_id` text,
	`approved_at` integer
);
--> statement-breakpoint
CREATE TABLE `stock_transfer_items` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`transfer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`batch_id` text,
	`quantity_requested` text NOT NULL,
	`quantity_shipped` text,
	`quantity_received` text,
	`package_quantity` text NOT NULL,
	`loose_quantity` text NOT NULL,
	`packaging_factor` integer,
	`notes` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_transfers` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`reference` text NOT NULL,
	`source_warehouse_id` text NOT NULL,
	`destination_warehouse_id` text NOT NULL,
	`status` text NOT NULL,
	`notes` text NOT NULL,
	`requested_by_id` text,
	`approved_by_id` text,
	`requested_at` integer NOT NULL,
	`shipped_at` integer,
	`received_at` integer
);
