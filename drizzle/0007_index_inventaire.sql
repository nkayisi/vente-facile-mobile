CREATE INDEX `inventory_counts_session_id_idx` ON `inventory_counts` (`session_id`);--> statement-breakpoint
CREATE INDEX `inventory_sessions_status_idx` ON `inventory_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `inventory_sessions_warehouse_id_idx` ON `inventory_sessions` (`warehouse_id`);