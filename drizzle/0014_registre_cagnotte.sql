CREATE TABLE `loyalty_transactions` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`customer_loyalty_id` text NOT NULL,
	`transaction_type` text NOT NULL,
	`amount` text NOT NULL,
	`balance_after` text NOT NULL,
	`sale_id` text,
	`payment_id` text,
	`description` text NOT NULL,
	`created_by_id` text
);
--> statement-breakpoint
CREATE INDEX `loyalty_transactions_customer_loyalty_id_idx` ON `loyalty_transactions` (`customer_loyalty_id`);