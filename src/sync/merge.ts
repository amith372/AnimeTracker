// Applies rows pulled from Supabase into local SQLite — the shared landing point for both
// src/sync/pull.ts's polling and its Realtime subscription. Two things keep this from clobbering
// data it shouldn't:
//
// 1. A local row with a pending sync_outbox entry has an edit that hasn't pushed yet. Applying a
//    pulled row over it would silently revert the user's own in-flight change, so it's skipped —
//    once the outbox entry drains, the *next* pull naturally picks up the merged, authoritative
//    state (this device's push already went through the server's last-write-wins version bump).
// 2. A pulled row whose `updated_by_device_id` matches this device's own id is this device's own
//    write echoing back through the pull path — applying it would be a harmless but wasted
//    overwrite with identical data, so it's skipped too (see deviceId.ts).
//
// Identity mirrors outbox.ts's push direction: series match by rootMalId, entries by
// (local series id, malId) after resolving their parent via the entry's joined root_mal_id.
import { and, eq } from 'drizzle-orm';
import { getDeviceId } from './deviceId';
import { db } from '@/db/client';
import { series, seriesEntries, syncOutbox } from '@/db/schema';

export interface RemoteSeriesRow {
  title: string;
  cover_url: string | null;
  genres: string[];
  root_mal_id: number;
  type: string;
  manual_status: string;
  new_season_available: boolean;
  new_season_aired_at: string | null;
  liked: boolean;
  updated_by_device_id: string | null;
}

export interface RemoteEntryRow {
  mal_id: number;
  kind: string;
  order_index: number;
  title: string;
  episode_count: number;
  watch_state: string;
  airing_status: string;
  watched_arc_keys: string[] | null;
  updated_by_device_id: string | null;
  series: { root_mal_id: number } | null;
}

async function hasPendingOutbox(entity: 'series' | 'series_entries', localId: number): Promise<boolean> {
  const rows = await db
    .select({ id: syncOutbox.id })
    .from(syncOutbox)
    .where(and(eq(syncOutbox.entity, entity), eq(syncOutbox.localId, localId)));
  return rows.length > 0;
}

export async function mergeRemoteSeries(rows: RemoteSeriesRow[]): Promise<void> {
  const deviceId = await getDeviceId();
  for (const row of rows) {
    if (row.updated_by_device_id === deviceId) continue;

    const [local] = await db.select().from(series).where(eq(series.rootMalId, row.root_mal_id));
    if (local && (await hasPendingOutbox('series', local.id))) continue;

    const values = {
      title: row.title,
      coverUrl: row.cover_url,
      genres: row.genres,
      rootMalId: row.root_mal_id,
      type: row.type as (typeof series.$inferInsert)['type'],
      manualStatus: row.manual_status as (typeof series.$inferInsert)['manualStatus'],
      newSeasonAvailable: row.new_season_available,
      newSeasonAiredAtEpochMillis: row.new_season_aired_at ? new Date(row.new_season_aired_at).getTime() : null,
      liked: row.liked,
    };
    if (local) {
      await db.update(series).set(values).where(eq(series.id, local.id));
    } else {
      await db.insert(series).values(values);
    }
  }
}

/** Entries whose parent series was never seen locally (a brand-new series from another device
 * that this same pull cycle's mergeRemoteSeries call just inserted, or one still missing entirely)
 * resolve against whatever mergeRemoteSeries already committed — call this *after* that returns. */
export async function mergeRemoteSeriesEntries(rows: RemoteEntryRow[]): Promise<void> {
  const deviceId = await getDeviceId();
  for (const row of rows) {
    if (row.updated_by_device_id === deviceId) continue;
    const rootMalId = row.series?.root_mal_id;
    if (rootMalId === undefined || rootMalId === null) continue; // parent was deleted/inaccessible

    const [localSeries] = await db.select({ id: series.id }).from(series).where(eq(series.rootMalId, rootMalId));
    if (!localSeries) continue; // parent hasn't merged yet — the next pull picks this row up again

    const [localEntry] = await db
      .select()
      .from(seriesEntries)
      .where(and(eq(seriesEntries.seriesId, localSeries.id), eq(seriesEntries.malId, row.mal_id)));
    if (localEntry && (await hasPendingOutbox('series_entries', localEntry.id))) continue;

    const values = {
      seriesId: localSeries.id,
      malId: row.mal_id,
      kind: row.kind as (typeof seriesEntries.$inferInsert)['kind'],
      orderIndex: row.order_index,
      title: row.title,
      episodeCount: row.episode_count,
      watchState: row.watch_state as (typeof seriesEntries.$inferInsert)['watchState'],
      airingStatus: row.airing_status as (typeof seriesEntries.$inferInsert)['airingStatus'],
      watchedArcKeys: row.watched_arc_keys,
    };
    if (localEntry) {
      await db.update(seriesEntries).set(values).where(eq(seriesEntries.id, localEntry.id));
    } else {
      await db.insert(seriesEntries).values(values);
    }
  }
}
