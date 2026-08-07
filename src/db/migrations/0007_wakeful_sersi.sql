CREATE TABLE `sync_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`local_id` integer NOT NULL,
	`created_at_epoch_millis` integer NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_outbox_entity_local_id` ON `sync_outbox` (`entity`,`local_id`);