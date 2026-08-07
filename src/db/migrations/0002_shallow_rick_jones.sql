CREATE TABLE `api_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`fetched_at_epoch_millis` integer NOT NULL
);
--> statement-breakpoint
-- Supersedes the short-lived anime_detail_cache table (replaced by the generic api_cache above).
-- Safe to drop unconditionally: it only ever held cached MAL responses, never user data.
DROP TABLE IF EXISTS `anime_detail_cache`;
