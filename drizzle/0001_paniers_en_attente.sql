CREATE TABLE `parked_carts` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`register_session_id` text,
	`content` text NOT NULL,
	`line_count` integer DEFAULT 0 NOT NULL,
	`total_amount` text DEFAULT '0' NOT NULL,
	`total_currency` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `parked_session_idx` ON `parked_carts` (`register_session_id`);