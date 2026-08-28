CREATE TABLE `local_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outbox_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`seq` integer NOT NULL,
	`payload` text NOT NULL,
	`depends_on` text DEFAULT '[]' NOT NULL,
	`local_ids` text DEFAULT '{}' NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`error_code` text,
	`occurred_at` integer NOT NULL,
	`batch_id` text
);
--> statement-breakpoint
CREATE INDEX `outbox_state_idx` ON `outbox_operations` (`state`);--> statement-breakpoint
CREATE INDEX `outbox_next_attempt_idx` ON `outbox_operations` (`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `outbox_seq_idx` ON `outbox_operations` (`seq`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`table` text PRIMARY KEY NOT NULL,
	`cursor_updated_at` text,
	`cursor_id` text,
	`has_more` integer DEFAULT false NOT NULL,
	`last_full_sync_at` integer,
	`last_error` text,
	`row_count` integer DEFAULT 0 NOT NULL
);
