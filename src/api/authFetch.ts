// Shared authenticated GET helper for MAL's data API — contrast malAuthApi.ts's OAuth token
// endpoints, which authenticate via client_id in the body, not a bearer token. Every data-API
// call (import, discover, sync) goes through this.
import { getValidAccessToken, refreshAccessToken } from '@/auth/authRepository';
import { getAccessToken } from '@/auth/tokenStore';

const MAL_API_BASE = 'https://api.myanimelist.net/v2';
// MAL accepts this in place of a bearer token on endpoints that don't need user context (search,
// ranking, season, anime detail) — what lets guest mode's Discover keep working with no OAuth
// session at all. It does NOT work for user-scoped endpoints like /users/@me/animelist, but guest
// mode never calls those (there's no list to import without an account).
const CLIENT_ID = process.env.EXPO_PUBLIC_MAL_CLIENT_ID ?? '';
// A handful of requests during Recommendations' candidate-detail stage were observed hanging
// indefinitely — no error, no response, just a promise that never settles (worse than a slow
// response or even a MAL 504, which at least eventually rejects). Without a hard cutoff, one bad
// request stalls a whole batch forever with no way to retry. 20s is generous for a single detail
// fetch but still short enough that a hang surfaces as a normal, retryable error.
const REQUEST_TIMEOUT_MS = 20_000;

/** A GET has no body; a PUT (currently only the push-to-MAL write, CLAUDE.md §8) sends one
 * form-encoded field per call. */
interface MalRequestInit {
  method?: 'GET' | 'PUT';
  body?: string;
}

/**
 * One authenticated MAL request. `allowRefreshRetry` is what stops the 401 path below from
 * recursing: the retry runs with it false, so a token that's still rejected after a successful
 * refresh fails normally instead of looping.
 */
async function malFetch<T>(url: string, init: MalRequestInit = {}, allowRefreshRetry = true): Promise<T> {
  const token = await getValidAccessToken();
  // No stored token doesn't necessarily mean "reject the request" — guest mode (no MAL account at
  // all) still needs to hit MAL's public endpoints for Discover, just identified by client id
  // instead of a user's bearer token. This header only works for endpoints that don't need user
  // context, though — a PUT always writes to a specific user's own list, so it has no unauthenticated
  // fallback at all (a guest has no MAL account to write to in the first place).
  if (!token && (init.method === 'PUT' || !CLIENT_ID)) throw new Error('Not logged in.');
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : { 'X-MAL-CLIENT-ID': CLIENT_ID };
  if (init.body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { method: init.method ?? 'GET', headers, body: init.body, signal: controller.signal });
  } catch (e) {
    // React Native's fetch doesn't throw a DOMException with name "AbortError" like browser
    // fetch does — it throws a plain TypeError with a "canceled" message. Matching on the
    // controller's own aborted flag (rather than the error shape) works regardless.
    if (controller.signal.aborted) {
      throw new Error('MAL request timed out.');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
  // A 401 despite a token we believed was valid means the stored expiry was wrong or MAL revoked
  // the token early — recoverable exactly once, by refreshing and retrying. The token-comparison
  // check keeps a batch of concurrent requests from each triggering their own refresh: if the
  // stored token already changed while this request was in flight, someone else has refreshed and
  // this one just needs to be reissued.
  if (response.status === 401 && allowRefreshRetry && token) {
    const current = await getAccessToken();
    if (current === token) {
      const refreshed = await refreshAccessToken();
      if (!refreshed.success) throw new Error(refreshed.message);
    }
    return malFetch<T>(url, init, false);
  }
  if (!response.ok) {
    throw new Error(`MAL request failed (HTTP ${response.status})`);
  }
  return response.json();
}

/** GET a MAL endpoint by path (relative to the v2 API base) with query params. */
export function malGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`${MAL_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return malFetch(url.toString());
}

/** GET a full URL MAL already built for us (e.g. `paging.next` from a list response). */
export function malGetUrl<T>(fullUrl: string): Promise<T> {
  return malFetch(fullUrl);
}

/** PUT a MAL endpoint by path with a form-encoded body — CLAUDE.md §8's one write path. Fields
 * not present in `fields` are left untouched on MAL, never reset. */
export function malPut<T>(path: string, fields: Record<string, string>): Promise<T> {
  const url = `${MAL_API_BASE}/${path}`;
  const body = Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return malFetch(url, { method: 'PUT', body });
}
