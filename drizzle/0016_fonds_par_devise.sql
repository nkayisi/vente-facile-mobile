CREATE TABLE `register_session_currency_balances` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`currency` text NOT NULL,
	`opening_balance` text NOT NULL,
	`expected_balance` text,
	`counted_balance` text,
	`difference` text
);
--> statement-breakpoint
CREATE INDEX `register_session_currency_balances_session_id_idx` ON `register_session_currency_balances` (`session_id`);