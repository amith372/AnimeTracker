-- 0002's DROP TABLE for anime_detail_cache was added by hand-editing an already-applied migration
-- file, which the migrator never re-runs (it tracks "applied" per migration timestamp, not per
-- file content) — so on any device where 0002 had already run before that edit landed, the DROP
-- silently never executed and the stale table stuck around. This is a genuinely new migration
-- (new timestamp) specifically so it actually runs on those devices too.
DROP TABLE IF EXISTS `anime_detail_cache`;
