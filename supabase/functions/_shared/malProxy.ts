// Deno port of src/api/authFetch.ts's request plumbing, split into a public half (client-id
// header — search/ranking/season/anime-detail/recommendations never needed user context even on
// the client, see the old malGet's fallback) and an authed half (bearer token — the user's own
// list and the push write, which genuinely need it). No refresh-and-retry-on-401 loop here: unlike
// the client, callers already got a *freshly validated* token from getValidMalAccessToken
// (malAuth.ts) moments before, via the DB-locked refresh RPC, so a 401 here means something
// actually failed rather than "the stored expiry was stale."
const MAL_API_BASE = 'https://api.myanimelist.net/v2';
const MAL_CLIENT_ID = Deno.env.get('MAL_CLIENT_ID')!;
const REQUEST_TIMEOUT_MS = 20_000;

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new Error('MAL request timed out.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function buildUrl(path: string, params: Record<string, string | number>): string {
  const url = new URL(`${MAL_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

/** For endpoints that never needed user context: search, ranking, season, anime detail, recommendations. */
export async function malGetPublic<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const response = await timedFetch(buildUrl(path, params), { headers: { 'X-MAL-CLIENT-ID': MAL_CLIENT_ID } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`MAL request failed (HTTP ${response.status}): ${body}`);
  }
  return response.json();
}

/** The user's own list (mal-import) — requires a bearer token, no client-id fallback possible. */
export async function malGetAuthed<T>(accessToken: string, path: string, params: Record<string, string | number>): Promise<T> {
  const response = await timedFetch(buildUrl(path, params), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`MAL request failed (HTTP ${response.status})`);
  return response.json();
}

/** `paging.next` from a previous getAnimeList response — MAL builds the full URL for us. */
export async function malGetUrlAuthed<T>(accessToken: string, fullUrl: string): Promise<T> {
  const response = await timedFetch(fullUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`MAL request failed (HTTP ${response.status})`);
  return response.json();
}

/** CLAUDE.md §8's one write path — only `status` is ever sent, every other field stays untouched on MAL. */
export async function malPutAuthed<T>(accessToken: string, path: string, fields: Record<string, string>): Promise<T> {
  const response = await timedFetch(`${MAL_API_BASE}/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  if (!response.ok) throw new Error(`MAL request failed (HTTP ${response.status})`);
  return response.json();
}
