// CLAUDE.md §8's one write path, server-side: receives push targets the client already resolved
// via src/domain/malPush.ts's buildPushTargets (that decision logic stays client-side — this is a
// dumb proxy, same rule as every other MAL-proxying function). Requires a signed-in, MAL-linked
// user; best-effort per entry, matching the old MalPushRepository's behavior.
import { getRequestUserId } from '../_shared/supabaseAdmin.ts';
import { getValidMalAccessToken } from '../_shared/malAuth.ts';
import { malPutAuthed } from '../_shared/malProxy.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { describeError } from '../_shared/errors.ts';

type PushStatus = 'plan_to_watch' | 'watching' | 'completed';
interface PushTarget { malId: number; status: PushStatus }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return jsonResponse({ error: 'Not signed in.' }, 401);
    const accessToken = await getValidMalAccessToken(userId);
    if (!accessToken) return jsonResponse({ error: 'MyAnimeList is not linked to this account.' }, 403);

    const { targets }: { targets: PushTarget[] } = await req.json();
    let updated = 0;
    let failed = 0;
    for (const target of targets) {
      try {
        await malPutAuthed(accessToken, `anime/${target.malId}/my_list_status`, { status: target.status });
        updated++;
      } catch {
        failed++;
      }
    }

    return jsonResponse({ updated, failed });
  } catch (e) {
    return jsonResponse({ error: `mal-push failed: ${describeError(e)}` }, 500);
  }
});
