// Fetches the signed-in user's full MAL list plus the related-anime detail closure, server-side
// (this needs the user's own bearer token, so it can't be the public malGetPublic path). Returns
// raw DTOs — grouping (groupIntoSeries) and the rest of the reconcile-building logic stay
// client-side in src/domain/, deliberately not duplicated here (see the plan doc's §4/§5).
import { getRequestUserId } from '../_shared/supabaseAdmin.ts';
import { getValidMalAccessToken } from '../_shared/malAuth.ts';
import { malGetAuthed, malGetUrlAuthed, malGetPublic } from '../_shared/malProxy.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { describeError } from '../_shared/errors.ts';
import { readCachedDetails, writeCachedDetails } from '../_shared/apiCache.ts';

// 10 rather than the original 6, for user-visible latency: this is one MAL call per anime across a
// whole list plus its relation closure, and it's the slowest thing in the app by a wide margin.
// (Not the same reasoning as the reverted 92880b4 bump, which was chasing a timeout that turned out
// to be the token RPC failing instead — see c7515e6.) Still modest, still a once-per-account
// operation, and with the shared cache above a repeat run mostly doesn't reach MAL at all, so this
// stays comfortably inside guardrail #3's "never hammer endpoints in tight loops".
const DETAIL_CONCURRENCY = 10;
const MAX_CLOSURE_PASSES = 5;

interface AnimeNodeDto { id: number; title: string }
interface AnimeListEntryDto { node: AnimeNodeDto; list_status: { status: string } }
interface AnimeListResponseDto { data: AnimeListEntryDto[]; paging: { next?: string | null } }
interface AnimeDetailDto {
  id: number;
  title: string;
  media_type: string;
  related_anime?: { node: AnimeNodeDto; relation_type: string }[];
  [key: string]: unknown;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

const DETAIL_FIELDS = 'related_anime,media_type,num_episodes,genres,main_picture,title,alternative_titles,status,start_season,mean,synopsis';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return jsonResponse({ error: 'Not signed in.' }, 401);
    const accessToken = await getValidMalAccessToken(userId);
    if (!accessToken) return jsonResponse({ error: 'MyAnimeList is not linked to this account.' }, 403);

    const entries: AnimeListEntryDto[] = [];
    let page = await malGetAuthed<AnimeListResponseDto>(accessToken, 'users/@me/animelist', {
      fields: 'list_status,num_episodes,media_type',
      limit: 1000,
    });
    entries.push(...page.data);
    while (page.paging.next) {
      page = await malGetUrlAuthed<AnimeListResponseDto>(accessToken, page.paging.next);
      entries.push(...page.data);
    }

    const detailById = new Map<number, AnimeDetailDto>();
    // Ids MAL wouldn't return (404s on stale relation edges are common), tracked so the closure
    // passes below don't re-request the same dead id on every one of their MAX_CLOSURE_PASSES.
    const unavailable = new Set<number>();

    /**
     * Resolves details for `ids` into detailById: shared cache first, then MAL for whatever's left,
     * writing the fetched ones back. This is where nearly all of an import's wall-clock time goes
     * (one MAL call per anime, and the closure below multiplies that), so the cache is what makes a
     * retry — or a second user with overlapping shows — fast instead of a full re-fetch.
     */
    async function loadDetails(ids: number[]): Promise<void> {
      const wanted = ids.filter((id) => !detailById.has(id) && !unavailable.has(id));
      if (wanted.length === 0) return;

      for (const [id, dto] of await readCachedDetails<AnimeDetailDto>(wanted)) detailById.set(id, dto);

      const toFetch = wanted.filter((id) => !detailById.has(id));
      const fetched = new Map<number, AnimeDetailDto>();
      await mapWithConcurrency(toFetch, DETAIL_CONCURRENCY, async (id) => {
        try {
          const dto = await malGetPublic<AnimeDetailDto>(`anime/${id}`, { fields: DETAIL_FIELDS });
          fetched.set(id, dto);
          detailById.set(id, dto);
        } catch {
          // Best-effort, same as the old client-side ImportRepository — a dropped id is simply left
          // out of the grouping the client does with this response.
          unavailable.add(id);
        }
      });
      await writeCachedDetails(fetched);
    }

    await loadDetails(entries.map((entry) => entry.node.id));

    // Closure expansion: chase sequel/prequel/side-story ids referenced by related_anime that
    // aren't in detailById yet, same MAX_CLOSURE_PASSES-bounded loop the old ImportRepository ran
    // client-side — this is mechanical set-difference bookkeeping, not the grouping algorithm
    // itself, so duplicating just this part here (not groupIntoSeries) stays within the "Edge
    // Functions are proxies, not a second home for domain logic" rule.
    for (let pass = 0; pass < MAX_CLOSURE_PASSES; pass++) {
      const missing = new Set<number>();
      for (const detail of detailById.values()) {
        for (const rel of detail.related_anime ?? []) {
          if (!detailById.has(rel.node.id) && !unavailable.has(rel.node.id)) missing.add(rel.node.id);
        }
      }
      if (missing.size === 0) break;
      await loadDetails(Array.from(missing));
    }

    return jsonResponse({
      entries,
      details: Object.fromEntries(Array.from(detailById.entries()).map(([id, d]) => [String(id), d])),
    });
  } catch (e) {
    // describeError, not `instanceof Error`: see _shared/errors.ts for why that check was hiding
    // the real cause behind a generic message.
    console.error('mal-import failed:', e);
    return jsonResponse({ error: `mal-import failed: ${describeError(e)}` }, 500);
  }
});
