// Single-anime detail proxy — public (see mal-discover's comment on why: this endpoint never
// needed user context). Used by Discover tiles, Recommendations candidate expansion, the
// not-yet-tracked preview screen's synopsis, and SyncRepository's new-season check (the one thing
// that must keep calling the *uncached* client-side wrapper around this — see apiCache.ts's
// existing rule, which still applies once this is the thing being called).
import { malGetPublic } from '../_shared/malProxy.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { describeError } from '../_shared/errors.ts';

const DETAIL_FIELDS = 'related_anime,media_type,num_episodes,genres,main_picture,title,alternative_titles,status,start_season,mean,synopsis';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const { id } = await req.json();
    if (typeof id !== 'number') return jsonResponse({ error: 'id must be a number' }, 400);
    const data = await malGetPublic(`anime/${id}`, { fields: DETAIL_FIELDS });
    return jsonResponse(data);
  } catch (e) {
    return jsonResponse({ error: `mal-anime-detail failed: ${describeError(e)}` }, 500);
  }
});
