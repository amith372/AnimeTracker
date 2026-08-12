// Thin, typed wrappers around Supabase Edge Function calls — the RN-side counterpart to
// supabase/functions/*. supabase-js's `functions.invoke` automatically attaches the current
// session's access token as `Authorization: Bearer <token>` when one exists, so an authenticated
// call (mal-import, mal-push, the linking variant of mal-oauth-start) needs nothing extra; an
// unauthenticated call (mal-discover, mal-anime-detail, mal-recommendations, the sign-in variant
// of mal-oauth-start) just goes through with none.
import { supabase } from '@/account/supabaseClient';

async function invoke<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // A non-2xx response (FunctionsHttpError) carries the actual {error: "..."} body our functions
    // send via jsonResponse() on `error.context` (the raw Response) — supabase-js's own
    // `error.message` is just the generic "Edge Function returned a non-2xx status code" and hides
    // it, so unwrap the real detail here rather than losing it at every call site.
    const context = (error as { context?: Response }).context;
    let detail: string | undefined;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.clone().json();
        if (typeof body?.error === 'string') detail = body.error;
      } catch {
        // context wasn't JSON (or already consumed) — fall through to the generic message below.
      }
    }
    throw new Error(detail ?? error.message ?? `${name} failed`);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function callMalOauthStart(platform: 'mobile' | 'web'): Promise<{ url: string }> {
  return invoke('mal-oauth-start', { platform });
}

export function callMalSessionExchange(code: string): Promise<{ session: { access_token: string; refresh_token: string } }> {
  return invoke('mal-session-exchange', { code });
}

/** Phase 1 of an import: the user's whole MAL list. Needs MAL linked to the current account. */
export function callMalImportList(): Promise<{ entries: unknown[] }> {
  return invoke('mal-import', { phase: 'list' });
}

/** Phase 2, called once per batch so ImportRepository can report real progress — ids MAL wouldn't
 * return are simply absent from the response rather than failing the batch. */
export function callMalImportDetails(ids: number[]): Promise<{ details: Record<string, unknown> }> {
  return invoke('mal-import', { phase: 'details', ids });
}

export function callMalDiscover<T>(request: { type: 'season'; year: number; season: string; offset?: number } | { type: 'ranking'; rankingType: string; offset?: number } | { type: 'search'; query: string; offset?: number }): Promise<T> {
  return invoke('mal-discover', request);
}

export function callMalAnimeDetail<T>(id: number): Promise<T> {
  return invoke('mal-anime-detail', { id });
}

export function callMalRecommendations<T>(id: number): Promise<T> {
  return invoke('mal-recommendations', { id });
}

export function callMalPush(targets: { malId: number; status: 'plan_to_watch' | 'watching' | 'completed' }[]): Promise<{ updated: number; failed: number }> {
  return invoke('mal-push', { targets });
}

/** Phase 11: runs monthly sync for just the calling user, synchronously — the "Sync now" button's
 * path. A scheduled pg_cron job calls the same Edge Function for every linked account instead;
 * see supabase/functions/mal-monthly-sync's header comment. */
export function callMalMonthlySync(): Promise<{ seriesWithNewSeasons: number }> {
  return invoke('mal-monthly-sync');
}
