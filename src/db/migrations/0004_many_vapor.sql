ALTER TABLE `series_entries` ADD `watch_state` text DEFAULT 'UNWATCHED' NOT NULL;--> statement-breakpoint
-- Backfill from the `watched` boolean this column replaces, before 0005 drops it. Every existing
-- tick becomes WATCHED; nothing existing can be WONT_WATCH, since that state didn't exist yet.
-- This has to live here rather than in 0005: the migrator applies files in order, so the old
-- column must still be readable when the copy happens.
UPDATE `series_entries` SET `watch_state` = 'WATCHED' WHERE `watched` = 1;
