CREATE TABLE `remote_sync_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`last_pulled_at_epoch_millis` integer
);
