ALTER TABLE `sale_items` ADD `price_currency` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sale_items` ADD `price_exchange_rate` text DEFAULT '1' NOT NULL;
