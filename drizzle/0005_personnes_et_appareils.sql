CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`model` text NOT NULL,
	`os_version` text NOT NULL,
	`app_version` text NOT NULL,
	`device_code` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_seen_at` integer,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`phone` text NOT NULL,
	`is_active` integer NOT NULL,
	`date_joined` integer NOT NULL,
	`updated_at` integer NOT NULL
);
