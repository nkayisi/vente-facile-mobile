CREATE TABLE `pending_product_photos` (
	`product_id` text PRIMARY KEY NOT NULL,
	`uri` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `pending_photos_created_idx` ON `pending_product_photos` (`created_at`);