// Thin, typed wrappers around Supabase Edge Function calls — the RN-side counterpart to
// supabase/functions/*. supabase-js's `functions.invoke` automatically attaches the current
// session's access token as `Authorization: Bearer <token>` when one exists, so an authenticated
// call (mal-import, mal-push, the linking variant of mal-oauth-start) needs nothing extra; an
// unauthenticated call (mal-discover, mal-anime-detail, mal-recommendations, the sign-in variant
// of mal-oauth-start) just goes through with none.
import { supabase } from '@/account/supabaseClient';
import { UserFacingError, isUserFacingEdgeStatus } from '@/repositories/errorMessage';

async function invoke<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // A non-2xx response (FunctionsHttpError) carries the actual {error: "..."} body our functions
    // send via jsonResponse() on `error.context` (the raw Response) — supabase-js's own
    // `error.message` is just the generic "Edge Function returned a non-2xx status code" and hides
    // it, so unwrap the real detail here rather than losing it at every call site.
    const context = (error as { context?: Response }).context;
    let detail: string | undefined;
    const status = context?.status;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.clone().json();
        if (typeof body?.error === 'string') detail = body.error;
      } catch {
        // context wasn't JSON (or already consumed) — fall through to the generic message below.
      }
    }
    // Unwrapping the body was only half the job: every screen passes what it catches through
    // userFacingMessage(), which shows a UserFacingError and replaces anything else with its own
    // fallback. So a sentence one of our functions deliberately wrote for the user has to arrive
    // marked as one, or it is unwrapped and then discarded — which is what made "not linked",
    // "no consent", "provider refused" and "unreachable" all read as the same generic line.
    // isUserFacingEdgeStatus() is the whole rule: anything but a catch-all 500 is ours to show.
    if (detail !== undefined && isUserFacingEdgeStatus(status)) throw new UserFacingError(detail);
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

/** Phase 11: runs monthly sync for just the calling user, synchronously — the "Check for new seasons" button's
 * path. A scheduled pg_cron job calls the same Edge Function for every linked account instead;
 * see supabase/functions/mal-monthly-sync's header comment. */
export function callMalMonthlySync(): Promise<{ seriesWithNewSeasons: number }> {
  return invoke('mal-monthly-sync');
}

/**
 * Plan 1 step 6's taste profile. The body is the whole of what leaves the app — three lists of
 * titles, built by src/domain/tasteProfile.ts's buildTastePayload and nothing else; see
 * supabase/functions/taste-profile for why the function re-checks consent server-side before
 * spending the key. Returns the model's raw object, which parseTasteProfile narrows before any of
 * it renders.
 */
export function callTasteProfile(payload: {
  liked: string[];
  watchedNeutral: string[];
  dropped: string[];
}): Promise<{ profile: unknown }> {
  return invoke('taste-profile', payload);
}

/**
 * Plan 1 step 7's candidate generator. The body is the whole of what leaves the app — the stored
 * taste profile plus the titles the user already tracks, built by
 * src/domain/candidateGenerator.ts's buildGeneratorPayload; see supabase/functions/taste-candidates
 * for why the function re-checks consent and spends a daily quota before touching the key.
 * Returns raw title strings, every one of which still has to survive the resolution gate before it
 * can become a recommendation.
 */
export function callTasteCandidates(payload: {
  profile: { summary: string; seeksOut: string[]; tolerates: string[]; avoids: string[] };
  exclude: string[];
}): Promise<{ titles: string[] }> {
  return invoke('taste-candidates', payload);
}

/** Plan 1 step 5½'s "delete everything" — removes the signed-in account's rows and the account
 * itself. `remaining` names any table the server couldn't clear, and is empty on a clean delete;
 * see supabase/functions/delete-account for why a partial result is reported rather than thrown. */
export function callDeleteAccount(): Promise<{ deleted: boolean; remaining: string[] }> {
  return invoke('delete-account');
}
