CREATE TABLE `series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`cover_url` text,
	`genres` text DEFAULT '[]' NOT NULL,
	`root_mal_id` integer NOT NULL,
	`type` text NOT NULL,
	`manual_status` text NOT NULL,
	`new_season_available` integer DEFAULT false NOT NULL,
	`new_season_aired_at_epoch_millis` integer
);
--> statement-breakpoint
CREATE TABLE `series_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`mal_id` integer NOT NULL,
	`kind` text NOT NULL,
	`order_index` integer NOT NULL,
	`title` text NOT NULL,
	`episode_count` integer DEFAULT 0 NOT NULL,
	`watched` integer DEFAULT false NOT NULL,
	`airing_status` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_series_entries_series_id` ON `series_entries` (`series_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_series_entries_series_id_mal_id` ON `series_entries` (`series_id`,`mal_id`);--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`last_sync_epoch` integer NOT NULL
);
