// Trades a one-time "sign in with MAL" handoff code (see mal-oauth-callback) for a real Supabase
// session. Public but code-gated: the code is single-use, short-TTL, and only ever transmitted
// over the redirect (never the session tokens themselves — see the plan doc's §1 for why).
//
// Mechanics: mint a magic-link token server-side via the Admin API (this does NOT send an email —
// generateLink just creates the token, we consume it ourselves), then redeem it with a plain
// (non-admin) client's verifyOtp to get back an actual access/refresh token pair, exactly as if
// the user had clicked a real magic link.
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { supabaseAnon } from '../_shared/supabaseAnon.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { describeError } from '../_shared/errors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const { code } = await req.json();
    if (typeof code !== 'string') return jsonResponse({ error: 'code is required' }, 400);

    const { data: handoff, error: handoffError } = await supabaseAdmin
      .from('mal_session_handoffs')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (handoffError || !handoff || handoff.used || new Date(handoff.expires_at) < new Date()) {
      return jsonResponse({ error: 'This login link has expired or was already used.' }, 400);
    }
    await supabaseAdmin.from('mal_session_handoffs').update({ used: true }).eq('code', code);

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(handoff.user_id);
    if (userError || !userData.user?.email) throw userError ?? new Error('Account not found');

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email,
    });
    if (linkError || !linkData.properties?.hashed_token) throw linkError ?? new Error('Could not create sign-in link');

    // token_hash alone (with type) is the whole credential here — GoTrue's verifyOtp rejects a
    // token_hash call that also carries `email` ("Only the token_hash and type should be
    // provided"), since email only belongs to the separate token+email+type variant.
    const { data: verifyData, error: verifyError } = await supabaseAnon.auth.verifyOtp({
      type: 'magiclink',
      token_hash: linkData.properties.hashed_token,
    });
    if (verifyError || !verifyData.session) throw verifyError ?? new Error('Could not verify sign-in link');

    return jsonResponse({ session: verifyData.session });
  } catch (e) {
    return jsonResponse({ error: `mal-session-exchange failed: ${describeError(e)}` }, 500);
  }
});
