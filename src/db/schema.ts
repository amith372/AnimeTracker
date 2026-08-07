// Drizzle table definitions — the TypeScript equivalent of the old app's Room @Entity classes.
// This mirrors the *current*, already-bug-fixed Room schema (not its migration history): the
// (seriesId, malId) unique index was added after a real duplicate-entries bug, so it's built in
// from the start here rather than something a later migration bolts on.
import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AiringStatus, EntryKind, ManualStatus, SeriesType, WatchState } from '@/domain/types';

/** One grouped show (or standalone movie) — ≈ the old SeriesEntity. */
export const series = sqliteTable('series', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  coverUrl: text('cover_url'),
  // Stored as a JSON array of genre names — Drizzle's `mode: 'json'` handles the
  // stringify/parse for us, same idea as Room's TypeConverter for List<String>.
  genres: text('genres', { mode: 'json' }).$type<string[]>().notNull().default([]),
  rootMalId: integer('root_mal_id').notNull(),
  type: text('type').notNull().$type<SeriesType>(),
  manualStatus: text('manual_status').notNull().$type<ManualStatus>(),
  // Set by the monthly sync when a tracked series' chain grows a new season; cleared once the
  // user opens that series' detail screen. See domain/series.ts for the "is it still new"
  // (< 1 year old) display rule built on top of these two columns.
  newSeasonAvailable: integer('new_season_available', { mode: 'boolean' }).notNull().default(false),
  newSeasonAiredAtEpochMillis: integer('new_season_aired_at_epoch_millis'),
  // User-set "I liked this" flag on watched series — feeds into recommendation scoring (Phase 6),
  // which weights liked series higher than other non-dropped watched series.
  liked: integer('liked', { mode: 'boolean' }).notNull().default(false),
});

/** Each MAL entry (TV season or movie) belonging to a series — ≈ the old SeriesEntryEntity. */
export const seriesEntries = sqliteTable(
  'series_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seriesId: integer('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    malId: integer('mal_id').notNull(),
    kind: text('kind').notNull().$type<EntryKind>(),
    orderIndex: integer('order_index').notNull(),
    title: text('title').notNull(),
    episodeCount: integer('episode_count').notNull().default(0),
    // Replaced the original `watched` boolean when "won't watch" became a third state — see
    // domain/types.ts. Migrations 0004/0005 add-backfill-drop rather than renaming in place, so
    // every existing tick survives the change.
    watchState: text('watch_state').notNull().$type<WatchState>().default('UNWATCHED'),
    airingStatus: text('airing_status').notNull().$type<AiringStatus>(),
    // Per-arc watched-checkbox state for the one entry this ever applies to (One Piece, MAL id 21,
    // see src/domain/arcs.ts). Null for every other entry. The entry's own watchState stays the
    // real source of truth for status derivation/push/sync — this column is derived into it
    // (setArcWatched), never read by anything except the Detail screen's arc UI.
    watchedArcKeys: text('watched_arc_keys', { mode: 'json' }).$type<string[]>(),
  },
  (table) => [
    index('idx_series_entries_series_id').on(table.seriesId),
    // The fix for a real bug: a race between two overlapping sync runs could otherwise insert
    // the same (series, malId) pair twice. This constraint makes that impossible at the DB
    // level, regardless of what application-level guards do or don't catch.
    uniqueIndex('idx_series_entries_series_id_mal_id').on(table.seriesId, table.malId),
  ],
);

/** Singleton row tracking when the last full sync ran, and whether onboarding import is done. */
export const syncMeta = sqliteTable('sync_meta', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lastSyncEpoch: integer('last_sync_epoch').notNull(),
});

/**
 * Local cache of MAL responses — CLAUDE.md guardrail #3's "cache results in Room … never hammer
 * endpoints in tight loops". Covers the two per-anime endpoints this app hammers hardest:
 * `/anime/{id}` (detail) and `/anime/{id}?fields=recommendations`. Both are near-static and the
 * same ids get re-fetched constantly across Import, Discover, Recommendations and repeat visits.
 *
 * Deliberately generic — one `key` ("detail:52991") rather than a table per endpoint — so caching
 * a new endpoint later needs no schema change. Stored as raw response JSON rather than parsed
 * columns: nothing queries inside it, it's only ever read back whole by key.
 */
export const apiCache = sqliteTable('api_cache', {
  key: text('key').primaryKey(),
  json: text('json').notNull(),
  fetchedAtEpochMillis: integer('fetched_at_epoch_millis').notNull(),
});

/**
 * Phase 9 push-only sync: one row per local (entity, localId) still waiting to be pushed to
 * Supabase. `src/repositories/AnimeRepository.ts`'s 8 non-`replaceAllSeries` write functions each
 * upsert a row here in the same local transaction as the real write — see queueOutbox there.
 * `src/sync/outbox.ts` drains this table by re-reading the *current* local row for each entry at
 * drain time (rather than storing a payload snapshot here) — that way a row that changed again
 * between being queued and being drained pushes its latest state, not a stale one, and there's
 * only one place (AnimeRepository's toDomainSeries-adjacent mapping) that knows how a local row
 * maps to its Postgres shape. The unique index means a row that changes twice before draining
 * collapses to one outbox entry, not two.
 */
export const syncOutbox = sqliteTable(
  'sync_outbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entity: text('entity').notNull().$type<'series' | 'series_entries'>(),
    localId: integer('local_id').notNull(),
    createdAtEpochMillis: integer('created_at_epoch_millis').notNull(),
    // Bumped by the drain loop on a failed push; not yet used for backoff/dead-lettering, but
    // cheap to carry from the start rather than adding it once something actually needs it.
    retryCount: integer('retry_count').notNull().default(0),
  },
  (table) => [uniqueIndex('idx_sync_outbox_entity_local_id').on(table.entity, table.localId)],
);

// Lets Drizzle's query API do `db.query.series.findMany({ with: { entries: true } })` instead
// of a manual join — the RN equivalent of Room's @Relation-based SeriesWithEntries.
export const seriesRelations = relations(series, ({ many }) => ({
  entries: many(seriesEntries),
}));
export const seriesEntriesRelations = relations(seriesEntries, ({ one }) => ({
  series: one(series, { fields: [seriesEntries.seriesId], references: [series.id] }),
}));
