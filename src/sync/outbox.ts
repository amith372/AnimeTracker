// Phase 9 push-only sync: drains src/db/schema.ts's `syncOutbox` table into Supabase's `series`/
// `series_entries` (see supabase/migrations/20260807000000_series_schema.sql). No pull yet — a
// second device's changes don't come back down until Phase 10 wires up pull/merge/Realtime on top
// of this. Guest mode and an account with no session both just accumulate outbox rows that never
// drain, which is fine: nothing here assumes the outbox empties promptly, only that it eventually
// does once a session exists.
//
// Identity: Postgres `series` rows are keyed by (user_id, root_mal_id), `series_entries` by
// (series_id, mal_id) — see that migration's comment for why (idempotent across devices with no
// client-generated UUIDs). The one wrinkle that identity creates here: a local `series_entries`
// row only knows its *local* parent series id, but Postgres needs the parent's *remote* UUID to
// satisfy series_entries.series_id's foreign key. So series rows are always drained to completion
// before entries rows in the same pass, and entries resolve their parent's remote id via a lookup
// keyed on the parent's root_mal_id (which every local series row already carries).
import { eq, inArray } from 'drizzle-orm';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { supabase } from '@/account/supabaseClient';
import { db } from '@/db/client';
import { series, seriesEntries, syncOutbox } from '@/db/schema';

const BATCH_SIZE = 50;
const DEBOUNCE_MS = 2000;
const PERIODIC_MS = 60_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let draining = false;
let redrainRequested = false;

/** Fire-and-forget trigger — called by every AnimeRepository write after its transaction commits.
 * Debounced so a burst of taps (marking a whole season watched) coalesces into one drain instead
 * of one network round trip per row. */
export function requestOutboxDrain(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void drainOutbox();
  }, DEBOUNCE_MS);
}

/** Entry point for the periodic/foreground triggers below — also safe to call directly (e.g. a
 * future manual "sync now" affordance). Re-entrant: a call that arrives mid-drain schedules one
 * more pass after the current one finishes, rather than running concurrently against the same
 * rows. */
export async function drainOutbox(): Promise<void> {
  if (draining) {
    redrainRequested = true;
    return;
  }
  draining = true;
  try {
    await drainBatchesUntilEmpty();
  } finally {
    draining = false;
    if (redrainRequested) {
      redrainRequested = false;
      void drainOutbox();
    }
  }
}

/**
 * A library imported (or previously synced) before this device ever had an account linked — or
 * before Phase 9 existed at all — has local series/entries that were never individually queued to
 * the outbox (`replaceAllSeries` deliberately skips it, see AnimeRepository.ts). Without this,
 * every entry-level edit to an existing show would retry forever: drainEntryBatch can't attach a
 * series_entries row to a parent that was never pushed. So the first drain for a given account on
 * this device queues one outbox row per existing local series/entry (additive, never a wipe) —
 * the plan's "initial adoption" bulk push, just triggered by the first drain rather than the
 * link-account UI specifically, since that's every path that can produce a fresh session here.
 */
async function ensureInitialAdoptionQueued(userId: string): Promise<void> {
  // SecureStore keys are alphanumeric/.-_ only — a raw uuid already satisfies that, but building
  // the key this way (rather than string-concatenating with a disallowed separator like ':')
  // keeps that constraint from being a trap for the next key added here.
  const flagKey = ['sync_initial_adoption_done', userId].join('_');
  if ((await SecureStore.getItemAsync(flagKey)) !== null) return;

  db.transaction((tx) => {
    const seriesIds = tx.select({ id: series.id }).from(series).all();
    for (const row of seriesIds) queueLocalOutbox(tx, 'series', row.id);
    const entryIds = tx.select({ id: seriesEntries.id }).from(seriesEntries).all();
    for (const row of entryIds) queueLocalOutbox(tx, 'series_entries', row.id);
  });
  await SecureStore.setItemAsync(flagKey, '1');
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Same upsert-into-outbox shape as AnimeRepository.ts's queueOutbox — kept as a separate copy
 * here (not imported) so this module never depends on AnimeRepository, which itself depends on
 * this module to trigger drains after a write. */
function queueLocalOutbox(tx: Transaction, entity: 'series' | 'series_entries', localId: number): void {
  tx.insert(syncOutbox)
    .values({ entity, localId, createdAtEpochMillis: Date.now() })
    .onConflictDoUpdate({
      target: [syncOutbox.entity, syncOutbox.localId],
      set: { createdAtEpochMillis: Date.now() },
    })
    .run();
}

async function drainBatchesUntilEmpty(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  const userId = session.user.id;
  await ensureInitialAdoptionQueued(userId);

  for (;;) {
    const pending = await db.select().from(syncOutbox).limit(BATCH_SIZE);
    if (pending.length === 0) return;

    const succeededIds = await drainBatch(userId, pending);
    if (succeededIds.length > 0) {
      await db.delete(syncOutbox).where(inArray(syncOutbox.id, succeededIds));
    }
    // Nothing succeeded this pass (e.g. genuinely offline) — stop rather than tight-looping
    // against the same stuck rows forever. The next debounced/periodic/foreground trigger retries.
    if (succeededIds.length === 0) return;
    if (pending.length < BATCH_SIZE) return;
  }
}

type OutboxRow = typeof syncOutbox.$inferSelect;

async function drainBatch(userId: string, pending: OutboxRow[]): Promise<number[]> {
  const succeededIds: number[] = [];
  const seriesOutbox = pending.filter((r) => r.entity === 'series');
  const entryOutbox = pending.filter((r) => r.entity === 'series_entries');

  for (const row of seriesOutbox) {
    const [local] = await db.select().from(series).where(eq(series.id, row.localId));
    if (!local) {
      succeededIds.push(row.id); // superseded locally (e.g. a re-import) — nothing left to push
      continue;
    }
    const { error } = await supabase.from('series').upsert(
      {
        user_id: userId,
        title: local.title,
        cover_url: local.coverUrl,
        genres: local.genres,
        root_mal_id: local.rootMalId,
        type: local.type,
        manual_status: local.manualStatus,
        new_season_available: local.newSeasonAvailable,
        new_season_aired_at: local.newSeasonAiredAtEpochMillis
          ? new Date(local.newSeasonAiredAtEpochMillis).toISOString()
          : null,
        liked: local.liked,
      },
      { onConflict: 'user_id,root_mal_id' },
    );
    if (error) await bumpRetry(row.id);
    else succeededIds.push(row.id);
  }

  if (entryOutbox.length > 0) {
    succeededIds.push(...(await drainEntryBatch(userId, entryOutbox)));
  }

  return succeededIds;
}

async function drainEntryBatch(userId: string, entryOutbox: OutboxRow[]): Promise<number[]> {
  const succeededIds: number[] = [];
  const localEntries = await db
    .select()
    .from(seriesEntries)
    .where(inArray(seriesEntries.id, entryOutbox.map((r) => r.localId)));
  const localEntryById = new Map(localEntries.map((e) => [e.id, e]));

  const localSeriesIdsNeeded = Array.from(new Set(localEntries.map((e) => e.seriesId)));
  const localSeriesRows =
    localSeriesIdsNeeded.length > 0
      ? await db.select().from(series).where(inArray(series.id, localSeriesIdsNeeded))
      : [];
  const rootMalIdByLocalSeriesId = new Map(localSeriesRows.map((s) => [s.id, s.rootMalId]));

  const rootMalIds = Array.from(new Set(localSeriesRows.map((s) => s.rootMalId)));
  const { data: remoteSeriesRows, error: lookupError } =
    rootMalIds.length > 0
      ? await supabase.from('series').select('id, root_mal_id').eq('user_id', userId).in('root_mal_id', rootMalIds)
      : { data: [] as { id: string; root_mal_id: number }[], error: null };

  if (lookupError) {
    for (const row of entryOutbox) await bumpRetry(row.id);
    return succeededIds;
  }
  const remoteSeriesIdByRootMalId = new Map((remoteSeriesRows ?? []).map((r) => [r.root_mal_id, r.id]));

  for (const row of entryOutbox) {
    const local = localEntryById.get(row.localId);
    if (!local) {
      succeededIds.push(row.id);
      continue;
    }
    const rootMalId = rootMalIdByLocalSeriesId.get(local.seriesId);
    const remoteSeriesId = rootMalId !== undefined ? remoteSeriesIdByRootMalId.get(rootMalId) : undefined;
    if (!remoteSeriesId) {
      // Parent series hasn't landed remotely yet (its own outbox row failed this pass, or hasn't
      // been queued yet) — retry once it has.
      await bumpRetry(row.id);
      continue;
    }
    const { error } = await supabase.from('series_entries').upsert(
      {
        series_id: remoteSeriesId,
        user_id: userId,
        mal_id: local.malId,
        kind: local.kind,
        order_index: local.orderIndex,
        title: local.title,
        episode_count: local.episodeCount,
        watch_state: local.watchState,
        airing_status: local.airingStatus,
        watched_arc_keys: local.watchedArcKeys,
      },
      { onConflict: 'series_id,mal_id' },
    );
    if (error) await bumpRetry(row.id);
    else succeededIds.push(row.id);
  }
  return succeededIds;
}

async function bumpRetry(outboxRowId: number): Promise<void> {
  const [row] = await db.select({ retryCount: syncOutbox.retryCount }).from(syncOutbox).where(eq(syncOutbox.id, outboxRowId));
  if (row) await db.update(syncOutbox).set({ retryCount: row.retryCount + 1 }).where(eq(syncOutbox.id, outboxRowId));
}

/** Called once from app/_layout.tsx — mirrors registerBackgroundSync()'s "safe to call on every
 * launch" shape. Drains on launch, on every foreground transition, and on a periodic timer while
 * foregrounded (backgrounding the app doesn't need its own handling: RN just stops running JS). */
export function startSyncEngine(): void {
  requestOutboxDrain();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') requestOutboxDrain();
  });
  setInterval(() => {
    void drainOutbox();
  }, PERIODIC_MS);
}
