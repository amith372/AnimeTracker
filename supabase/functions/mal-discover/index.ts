// Proxies MAL's browse endpoints (season/ranking/search) — public, no Supabase session required,
// since these never needed user context even when the client called MAL directly (see the old
// authFetch.ts's client-id fallback). Kept as one function with a `type` discriminator rather than
// three, since they're one thin pass-through each.
import { malGetPublic } from '../_shared/malProxy.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

const BROWSE_FIELDS = 'media_type,genres,main_picture,num_episodes,start_season,status,alternative_titles';
const BROWSE_PAGE_SIZE = 25;

type DiscoverRequest =
  | { type: 'season'; year: number; season: string; offset?: number }
  | { type: 'ranking'; rankingType: string; offset?: number }
  | { type: 'search'; query: string; offset?: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const body: DiscoverRequest = await req.json();
    const offset = body.offset ?? 0;

    let data;
    if (body.type === 'season') {
      data = await malGetPublic(`anime/season/${body.year}/${body.season}`, { fields: BROWSE_FIELDS, limit: BROWSE_PAGE_SIZE, offset });
    } else if (body.type === 'ranking') {
      data = await malGetPublic('anime/ranking', { ranking_type: body.rankingType, fields: BROWSE_FIELDS, limit: BROWSE_PAGE_SIZE, offset });
    } else if (body.type === 'search') {
      data = await malGetPublic('anime', { q: body.query, fields: BROWSE_FIELDS, limit: BROWSE_PAGE_SIZE, offset });
    } else {
      return jsonResponse({ error: 'Unknown discover request type' }, 400);
    }

    return jsonResponse(data);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'mal-discover failed' }, 500);
  }
});
