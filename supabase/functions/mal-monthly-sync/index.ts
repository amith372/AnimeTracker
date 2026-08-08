// Phase 11: the scheduled, server-side replacement for the old per-device expo-background-task
// job (src/repositories/SyncRepository.ts still exists but is now a thin proxy to this function —
// see its header comment). For every account with MAL linked, walks each eligible series' TV
// season chain forward via `sequel` relation edges and writes any newly-discovered seasons
// directly to Postgres; devices pick the change up through the normal Phase 10 pull/Realtime path,
// with no per-device network call or wake-up needed at all.
//
// Two callers, same core logic (syncUserSeries):
//  - A signed-in user's own "Sync now" button (src/repositories/SyncRepository.ts) — runs just
//    that one account, synchronously, so the UI can show a result immediately.
//  - A Postgres pg_cron job (see the migration this ships with) — has no user session, so it sends
//    the public anon key as `Authorization` (satisfies the gateway's default JWT check, same as any
//    unauthenticated client call — see CLAUDE.md's Setup/secrets on why that key is safe to embed)
//    plus a separate shared `x-cron-secret` header that this function checks itself to authorize
//    the "run every account" mode, checked *before* falling through to the per-user path below.
//
// Eligibility ("series currently derived as Watched or Watched X/Y", CLAUDE.md's Feature spec §6)
// reduces to a plain `manual_status = 'NONE'` filter: PLAN/CURRENTLY_WATCHING/DROPPED/WATCHED_FORGOT
// are all manual and excluded, and deriveSeriesStatus's two NONE-branches (Watched vs Watched X/Y)
// are exhaustive — so no need to duplicate that derivation logic here at all, this is genuinely
// just a WHERE clause. What *does* get duplicated below (displayTitle, mapAiringStatus,
// seasonStartEpochMillis) are three small, already-tested pure functions from src/domain/ that a
// server-authored write has no way to hand off to a client for — there's no device awake to do the
// mapping when this runs on a schedule for an account nobody has open right now. That's a narrower,
// unavoidable version of the same "mechanical, not the grouping algorithm" exception mal-import's
// closure expansion already makes; groupIntoSeries/deriveSeriesStatus/buildPushTargets etc. stay
// client-side only, same as always.
import { supabaseAdmin, getRequestUserId } from '../_shared/supabaseAdmin.ts';
import { malGetPublic } from '../_shared/malProxy.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

const DETAIL_FIELDS = 'related_anime,media_type,num_episodes,status,start_season,title,alternative_titles';
const CRON_SECRET = Deno.env.get('CRON_SECRET');

interface AnimeDetail {
  id: number;
  media_type: string;
  num_episodes: number | null;
  status: string | null;
  start_season?: { year: number; season: string };
  title: string;
  alternative_titles?: { en?: string };
  related_anime?: { relation_type: string; node: { id: number } }[];
}

// --- Ports of src/domain/title.ts, reconcileSeries.ts's mapAiringStatus, and seasonTiming.ts's
// seasonStartEpochMillis — see this file's header comment for why these three (and only these
// three) are duplicated rather than imported. Keep in sync with their src/domain/ originals if
// those ever change; the Jest tests for those files don't cover this copy.
function displayTitle(title: string, englishTitle?: string | null): string {
  const english = englishTitle?.trim();
  return english ? english : title;
}

function mapAiringStatus(malStatus: string | null | undefined): 'FINISHED' | 'AIRING' | 'NOT_YET_AIRED' {
  switch (malStatus) {
    case 'currently_airing':
      return 'AIRING';
    case 'not_yet_aired':
      return 'NOT_YET_AIRED';
    default:
      return 'FINISHED';
  }
}

function seasonStartEpochMillis(year: number, season: string): number {
  const month = ({ winter: 1, spring: 4, summer: 7, fall: 10 } as Record<string, number>)[season.toLowerCase()] ?? 1;
  return Date.UTC(year, month - 1, 1);
}

async function fetchDetailOrNull(id: number): Promise<AnimeDetail | null> {
  try {
    return await malGetPublic<AnimeDetail>(`anime/${id}`, { fields: DETAIL_FIELDS });
  } catch {
    return null;
  }
}

/** Walks forward from one series' last known TV season, same algorithm as the old client-side
 * syncSeries — just reading/writing Postgres directly instead of local SQLite. Returns true if it
 * found (and wrote) at least one new season. */
async function syncOneSeries(seriesId: string): Promise<boolean> {
  const { data: tvSeasons, error: entriesError } = await supabaseAdmin
    .from('series_entries')
    .select('mal_id, order_index')
    .eq('series_id', seriesId)
    .eq('kind', 'TV_SEASON');
  if (entriesError || !tvSeasons || tvSeasons.length === 0) return false;

  const knownTvIds = new Set(tvSeasons.map((e) => e.mal_id));
  const lastKnownSeason = tvSeasons.reduce((latest, e) => (e.order_index > latest.order_index ? e : latest));

  const discovered: AnimeDetail[] = [];
  let currentDetail = await fetchDetailOrNull(lastKnownSeason.mal_id);
  if (!currentDetail) return false;

  for (;;) {
    const sequel = (currentDetail.related_anime ?? []).find((r) => r.relation_type === 'sequel');
    if (!sequel) break;
    const sequelId = sequel.node.id;
    if (knownTvIds.has(sequelId) || discovered.some((d) => d.id === sequelId)) break; // cycle guard
    const nextDetail = await fetchDetailOrNull(sequelId);
    if (!nextDetail || nextDetail.media_type !== 'tv') break;
    discovered.push(nextDetail);
    currentDetail = nextDetail;
  }

  if (discovered.length === 0) return false;

  const newEntries = discovered.map((detail, index) => ({
    series_id: seriesId,
    mal_id: detail.id,
    kind: 'TV_SEASON',
    order_index: lastKnownSeason.order_index + 1 + index,
    title: displayTitle(detail.title, detail.alternative_titles?.en),
    episode_count: detail.num_episodes ?? 0,
    watch_state: 'UNWATCHED',
    airing_status: mapAiringStatus(detail.status),
    // No device authored this write — left null so every device's next pull treats it as a normal
    // remote change to merge in, rather than an echo of its own edit (see src/sync/merge.ts).
    updated_by_device_id: null,
  }));

  const { error: insertError } = await supabaseAdmin.from('series_entries').insert(newEntries);
  if (insertError) throw insertError;

  const newestSeason = discovered[discovered.length - 1].start_season;
  const airedAt = newestSeason ? new Date(seasonStartEpochMillis(newestSeason.year, newestSeason.season)).toISOString() : null;
  const { error: updateError } = await supabaseAdmin
    .from('series')
    .update({ new_season_available: true, new_season_aired_at: airedAt })
    .eq('id', seriesId);
  if (updateError) throw updateError;

  return true;
}

/** All of one user's eligible series — see the header comment for why `manual_status = 'NONE'`
 * alone is the correct eligibility check. Returns how many series got at least one new season. */
async function syncUserSeries(userId: string): Promise<number> {
  const { data: eligible, error } = await supabaseAdmin.from('series').select('id').eq('user_id', userId).eq('manual_status', 'NONE');
  if (error || !eligible) return 0;

  let seriesWithNewSeasons = 0;
  for (const row of eligible) {
    if (await syncOneSeries(row.id)) seriesWithNewSeasons++;
  }
  return seriesWithNewSeasons;
}

function isCronCall(req: Request): boolean {
  const provided = req.headers.get('x-cron-secret');
  return !!CRON_SECRET && provided === CRON_SECRET;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    if (isCronCall(req)) {
      const { data: linkedAccounts, error } = await supabaseAdmin.from('mal_accounts').select('user_id');
      if (error) throw error;
      let usersProcessed = 0;
      let totalSeriesWithNewSeasons = 0;
      for (const { user_id } of linkedAccounts ?? []) {
        totalSeriesWithNewSeasons += await syncUserSeries(user_id);
        usersProcessed++;
      }
      return jsonResponse({ usersProcessed, totalSeriesWithNewSeasons });
    }

    const userId = await getRequestUserId(req);
    if (!userId) return jsonResponse({ error: 'Not signed in.' }, 401);
    const seriesWithNewSeasons = await syncUserSeries(userId);
    return jsonResponse({ seriesWithNewSeasons });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'mal-monthly-sync failed' }, 500);
  }
});
