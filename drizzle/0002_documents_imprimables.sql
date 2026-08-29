CREATE TABLE `print_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`document_number` text NOT NULL,
	`label` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`printed_at` integer,
	`print_count` integer DEFAULT 0 NOT NULL,
	`transport` text
);
--> statement-breakpoint
CREATE INDEX `print_jobs_created_idx` ON `print_jobs` (`created_at`);