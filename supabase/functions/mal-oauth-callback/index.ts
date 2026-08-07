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

function html(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/html' } });
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

/** Web finish: postMessage to the opener, with a same-tab redirect as the popup-blocked fallback. */
function webFinish(payload: Record<string, string>, fallbackPath: string): Response {
  const qs = new URLSearchParams(payload).toString();
  return html(`<!doctype html><html><body>
    <script>
      if (window.opener) {
        window.opener.postMessage(${JSON.stringify({ source: 'animetracker-mal-auth', ...payload })}, '*');
        window.close();
      } else {
        window.location.replace(${JSON.stringify(fallbackPath)} + '?${qs}');
      }
    </script>
    <p>You can close this window.</p>
  </body></html>`);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const malError = url.searchParams.get('error');

  if (!state) return html('<p>Invalid MAL redirect (missing state).</p>');

  const { data: session, error: sessionError } = await supabaseAdmin
    .from('mal_oauth_sessions')
    .select('*')
    .eq('state', state)
    .maybeSingle();

  if (sessionError || !session || session.used || new Date(session.expires_at) < new Date()) {
    return html('<p>This MyAnimeList login link is no longer valid — please try again.</p>');
  }
  await supabaseAdmin.from('mal_oauth_sessions').update({ used: true }).eq('state', state);

  const finishError = (message: string) =>
    session.platform === 'mobile'
      ? redirect(`animetracker://auth?malError=${encodeURIComponent(message)}`)
      : webFinish({ malError: message }, '/account');

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

      return session.platform === 'mobile' ? redirect('animetracker://auth?linked=1') : webFinish({ linked: '1' }, '/account');
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
      : webFinish({ handoff: handoffCode }, '/account');
  } catch (e) {
    return finishError(e instanceof Error ? e.message : 'MyAnimeList login failed.');
  }
});
