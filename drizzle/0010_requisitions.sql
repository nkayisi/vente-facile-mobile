CREATE TABLE `requisition_items` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`requisition_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity_requested` text NOT NULL,
	`stock_at_request` text NOT NULL,
	`reorder_point_at_request` text NOT NULL,
	`notes` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requisitions` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer NOT NULL,
	`deleted_at` integer,
	`reference` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`status` text NOT NULL,
	`notes` text NOT NULL,
	`requested_by_id` text,
	`decided_by_id` text,
	`decided_at` integer,
	`decision_notes` text NOT NULL,
	`requested_at` integer NOT NULL
);
