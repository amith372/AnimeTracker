// Pure PKCE helpers for MAL's OAuth2 login — ported from the Kotlin domain/Pkce.kt so the exact
// same generation/URL-building logic (and its test cases) carries over unchanged. Kept here in
// domain/ rather than auth/ because none of it touches I/O beyond expo-crypto's RNG.
import * as Crypto from 'expo-crypto';

const MAL_AUTHORIZE_URL = 'https://myanimelist.net/v1/oauth2/authorize';

// Letters + digits + the RFC 7636 "unreserved" punctuation — safe to send unencoded and wide
// enough that byte % length doesn't need special-casing.
const CODE_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

// Injectable so tests can supply a real/distinct byte source — jest-expo's mocked native crypto
// module returns all-zero bytes, which would make every generated value identical under test.
export type RandomBytes = (length: number) => Uint8Array;
const defaultRandomBytes: RandomBytes = (length) => Crypto.getRandomValues(new Uint8Array(length));

function randomCodeString(length: number, randomBytes: RandomBytes): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const byte of bytes) {
    out += CODE_CHARSET[byte % CODE_CHARSET.length];
  }
  return out;
}

/** 64 random chars — comfortably within MAL's required 43-128 char code_verifier range. */
export function generateCodeVerifier(randomBytes: RandomBytes = defaultRandomBytes): string {
  return randomCodeString(64, randomBytes);
}

export function generateOAuthState(randomBytes: RandomBytes = defaultRandomBytes): string {
  return randomCodeString(24, randomBytes);
}

/**
 * MAL only supports the `plain` PKCE method: code_challenge must equal code_verifier, never
 * SHA256'd — see the MAL PKCE quirk documented in CLAUDE.md. (expo-auth-session's own AuthRequest
 * class actively rejects CodeChallengeMethod.Plain as "not secure", which is why this is
 * hand-built instead of using that library's request builder.)
 */
export function buildAuthorizeUrl(params: {
  clientId: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
}): string {
  const { clientId, codeVerifier, state, redirectUri } = params;
  const enc = encodeURIComponent;
  return (
    `${MAL_AUTHORIZE_URL}` +
    `?response_type=code` +
    `&client_id=${enc(clientId)}` +
    `&code_challenge=${enc(codeVerifier)}` +
    `&code_challenge_method=plain` +
    `&state=${enc(state)}` +
    `&redirect_uri=${enc(redirectUri)}`
  );
}
