// Fetches the signed-in user's MAL list, and (separately) batches of anime details — server-side,
// because the list read needs the user's own bearer token, which never leaves the server.
//
// Two phases rather than one all-in-one call, so the client can render real progress. A single
// opaque call left the reconcile screen sitting on "Fetching your MyAnimeList..." for the whole
// import with no way to report how far along it was; the client now asks for details in batches and
// counts them (see src/repositories/ImportRepository.ts). Streaming progress back over one request
// was the alternative, but React Native's fetch has no dependable streaming support, so it would
// have worked on web and silently not on Android.
//
//  - phase 'list'    -> the user's whole animelist (authed, paginated).
//  - phase 'details' -> anime/{id} details for a batch of ids (cache-first, public MAL endpoint).
//
// Grouping (groupIntoSeries) and the relation-closure bookkeeping that decides *which* ids to ask
// for next both stay client-side in src/domain/ + ImportRepository — this function only ever
// answers "give me these DTOs" (see CLAUDE.md's "Edge Functions are proxies" rule).
import { getRequestUserId } from '../_shared/supabaseAdmin.ts';
import { getValidMalAccessToken } from '../_shared/malAuth.ts';
import { malGetAuthed, malGetUrlAuthed, malGetPublic } from '../_shared/malProxy.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { describeError } from '../_shared/errors.ts';
import { readCachedDetails, writeCachedDetails } from '../_shared/apiCache.ts';

// Per-request MAL parallelism. Modest on purpose (guardrail #3), and with the shared cache below a
// repeat import mostly doesn't reach MAL at all.
const DETAIL_CONCURRENCY = 10;
// Bounds how much work one request can ask for; the client batches to well under this anyway.
const MAX_IDS_PER_REQUEST = 100;

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

// Must stay byte-identical to mal-anime-detail's DETAIL_FIELDS — that's what lets both share the
// same api_cache rows (see _shared/apiCache.ts).
const DETAIL_FIELDS = 'related_anime,media_type,num_episodes,genres,main_picture,title,alternative_titles,status,start_season,mean,synopsis';

/** The user's whole MAL list, following `paging.next` to the end. Needs their own bearer token. */
async function fetchWholeList(accessToken: string): Promise<AnimeListEntryDto[]> {
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
  return entries;
}

/**
 * Strips a detail DTO down to what the import actually consumes (groupIntoSeries + the
 * DTO->ReconcileSeries mapping in src/repositories/ImportRepository.ts). Notably drops `synopsis`,
 * usually the single largest field, and `start_season` — an import can pull several hundred of
 * these, so shipping fields nobody reads is a real chunk of an import's wall-clock time on a slow
 * connection. The *cache* still stores the full DTO (see fetchDetails), because Discover and the
 * preview screen share those rows and do use synopsis; only what goes over the wire here is
 * trimmed.
 */
function trimForImport(dto: AnimeDetailDto): Record<string, unknown> {
  const alternativeTitles = dto.alternative_titles as { en?: string } | undefined;
  return {
    id: dto.id,
    title: dto.title,
    // Only `en` is read (displayTitle) — `ja`/`synonyms` would otherwise ride along unused.
    alternative_titles: alternativeTitles?.en ? { en: alternativeTitles.en } : undefined,
    media_type: dto.media_type,
    num_episodes: dto.num_episodes,
    related_anime: dto.related_anime,
    genres: dto.genres,
    main_picture: dto.main_picture,
    mean: dto.mean,
    status: dto.status,
  };
}

/**
 * Details for one batch of ids: shared cache first, MAL for the rest, writing the fetched ones back.
 * Best-effort per id — an id MAL won't return is simply absent from the response, and the client
 * treats that absence as "unavailable, don't ask again" rather than failing the whole import.
 */
async function fetchDetails(ids: number[]): Promise<Map<number, AnimeDetailDto>> {
  const detailById = await readCachedDetails<AnimeDetailDto>(ids);

  const toFetch = ids.filter((id) => !detailById.has(id));
  const fetched = new Map<number, AnimeDetailDto>();
  await mapWithConcurrency(toFetch, DETAIL_CONCURRENCY, async (id) => {
    try {
      const dto = await malGetPublic<AnimeDetailDto>(`anime/${id}`, { fields: DETAIL_FIELDS });
      fetched.set(id, dto);
      detailById.set(id, dto);
    } catch {
      // Left out of the response — see the note above.
    }
  });
  await writeCachedDetails(fetched);

  return detailById;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return jsonResponse({ error: 'Not signed in.' }, 401);

    const body = await req.json().catch(() => ({}));
    const phase = (body as { phase?: string }).phase ?? 'list';

    if (phase === 'details') {
      const rawIds = (body as { ids?: unknown }).ids;
      if (!Array.isArray(rawIds)) return jsonResponse({ error: 'details phase requires an `ids` array.' }, 400);
      const ids = rawIds.filter((id): id is number => typeof id === 'number' && Number.isFinite(id)).slice(0, MAX_IDS_PER_REQUEST);
      // Deliberately no getValidMalAccessToken here: anime details come from MAL's public
      // client-id endpoint, so this phase needs a Supabase session but not a linked MAL account —
      // and skipping the token RPC keeps every batch request that much lighter.
      const details = await fetchDetails(ids);
      return jsonResponse({
        details: Object.fromEntries(Array.from(details.entries()).map(([id, d]) => [String(id), trimForImport(d)])),
      });
    }

    const accessToken = await getValidMalAccessToken(userId);
    if (!accessToken) return jsonResponse({ error: 'MyAnimeList is not linked to this account.' }, 403);
    return jsonResponse({ entries: await fetchWholeList(accessToken) });
  } catch (e) {
    // describeError, not `instanceof Error`: see _shared/errors.ts for why that check was hiding
    // the real cause behind a generic message.
    console.error('mal-import failed:', e);
    return jsonResponse({ error: `mal-import failed: ${describeError(e)}` }, 500);
  }
});
