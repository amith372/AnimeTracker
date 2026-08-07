// Deno port of src/domain/pkce.ts's generation logic — same charset/lengths, so the two stay
// behaviorally identical even though this side runs server-side now (see CLAUDE.md's MAL PKCE
// quirk: `plain` method only, code_challenge must equal code_verifier).
const CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

function randomCodeString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const byte of bytes) out += CODE_CHARSET[byte % CODE_CHARSET.length];
  return out;
}

export function generateCodeVerifier(): string {
  return randomCodeString(64);
}

export function generateOAuthState(): string {
  return randomCodeString(24);
}

export function buildAuthorizeUrl(params: { clientId: string; codeVerifier: string; state: string; redirectUri: string }): string {
  const { clientId, codeVerifier, state, redirectUri } = params;
  const enc = encodeURIComponent;
  return (
    'https://myanimelist.net/v1/oauth2/authorize' +
    `?response_type=code&client_id=${enc(clientId)}&code_challenge=${enc(codeVerifier)}` +
    `&code_challenge_method=plain&state=${enc(state)}&redirect_uri=${enc(redirectUri)}`
  );
}

/** One random code for the sign-in-with-MAL session handoff (see mal_session_handoffs). */
export function generateHandoffCode(): string {
  return randomCodeString(32);
}
