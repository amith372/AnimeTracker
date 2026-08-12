// MAL redirects here after the user approves/denies on MAL's own login page — public (no Supabase
// JWT present; MAL is the one calling this, as a browser redirect). `state` is how this recovers
// which mal_oauth_sessions row (and therefore which flow variant) this belongs to.
//
// Two variants, branching on whether that row's user_id was already known at mal-oauth-start:
//  - Linking (user_id known): attach MAL to that existing account, done.
//  - Sign-in (user_id null): resolve or create the Supabase account from the MAL identity, then
//    hand the client a one-time handoff code (never real session tokens) to trade at
//    mal-session-exchange — see the plan doc's §1 for why tokens never travel in a redirect URL.
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { exchangeAuthorizationCode } from '../_shared/malAuth.ts';
import { malGetAuthed } from '../_shared/malProxy.ts';
import { generateHandoffCode } from '../_shared/pkce.ts';

const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mal-oauth-callback`;
// Origin of the deployed app itself (e.g. https://animetracker-btpk.onrender.com), used only by the
// web finish below. Not the same value as SUPABASE_URL — see that function's comment for why.
const SITE_URL = Deno.env.get('SITE_URL');

// Plain-text response — used only for the two edge cases below where we don't yet know which
// platform to redirect to (no session row resolved yet). Deliberately not HTML: Supabase's gateway
// downgrades any HTML-ish Content-Type to text/plain anyway (see webFinish's comment), so tags here
// would just show up as literal, visible text.
function text(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

/**
 * Web finish: redirect the popup to our own app's /oauth-complete route, which does the
 * postMessage-to-opener + window.close() handoff (see app/oauth-complete.tsx). This used to return
 * inline HTML with a <script> tag directly from this function — Supabase's Edge Function gateway
 * now silently downgrades any HTML-ish response's Content-Type to text/plain and injects a
 * `sandbox` Content-Security-Policy (confirmed via a raw curl against the deployed function: a JSON
 * response passes through untouched, an HTML one does not), presumably to stop *.supabase.co from
 * being usable to host arbitrary live/scripted pages. That makes returning executable HTML directly
 * from this domain a dead end regardless of what headers the function itself sets — the fix is to
 * redirect to a domain we actually control instead, mirroring how the mobile variant already
 * redirects to its own animetracker:// scheme rather than trying to execute anything here.
 */
function webFinish(payload: Record<string, string>): Response {
  const qs = new URLSearchParams(payload).toString();
  return redirect(`${SITE_URL}/oauth-complete?${qs}`);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const malError = url.searchParams.get('error');

  if (!state) return text('Invalid MAL redirect (missing state).');

  const { data: session, error: sessionError } = await supabaseAdmin
    .from('mal_oauth_sessions')
    .select('*')
    .eq('state', state)
    .maybeSingle();

  if (sessionError || !session || session.used || new Date(session.expires_at) < new Date()) {
    return text('This MyAnimeList login link is no longer valid — please try again.');
  }
  await supabaseAdmin.from('mal_oauth_sessions').update({ used: true }).eq('state', state);

  const finishError = (message: string) =>
    session.platform === 'mobile'
      ? redirect(`animetracker://auth?malError=${encodeURIComponent(message)}`)
      : webFinish({ malError: message });

  if (malError || !code) return finishError(malError ?? 'MAL login was cancelled.');

  try {
    const token = await exchangeAuthorizationCode({ code, codeVerifier: session.code_verifier, redirectUri: REDIRECT_URI });
    const me = await malGetAuthed<{ id: number }>(token.access_token, 'users/@me', { fields: 'id' });
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    if (session.user_id) {
      // Linking variant — attach to the already-known account.
      const { error } = await supabaseAdmin.from('mal_accounts').upsert({
        user_id: session.user_id,
        mal_user_id: me.id,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        access_token_expires_at: expiresAt,
      });
      if (error) throw error;

      return session.platform === 'mobile' ? redirect('animetracker://auth?linked=1') : webFinish({ linked: '1' });
    }

    // Sign-in variant — find the Supabase account this MAL identity already belongs to, or create
    // a fresh one. MAL's API never exposes an email, so the account gets a synthetic placeholder;
    // nobody ever logs in with it directly, only via this MAL OAuth flow.
    const { data: existing } = await supabaseAdmin.from('mal_accounts').select('user_id').eq('mal_user_id', me.id).maybeSingle();

    let resolvedUserId: string;
    if (existing) {
      resolvedUserId = existing.user_id;
    } else {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: `mal-${me.id}@mal-users.animetracker.app`,
        email_confirm: true,
        user_metadata: { mal_user_id: me.id },
      });
      if (createError || !created.user) throw createError ?? new Error('Failed to create account');
      resolvedUserId = created.user.id;
    }

    const { error: upsertError } = await supabaseAdmin.from('mal_accounts').upsert({
      user_id: resolvedUserId,
      mal_user_id: me.id,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      access_token_expires_at: expiresAt,
    });
    if (upsertError) throw upsertError;

    const handoffCode = generateHandoffCode();
    const { error: handoffError } = await supabaseAdmin.from('mal_session_handoffs').insert({ code: handoffCode, user_id: resolvedUserId });
    if (handoffError) throw handoffError;

    return session.platform === 'mobile'
      ? redirect(`animetracker://auth?handoff=${handoffCode}`)
      : webFinish({ handoff: handoffCode });
  } catch (e) {
    return finishError(e instanceof Error ? e.message : 'MyAnimeList login failed.');
  }
});
