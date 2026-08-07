// Starts the MAL OAuth PKCE dance — callable authenticated (linking MAL to an existing Supabase
// account) or unauthenticated ("Continue with MyAnimeList", sign-in itself). See CLAUDE.md's
// account model and the plan doc's §1 for why both share this one function rather than being two
// separate endpoints: the only difference is whether `user_id` is known yet.
import { supabaseAdmin, getRequestUserId } from '../_shared/supabaseAdmin.ts';
import { buildAuthorizeUrl, generateCodeVerifier, generateOAuthState } from '../_shared/pkce.ts';
import { MAL_CLIENT_ID } from '../_shared/malAuth.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

// Fixed for every user/platform — MAL's redirect always lands on mal-oauth-callback, never on the
// client directly. This is what makes the web variant work with no custom URL scheme, and it means
// MAL's developer console only ever needs one registered redirect URI (verify this against MAL's
// actual app-registration limits before relying on it in production — see the plan doc's open risk).
const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mal-oauth-callback`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const { platform } = await req.json();
    if (platform !== 'mobile' && platform !== 'web') {
      return jsonResponse({ error: 'platform must be "mobile" or "web"' }, 400);
    }

    // Present -> linking variant (attach MAL to the signed-in account). Absent -> sign-in variant
    // ("Continue with MyAnimeList" itself, no Supabase session exists yet).
    const userId = await getRequestUserId(req);

    const codeVerifier = generateCodeVerifier();
    const state = generateOAuthState();

    const { error } = await supabaseAdmin.from('mal_oauth_sessions').insert({
      state,
      user_id: userId,
      code_verifier: codeVerifier,
      platform,
    });
    if (error) throw error;

    const authorizeUrl = buildAuthorizeUrl({ clientId: MAL_CLIENT_ID, codeVerifier, state, redirectUri: REDIRECT_URI });
    return jsonResponse({ url: authorizeUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : JSON.stringify(e);
    return jsonResponse({ error: `mal-oauth-start failed: ${message}` }, 500);
  }
});
